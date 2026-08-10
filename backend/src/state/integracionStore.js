import { resolverUbicacion } from "../db/ubicacionResolver.js";

function umbralUbicacionMs() {
  return Number(process.env.UBICACION_STALE_MS || 300000);
}

const PUNTO_ESTADO_TRANSICION = {
  arribo: {
    estadoOrigen: "pendiente",
    estadoDestino: "arribado",
    estadoIdempotente: "arribado",
    campoTimestamp: "arriboEn",
    campoLat: "arriboLat",
    campoLon: "arriboLon",
  },
  descarga: {
    estadoOrigen: "arribado",
    estadoDestino: "completado",
    estadoIdempotente: "completado",
    campoTimestamp: "descargaEn",
    campoLat: "descargaLat",
    campoLon: "descargaLon",
  },
};

function calcularProgreso(puntos) {
  const progreso = { pendientes: 0, arribados: 0, completados: 0 };
  for (const p of puntos) {
    if (p.estado === "pendiente") progreso.pendientes += 1;
    else if (p.estado === "arribado") progreso.arribados += 1;
    else if (p.estado === "completado") progreso.completados += 1;
  }
  return progreso;
}

// El chofer ya avanzó este punto (arribado/completado): el próximo push de
// Oracle no debe pisar ese progreso, solo refrescar la topología
// (orden/lat/lon) y los campos informativos (005-chofer-estados-viaje,
// FR-001/FR-004), que no son datos de progreso y siempre pueden actualizarse.
//
// `protegerOrden`: true si el recorrido tiene un reordenamiento de IR PRIMERO
// todavía no leído por Oracle (research.md, Decisión 4) — en ese caso el
// `orden` entrante de Oracle para puntos `pendiente` se ignora (se conserva
// el fijado por el chofer) hasta que `GET /api/integracion/estado` le dé a
// Oracle la oportunidad de leerlo (ver `confirmarSincronizacion` abajo).
function mergearPunto(entrante, previo, protegerOrden = false) {
  if (previo && (previo.estado === "arribado" || previo.estado === "completado")) {
    return {
      ...previo,
      orden: Number(entrante.orden),
      lat: entrante.lat ?? previo.lat,
      lon: entrante.lon ?? previo.lon,
      ...camposInformativos(entrante, previo),
    };
  }
  const ordenProtegido = protegerOrden && previo?.estado === "pendiente";
  return {
    id: String(entrante.id),
    orden: ordenProtegido ? previo.orden : Number(entrante.orden),
    estado: entrante.estado || "pendiente",
    arriboEn: entrante.arriboEn ?? null,
    arriboLat: entrante.arriboLat ?? null,
    arriboLon: entrante.arriboLon ?? null,
    descargaEn: entrante.descargaEn ?? null,
    descargaLat: entrante.descargaLat ?? null,
    descargaLon: entrante.descargaLon ?? null,
    lat: entrante.lat ?? null,
    lon: entrante.lon ?? null,
    ...camposInformativos(entrante, previo),
  };
}

// Campos de solo lectura para el chofer (005-chofer-estados-viaje, FR-002):
// cliente/dirección/rango horario/notas visibles, remitoIds interno (FR-003,
// nunca se sirve al chofer — ver serializePunto en routes/recorrido.js).
function camposInformativos(entrante, previo) {
  return {
    cliente: entrante.cliente ?? previo?.cliente ?? null,
    direccion: entrante.direccion ?? previo?.direccion ?? null,
    rangoHorario: entrante.rangoHorario ?? previo?.rangoHorario ?? null,
    notasEntrega: entrante.notasEntrega ?? previo?.notasEntrega ?? null,
    remitoIds: Array.isArray(entrante.remitoIds) ? entrante.remitoIds : previo?.remitoIds ?? [],
  };
}

export function createIntegracionStore() {
  const recorridos = new Map();
  const recorridoPorFlete = new Map();
  const recorridoPorToken = new Map();

  function indexarRecorrido(recorrido) {
    recorridos.set(String(recorrido.id), recorrido);
    if (recorrido.fleteId != null && recorrido.estado === "activo") {
      recorridoPorFlete.set(String(recorrido.fleteId), String(recorrido.id));
    }
    if (recorrido.token) {
      recorridoPorToken.set(recorrido.token, String(recorrido.id));
    }
  }

  return {
    upsertRecorridos(items = []) {
      let upserted = 0;
      for (const raw of items) {
        if (!raw?.id) continue;
        const id = String(raw.id);
        const previo = recorridos.get(id);
        const puntosPreviosPorId = new Map((previo?.puntos || []).map((p) => [p.id, p]));
        const puntosEntrantes = Array.isArray(raw.puntos) ? raw.puntos : previo?.puntos || [];
        const protegerOrden = previo?.ultimaOperacion?.tipo === "ir-primero" && previo.ultimaOperacion.sincronizada === false;
        const normalizado = {
          id,
          token: raw.token ?? previo?.token ?? null,
          fleteId: raw.fleteId != null ? String(raw.fleteId) : previo?.fleteId ?? null,
          // choferId (2026-08-10, spec.md FR-013): identidad estable del
          // chofer entre recorridos, provista por Oracle — dispara la
          // credencial MQTT permanente (ver emqxProvisioning.js).
          choferId: raw.choferId != null ? String(raw.choferId) : previo?.choferId ?? null,
          // choferNombre (2026-08-10): igual tratamiento que fleteNombre —
          // dato de despliegue para UI, no autoritativo.
          choferNombre: raw.choferNombre ?? previo?.choferNombre ?? null,
          fleteNombre: raw.fleteNombre ?? previo?.fleteNombre ?? null,
          // Un recorrido ya finalizado localmente (todos los puntos
          // completado, ver transicionarPunto) no debe volver a "activo" por
          // un re-push de Oracle — mismo criterio protector que mergearPunto
          // aplica por punto, acá a nivel recorrido (2026-08-10).
          estado: previo?.estado === "finalizado" ? "finalizado" : raw.estado || previo?.estado || "pendiente",
          updatedAt: raw.updatedAt || new Date().toISOString(),
          puntos: puntosEntrantes.map((p) => mergearPunto(p, puntosPreviosPorId.get(String(p.id)), protegerOrden)),
          ultimaUbicacion: previo?.ultimaUbicacion ?? null,
          // Estado de viaje del chofer (005-chofer-estados-viaje): por defecto
          // "detenido" en un recorrido nuevo; se preserva en cada re-push
          // (mismo criterio que el resto de campos de progreso, no de topología).
          viajeEstado: previo?.viajeEstado ?? "detenido",
          puntoActivoId: previo?.puntoActivoId ?? null,
          ultimaOperacion: previo?.ultimaOperacion ?? null,
        };

        indexarRecorrido(normalizado);
        upserted += 1;
      }
      return upserted;
    },

    listarEstado(recorridoId = null) {
      if (recorridoId != null) {
        const r = recorridos.get(String(recorridoId));
        return r ? [r] : [];
      }
      return [...recorridos.values()];
    },

    actualizarUbicacionPorFlete(fleteId, ubicacion) {
      const recorridoId = recorridoPorFlete.get(String(fleteId));
      if (!recorridoId) return false;
      const recorrido = recorridos.get(recorridoId);
      if (!recorrido) return false;
      recorrido.ultimaUbicacion = {
        lat: ubicacion.lat,
        lon: ubicacion.lon,
        en: ubicacion.en,
        eventId: ubicacion.eventId ?? null,
      };
      recorrido.updatedAt = new Date().toISOString();
      return true;
    },

    // Contrato compatible con `repository` de createRecorridoRouter (ver
    // backend/tests/helpers/inMemoryRecorridoRepository.js): permite que el
    // chofer lea/escriba su recorrido sin que el backend cloud toque Oracle.
    async obtenerPorToken(token) {
      const id = recorridoPorToken.get(token);
      const r = id ? recorridos.get(id) : null;
      if (!r) return null;
      const puntos = r.puntos
        .map((p) => ({
          id: p.id,
          orden: p.orden,
          latitud: p.lat,
          longitud: p.lon,
          estado: p.estado,
          arriboEn: p.arriboEn,
          descargaEn: p.descargaEn,
          // Campos informativos visibles para el chofer (005-chofer-estados-viaje,
          // FR-002). `remitoIds` NUNCA se incluye acá a propósito (FR-003): este
          // es el único contrato que alimenta la respuesta del chofer
          // (routes/recorrido.js), así que omitirlo acá es la garantía real de
          // que no llegue a esa pantalla, no solo que la UI no lo renderice.
          cliente: p.cliente,
          direccion: p.direccion,
          rangoHorario: p.rangoHorario,
          notasEntrega: p.notasEntrega,
        }))
        .sort((a, b) => a.orden - b.orden);
      return {
        id: r.id,
        fleteId: r.fleteId,
        choferId: r.choferId, 
        estado: r.estado,
        puntos,
        progreso: calcularProgreso(puntos),
        viajeEstado: r.viajeEstado,
        puntoActivoId: r.puntoActivoId,
        // FR-019: el botón CANCELAR solo se ofrece si hay una operación
        // reciente todavía no leída por Oracle — sobrevive a un reload de
        // página, a diferencia de una acción encolada offline (FR-020a, que
        // el servidor ni siquiera llegó a ver).
        puedeCancelar: Boolean(r.ultimaOperacion && !r.ultimaOperacion.sincronizada),
      };
    },

    async marcarArribo(token, puntoId, ubicacion) {
      return transicionarPunto(recorridoPorToken, recorridos, token, puntoId, ubicacion, PUNTO_ESTADO_TRANSICION.arribo);
    },

    async marcarDescarga(token, puntoId, ubicacion) {
      return transicionarPunto(recorridoPorToken, recorridos, token, puntoId, ubicacion, PUNTO_ESTADO_TRANSICION.descarga);
    },

    // Estado de viaje guiado (005-chofer-estados-viaje, FR-005 a FR-013):
    // Detenido -> (iniciarViaje) -> Manejando -> (registrarLlegue) ->
    // Descargando -> (registrarDescargaCompleta) -> Detenido. Gating
    // server-side (research.md, Decisión 7): cada mutador valida su propio
    // `viajeEstado` de origen antes de aplicar nada, igual que ya hace
    // `transicionarPunto` con el estado por punto.
    async iniciarViaje(token) {
      const r = recorridoDeToken(recorridoPorToken, recorridos, token);
      if (!r) return { outcome: "invalid_token" };
      if (r.viajeEstado !== "detenido") {
        return { outcome: "conflict", viajeEstado: r.viajeEstado, puntoActivoId: r.puntoActivoId };
      }
      const primerPendiente = [...r.puntos].filter((p) => p.estado === "pendiente").sort((a, b) => a.orden - b.orden)[0];
      if (!primerPendiente) {
        return { outcome: "conflict", viajeEstado: r.viajeEstado, puntoActivoId: null };
      }
      r.ultimaOperacion = {
        tipo: "iniciar",
        puntoId: primerPendiente.id,
        snapshotPrevio: { viajeEstado: "detenido", puntoActivoId: null },
        sincronizada: false,
        en: new Date().toISOString(),
      };
      r.puntoActivoId = primerPendiente.id;
      r.viajeEstado = "manejando";
      return { outcome: "ok", viajeEstado: r.viajeEstado, puntoActivoId: r.puntoActivoId };
    },

    async registrarLlegue(token, ubicacion) {
      const r = recorridoDeToken(recorridoPorToken, recorridos, token);
      if (!r) return { outcome: "invalid_token" };
      if (r.viajeEstado !== "manejando") {
        return { outcome: "conflict", viajeEstado: r.viajeEstado, puntoActivoId: r.puntoActivoId };
      }
      const puntoActivoId = r.puntoActivoId;
      const resultado = transicionarPunto(recorridoPorToken, recorridos, token, puntoActivoId, ubicacion, PUNTO_ESTADO_TRANSICION.arribo);
      if (resultado.outcome !== "ok") return resultado;
      r.viajeEstado = "descargando";
      r.ultimaOperacion = {
        tipo: "llegue",
        puntoId: puntoActivoId,
        snapshotPrevio: { viajeEstado: "manejando", puntoActivoId, puntoEstado: "pendiente", arriboEn: null, arriboLat: null, arriboLon: null },
        sincronizada: false,
        en: new Date().toISOString(),
      };
      return { outcome: "ok", viajeEstado: r.viajeEstado, puntoActivoId: r.puntoActivoId, punto: resultado.punto };
    },

    async registrarDescargaCompleta(token, ubicacion) {
      const r = recorridoDeToken(recorridoPorToken, recorridos, token);
      if (!r) return { outcome: "invalid_token" };
      if (r.viajeEstado !== "descargando") {
        return { outcome: "conflict", viajeEstado: r.viajeEstado, puntoActivoId: r.puntoActivoId };
      }
      const puntoActivoId = r.puntoActivoId;
      const resultado = transicionarPunto(recorridoPorToken, recorridos, token, puntoActivoId, ubicacion, PUNTO_ESTADO_TRANSICION.descarga);
      if (resultado.outcome !== "ok") return resultado;
      r.viajeEstado = "detenido";
      r.puntoActivoId = null;
      r.ultimaOperacion = {
        tipo: "descarga-completa",
        puntoId: puntoActivoId,
        snapshotPrevio: { viajeEstado: "descargando", puntoActivoId, puntoEstado: "arribado", descargaEn: null, descargaLat: null, descargaLon: null },
        sincronizada: false,
        en: new Date().toISOString(),
      };
      return { outcome: "ok", viajeEstado: r.viajeEstado, puntoActivoId: null, punto: resultado.punto };
    },

    // CANCELAR (005-chofer-estados-viaje, FR-017 a FR-020): revierte
    // `ultimaOperacion` desde su `snapshotPrevio`, solo si Oracle todavía no
    // la leyó (`sincronizada === false`, research.md Decisión 3). No es una
    // transición pública nueva del state-machine de puntos — es una
    // restauración puntual acotada a la última operación.
    async cancelarUltimaOperacion(token) {
      const r = recorridoDeToken(recorridoPorToken, recorridos, token);
      if (!r) return { outcome: "invalid_token" };
      const op = r.ultimaOperacion;
      if (!op || op.sincronizada) {
        return { outcome: "conflict" };
      }

      if (op.tipo === "ir-primero") {
        const ordenPorId = new Map(op.snapshotPrevio.ordenPrevio.map((x) => [x.puntoId, x.orden]));
        for (const p of r.puntos) {
          if (ordenPorId.has(p.id)) p.orden = ordenPorId.get(p.id);
        }
      } else {
        const snap = op.snapshotPrevio;
        r.viajeEstado = snap.viajeEstado;
        r.puntoActivoId = snap.puntoActivoId ?? null;
        const punto = r.puntos.find((p) => p.id === op.puntoId);
        if (punto && snap.puntoEstado) {
          punto.estado = snap.puntoEstado;
          if ("arriboEn" in snap) {
            punto.arriboEn = snap.arriboEn;
            punto.arriboLat = snap.arriboLat;
            punto.arriboLon = snap.arriboLon;
          }
          if ("descargaEn" in snap) {
            punto.descargaEn = snap.descargaEn;
            punto.descargaLat = snap.descargaLat;
            punto.descargaLon = snap.descargaLon;
          }
        }
      }

      r.ultimaOperacion = null;
      return { outcome: "ok", viajeEstado: r.viajeEstado, puntoActivoId: r.puntoActivoId };
    },

    // IR PRIMERO (005-chofer-estados-viaje, FR-014 a FR-016): mueve `puntoId`
    // al frente de los puntos `pendiente`, permutando `orden` únicamente
    // entre esos puntos (nunca toca el de puntos ya arribado/completado).
    // Deja registrada `ultimaOperacion` sin sincronizar para que
    // `mergearPunto` la proteja de un re-push de Oracle con el orden viejo
    // (research.md, Decisión 4) y para que CANCELAR pueda revertirla
    // mientras Oracle no la haya leído (Decisión 3).
    async moverPrimero(token, puntoId) {
      const r = recorridoDeToken(recorridoPorToken, recorridos, token);
      if (!r) return { outcome: "invalid_token" };
      if (r.viajeEstado !== "detenido") {
        return { outcome: "conflict", motivo: "viaje_no_detenido" };
      }

      const pendientes = [...r.puntos].filter((p) => p.estado === "pendiente").sort((a, b) => a.orden - b.orden);
      const objetivo = pendientes.find((p) => p.id === String(puntoId));
      if (!objetivo) {
        const existeEnRecorrido = r.puntos.some((p) => p.id === String(puntoId));
        return existeEnRecorrido ? { outcome: "conflict", motivo: "no_pendiente" } : { outcome: "not_found" };
      }
      if (pendientes.length < 2) {
        return { outcome: "conflict", motivo: "sin_otros_pendientes" };
      }
      if (objetivo.id === pendientes[0].id) {
        return { outcome: "conflict", motivo: "ya_es_primero" };
      }

      const ordenPrevio = pendientes.map((p) => ({ puntoId: p.id, orden: p.orden }));
      const ordenesDisponibles = pendientes.map((p) => p.orden).sort((a, b) => a - b);
      const resto = pendientes.filter((p) => p.id !== objetivo.id);
      objetivo.orden = ordenesDisponibles[0];
      resto.forEach((p, i) => {
        p.orden = ordenesDisponibles[i + 1];
      });

      r.ultimaOperacion = {
        tipo: "ir-primero",
        puntoId: objetivo.id,
        snapshotPrevio: { ordenPrevio },
        sincronizada: false,
        en: new Date().toISOString(),
      };

      const puntosPendientesActualizados = [...r.puntos]
        .filter((p) => p.estado === "pendiente")
        .sort((a, b) => a.orden - b.orden)
        .map((p) => ({ id: p.id, orden: p.orden }));
      return { outcome: "ok", puntos: puntosPendientesActualizados };
    },

    // Confirma que Oracle tuvo la oportunidad de leer el estado actual de un
    // recorrido (llamado desde GET /api/integracion/estado por cada
    // recorrido efectivamente servido en la respuesta) — a partir de acá
    // `ultimaOperacion` deja de ser cancelable (research.md, Decisión 3) y
    // `mergearPunto` deja de proteger su `orden` (Decisión 4).
    confirmarSincronizacion(recorridoId) {
      const r = recorridos.get(String(recorridoId));
      if (r?.ultimaOperacion && r.ultimaOperacion.sincronizada === false) {
        r.ultimaOperacion = { ...r.ultimaOperacion, sincronizada: true };
      }
    },

    // Contrato compatible con `repository` de createCentralRouter (ver
    // backend/tests/helpers/inMemoryCentralRepository.js): Central en cloud
    // es de solo lectura (la asignación de flete ocurre en Oracle/APEX antes
    // del push), así que solo hacen falta estos 3 métodos de consulta.
    async listarActivos() {
      const ahora = Date.now();
      const staleMs = umbralUbicacionMs();
      const resultado = [];
      for (const r of recorridos.values()) {
        if (r.estado !== "activo" || r.fleteId == null) continue;
        resultado.push({
          id: r.id,
          flete: { id: r.fleteId, nombre: r.fleteNombre },
          progreso: calcularProgreso(r.puntos),
          ultimaUbicacion: resolverUbicacion({ enMemoria: r.ultimaUbicacion, respaldoOracle: null, staleMs, ahora }),
          // Visible para Central en (casi) tiempo real vía el mismo polling
          // ya existente (005-chofer-estados-viaje, FR-021 — research.md,
          // Decisión 6: sin tópico MQTT nuevo).
          viajeEstado: r.viajeEstado,
          puntoActivoId: r.puntoActivoId,
        });
      }
      return resultado;
    },

    async listarHistorial() {
      const resultado = [];
      for (const r of recorridos.values()) {
        if (r.estado !== "finalizado") continue;
        resultado.push({
          recorrido: { id: r.id, estado: r.estado, fleteId: r.fleteId },
          puntos: serializarPuntosCentral(r.puntos),
        });
      }
      return resultado;
    },

    async obtenerDetalle(id) {
      const r = recorridos.get(String(id));
      if (!r) return null;
      return {
        recorrido: { id: r.id, estado: r.estado, fleteId: r.fleteId },
        puntos: serializarPuntosCentral(r.puntos),
      };
    },
  };
}

// `lat`/`lon` (004-mapa-seguimiento-central, FR-006): topología fija del
// punto (destino de entrega), no el GPS de auditoría de arribo/descarga
// (arriboLat/arriboLon), que sigue sin exponerse a Central.
function serializarPuntosCentral(puntos) {
  return puntos
    .map((p) => ({
      id: p.id,
      orden: p.orden,
      lat: p.lat,
      lon: p.lon,
      estado: p.estado,
      arriboEn: p.arriboEn,
      descargaEn: p.descargaEn,
      // remitoIds SÍ es visible para Central (005-chofer-estados-viaje,
      // FR-003 — "control interno"), a diferencia de serializePunto en
      // routes/recorrido.js (chofer), que lo omite a propósito.
      remitoIds: p.remitoIds ?? [],
    }))
    .sort((a, b) => a.orden - b.orden);
}

function recorridoDeToken(recorridoPorToken, recorridos, token) {
  const id = recorridoPorToken.get(token);
  return id ? recorridos.get(id) : null;
}

function serializarPuntoTransicion(punto) {
  return {
    id: punto.id,
    orden: punto.orden,
    latitud: punto.lat,
    longitud: punto.lon,
    estado: punto.estado,
    arriboEn: punto.arriboEn,
    descargaEn: punto.descargaEn,
  };
}

// `ubicacion` es el GPS del celular del chofer en el momento de marcar (no la
// topología del punto): dato de auditoría — de dónde vino el chofer al
// marcar arribo/descarga — que Oracle/APEX consume vía GET /api/integracion/estado.
// Solo se captura en la transición real, no en repeticiones idempotentes, para
// no pisar el primer registro con una posición GPS posterior.
function transicionarPunto(recorridoPorToken, recorridos, token, puntoId, ubicacion, { estadoOrigen, estadoDestino, estadoIdempotente, campoTimestamp, campoLat, campoLon }) {
  const r = recorridoDeToken(recorridoPorToken, recorridos, token);
  if (!r) return { outcome: "invalid_token" };
  const punto = r.puntos.find((p) => p.id === String(puntoId));
  if (!punto) return { outcome: "not_found" };

  if (punto.estado === estadoOrigen) {
    punto.estado = estadoDestino;
    punto[campoTimestamp] = new Date().toISOString();
    if (ubicacion?.lat != null && ubicacion?.lon != null) {
      punto[campoLat] = ubicacion.lat;
      punto[campoLon] = ubicacion.lon;
    }
  } else if (punto.estado !== estadoIdempotente) {
    return { outcome: "conflict", punto: serializarPuntoTransicion(punto) };
  }

  // 2026-08-10: cierre automático del recorrido cuando el último punto pasa
  // a "completado" — no depende de un nuevo push de Oracle (que ahora solo
  // sincroniza recorridos activos, nunca reenvía con estado "finalizado") ni
  // de un comando aparte del chofer: es la acción "Descarga completa" sobre
  // el último punto pendiente, ya existente en RouteView.jsx. Sin esto,
  // listarHistorial() nunca devolvía nada (nada ponía estado="finalizado") y
  // el recorrido quedaba mostrado como activo en Central indefinidamente.
  if (r.puntos.length > 0 && r.puntos.every((p) => p.estado === "completado")) {
    r.estado = "finalizado";
  }

  return { outcome: "ok", punto: serializarPuntoTransicion(punto) };
}

export const integracionStoreCompartido = createIntegracionStore();
