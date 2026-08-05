// Repositorio en memoria que implementa el mismo contrato que el store real
// (integracionStore) para testear el contrato HTTP de Central (solo lectura
// — la asignación de flete ocurre en Oracle/APEX antes del push, ver
// specs/003-arquitectura-cloud-mqtt/contracts/integracion-api.md) sin
// depender de una instancia real.

function calcularProgreso(puntos) {
  const progreso = { pendientes: 0, arribados: 0, completados: 0 };
  for (const p of puntos) {
    if (p.estado === "pendiente") progreso.pendientes += 1;
    else if (p.estado === "arribado") progreso.arribados += 1;
    else if (p.estado === "completado") progreso.completados += 1;
  }
  return progreso;
}

function serializarPuntos(puntos) {
  return puntos
    .map((p) => ({
      id: p.id,
      orden: p.orden,
      estado: p.estado,
      arriboEn: p.arriboEn ?? null,
      descargaEn: p.descargaEn ?? null,
    }))
    .sort((a, b) => a.orden - b.orden);
}

export function createInMemoryCentralRepository(seed = {}, opts = {}) {
  const staleMs = opts.staleMs ?? 300000;
  const now = opts.now ?? (() => Date.now());

  const recorridos = new Map(
    (seed.recorridos || []).map((r) => [
      r.id,
      {
        id: r.id,
        estado: r.estado ?? "activo",
        fleteId: r.fleteId ?? null,
        puntos: r.puntos || [],
      },
    ]),
  );

  const fletes = new Map(
    (seed.fletes || []).map((f) => [
      f.id,
      {
        id: f.id,
        nombre: f.nombre,
        ultimaUbicacionLat: f.ultimaUbicacionLat ?? null,
        ultimaUbicacionLon: f.ultimaUbicacionLon ?? null,
        ultimaUbicacionEn: f.ultimaUbicacionEn ?? null,
      },
    ]),
  );

  return {
    async listarActivos() {
      const resultado = [];
      for (const r of recorridos.values()) {
        if (r.estado !== "activo" || r.fleteId == null) continue;
        const flete = fletes.get(r.fleteId);
        const ultimaEnMs = flete?.ultimaUbicacionEn ? new Date(flete.ultimaUbicacionEn).getTime() : null;
        resultado.push({
          id: r.id,
          flete: { id: r.fleteId, nombre: flete?.nombre ?? null },
          progreso: calcularProgreso(r.puntos),
          ultimaUbicacion: {
            lat: flete?.ultimaUbicacionLat ?? null,
            lon: flete?.ultimaUbicacionLon ?? null,
            en: flete?.ultimaUbicacionEn ?? null,
            reciente: ultimaEnMs != null ? now() - ultimaEnMs <= staleMs : false,
          },
        });
      }
      return resultado;
    },

    async obtenerDetalle(recorridoId) {
      const r = recorridos.get(recorridoId);
      if (!r) return null;
      return {
        recorrido: { id: r.id, estado: r.estado, fleteId: r.fleteId },
        puntos: serializarPuntos(r.puntos),
      };
    },

    async listarHistorial() {
      const resultado = [];
      for (const r of recorridos.values()) {
        if (r.estado !== "finalizado") continue;
        resultado.push({
          recorrido: { id: r.id, estado: r.estado, fleteId: r.fleteId },
          puntos: serializarPuntos(r.puntos),
        });
      }
      return resultado;
    },
  };
}
