export function createIntegracionStore() {
  const recorridos = new Map();
  const recorridoPorFlete = new Map();

  function indexarRecorrido(recorrido) {
    recorridos.set(String(recorrido.id), recorrido);
    if (recorrido.fleteId != null && recorrido.estado === "activo") {
      recorridoPorFlete.set(String(recorrido.fleteId), String(recorrido.id));
    }
  }

  return {
    upsertRecorridos(items = []) {
      let upserted = 0;
      for (const raw of items) {
        if (!raw?.id) continue;
        const id = String(raw.id);
        const previo = recorridos.get(id);
        const puntos = Array.isArray(raw.puntos) ? raw.puntos : previo?.puntos || [];
        const normalizado = {
          id,
          fleteId: raw.fleteId != null ? String(raw.fleteId) : previo?.fleteId ?? null,
          estado: raw.estado || previo?.estado || "pendiente",
          updatedAt: raw.updatedAt || new Date().toISOString(),
          puntos: puntos.map((p) => ({
            id: String(p.id),
            orden: Number(p.orden),
            estado: p.estado || "pendiente",
            arriboEn: p.arriboEn ?? null,
            descargaEn: p.descargaEn ?? null,
            lat: p.lat ?? null,
            lon: p.lon ?? null,
          })),
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
  };
}

export const integracionStoreCompartido = createIntegracionStore();
