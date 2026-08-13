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
      // inicioEn (008-registro-inicio-fin-recorrido): mismo nivel que
      // arriboEn/descargaEn ya expuestos acá.
      inicioEn: p.inicioEn ?? null,
      arriboEn: p.arriboEn ?? null,
      descargaEn: p.descargaEn ?? null,
      // remitoIds SÍ es visible para Central (005-chofer-estados-viaje,
      // FR-003 — "control interno"), a diferencia de recorrido.js (chofer).
      remitoIds: p.remitoIds ?? [],
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
        updatedAt: r.updatedAt ?? null,
        // cierreEn (008-registro-inicio-fin-recorrido): nunca viene de Oracle,
        // solo lo escribiría finalizarRecorrido() en el store real — acá se
        // toma del seed de test tal cual.
        cierreEn: r.cierreEn ?? null,
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
          updatedAt: r.updatedAt,
          progreso: calcularProgreso(r.puntos),
          ultimaUbicacion: {
            lat: flete?.ultimaUbicacionLat ?? null,
            lon: flete?.ultimaUbicacionLon ?? null,
            en: flete?.ultimaUbicacionEn ?? null,
            reciente: ultimaEnMs != null ? now() - ultimaEnMs <= staleMs : false,
          },
          // esperandoFinalizar (008-registro-inicio-fin-recorrido, research.md
          // Decisión 5): mismo cálculo derivado que el store real.
          esperandoFinalizar: r.puntos.length > 0 && r.puntos.every((p) => p.estado === "completado"),
        });
      }
      return resultado;
    },

    async obtenerDetalle(recorridoId) {
      const r = recorridos.get(recorridoId);
      if (!r) return null;
      return {
        recorrido: { id: r.id, estado: r.estado, fleteId: r.fleteId, updatedAt: r.updatedAt, cierreEn: r.cierreEn },
        puntos: serializarPuntos(r.puntos),
      };
    },

    async listarHistorial() {
      const resultado = [];
      for (const r of recorridos.values()) {
        if (r.estado !== "finalizado") continue;
        resultado.push({
          recorrido: { id: r.id, estado: r.estado, fleteId: r.fleteId, cierreEn: r.cierreEn },
          puntos: serializarPuntos(r.puntos),
        });
      }
      return resultado;
    },
  };
}
