const PUNTO_ESTADO_TRANSICION = {
  arribo: { estadoOrigen: "pendiente", estadoDestino: "arribado", estadoIdempotente: "arribado", campoTimestamp: "arriboEn" },
  descarga: { estadoOrigen: "arribado", estadoDestino: "completado", estadoIdempotente: "completado", campoTimestamp: "descargaEn" },
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
    descargaEn: entrante.descargaEn ?? null,
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
      return { id: r.id, estado: r.estado, puntos, progreso: calcularProgreso(puntos) };
    },

    async marcarArribo(token, puntoId, ubicacion) {
      return transicionarPunto(recorridoPorToken, recorridos, token, puntoId, PUNTO_ESTADO_TRANSICION.arribo);
    },

    async marcarDescarga(token, puntoId, ubicacion) {
      return transicionarPunto(recorridoPorToken, recorridos, token, puntoId, PUNTO_ESTADO_TRANSICION.descarga);
    },
  };
}

function transicionarPunto(recorridoPorToken, recorridos, token, puntoId, { estadoOrigen, estadoDestino, estadoIdempotente, campoTimestamp }) {
  const id = recorridoPorToken.get(token);
  const r = id ? recorridos.get(id) : null;
  if (!r) return { outcome: "invalid_token" };
  const punto = r.puntos.find((p) => p.id === String(puntoId));
  if (!punto) return { outcome: "not_found" };

  if (punto.estado === estadoOrigen) {
    punto.estado = estadoDestino;
    punto[campoTimestamp] = new Date().toISOString();
  } else if (punto.estado !== estadoIdempotente) {
    return {
      outcome: "conflict",
      punto: { id: punto.id, orden: punto.orden, latitud: punto.lat, longitud: punto.lon, estado: punto.estado, arriboEn: punto.arriboEn, descargaEn: punto.descargaEn },
    };
  }

  return {
    outcome: "ok",
    punto: { id: punto.id, orden: punto.orden, latitud: punto.lat, longitud: punto.lon, estado: punto.estado, arriboEn: punto.arriboEn, descargaEn: punto.descargaEn },
  };
}

export const integracionStoreCompartido = createIntegracionStore();
