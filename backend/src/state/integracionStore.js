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
// Oracle no debe pisar ese progreso, solo refrescar la topología (orden/lat/lon).
function mergearPunto(entrante, previo) {
  if (previo && (previo.estado === "arribado" || previo.estado === "completado")) {
    return {
      ...previo,
      orden: Number(entrante.orden),
      lat: entrante.lat ?? previo.lat,
      lon: entrante.lon ?? previo.lon,
    };
  }
  return {
    id: String(entrante.id),
    orden: Number(entrante.orden),
    estado: entrante.estado || "pendiente",
    arriboEn: entrante.arriboEn ?? null,
    arriboLat: entrante.arriboLat ?? null,
    arriboLon: entrante.arriboLon ?? null,
    descargaEn: entrante.descargaEn ?? null,
    descargaLat: entrante.descargaLat ?? null,
    descargaLon: entrante.descargaLon ?? null,
    lat: entrante.lat ?? null,
    lon: entrante.lon ?? null,
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
        const normalizado = {
          id,
          token: raw.token ?? previo?.token ?? null,
          fleteId: raw.fleteId != null ? String(raw.fleteId) : previo?.fleteId ?? null,
          fleteNombre: raw.fleteNombre ?? previo?.fleteNombre ?? null,
          estado: raw.estado || previo?.estado || "pendiente",
          updatedAt: raw.updatedAt || new Date().toISOString(),
          puntos: puntosEntrantes.map((p) => mergearPunto(p, puntosPreviosPorId.get(String(p.id)))),
          ultimaUbicacion: previo?.ultimaUbicacion ?? null,
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
        }))
        .sort((a, b) => a.orden - b.orden);
      return { id: r.id, fleteId: r.fleteId, estado: r.estado, puntos, progreso: calcularProgreso(puntos) };
    },

    async marcarArribo(token, puntoId, ubicacion) {
      return transicionarPunto(recorridoPorToken, recorridos, token, puntoId, ubicacion, PUNTO_ESTADO_TRANSICION.arribo);
    },

    async marcarDescarga(token, puntoId, ubicacion) {
      return transicionarPunto(recorridoPorToken, recorridos, token, puntoId, ubicacion, PUNTO_ESTADO_TRANSICION.descarga);
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

function serializarPuntosCentral(puntos) {
  return puntos
    .map((p) => ({ id: p.id, orden: p.orden, estado: p.estado, arriboEn: p.arriboEn, descargaEn: p.descargaEn }))
    .sort((a, b) => a.orden - b.orden);
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
  const id = recorridoPorToken.get(token);
  const r = id ? recorridos.get(id) : null;
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

  return { outcome: "ok", punto: serializarPuntoTransicion(punto) };
}

export const integracionStoreCompartido = createIntegracionStore();
