// Repositorio en memoria que implementa el mismo contrato que
// createOracleCentralRepository, para poder testear el contrato HTTP de
// Central sin depender de una conexión Oracle real.

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
  let tokenCounter = 0;
  const generarToken = opts.generarToken ?? (() => `tok-test-${++tokenCounter}`);
  // 003-mqtt-broker-fletes (US3): mismo contrato que createOracleCentralRepository
  // — reasignar revoca la credencial MQTT del token anterior. Sin emqxProvisioning
  // inyectado, es un no-op (la mayoría de los tests de 002 no necesitan esto).
  const emqxProvisioning = opts.emqxProvisioning ?? { async revocarCredencial() {} };

  const recorridos = new Map(
    (seed.recorridos || []).map((r) => [
      r.id,
      {
        id: r.id,
        estado: r.estado ?? "activo",
        fleteId: r.fleteId ?? null,
        token: r.token ?? null,
        asignadoEn: r.asignadoEn ?? null,
        // Referencia directa (sin clonar): permite que un test simule un
        // cambio de estado externo (p. ej. hecho por recorridoRepository al
        // marcar arribo/descarga) mutando el mismo array/objeto de puntos,
        // igual que en producción ambos repositorios leen la misma fuente
        // Oracle (Principio IV).
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

  function fleteOcupado(fleteId, excluirRecorridoId) {
    for (const r of recorridos.values()) {
      if (r.fleteId === fleteId && r.estado === "activo" && r.id !== excluirRecorridoId) return true;
    }
    return false;
  }

  return {
    async listarActivos() {
      const resultado = [];
      for (const r of recorridos.values()) {
        if (r.estado !== "activo" || r.fleteId == null) continue;
        const flete = fletes.get(r.fleteId);
        const ultimaEnMs = flete?.ultimaUbicacionEn ? new Date(flete.ultimaUbicacionEn).getTime() : null;
        resultado.push({
          id: r.id,
          token: r.token,
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

    async listarDisponibles() {
      const resultado = [];
      for (const r of recorridos.values()) {
        if (r.fleteId != null) continue;
        resultado.push({ id: r.id, totalPuntos: r.puntos.length });
      }
      return resultado;
    },

    async listarFletesDisponibles() {
      const resultado = [];
      for (const f of fletes.values()) {
        const ocupado = [...recorridos.values()].some((r) => r.fleteId === f.id && r.estado === "activo");
        if (!ocupado) resultado.push({ id: f.id, nombre: f.nombre });
      }
      return resultado;
    },

    async asignar(recorridoId, fleteId) {
      const r = recorridos.get(recorridoId);
      if (!r) return { outcome: "not_found" };
      if (r.fleteId != null) return { outcome: "ya_asignado" };
      if (fleteOcupado(fleteId, recorridoId)) return { outcome: "flete_ocupado" };

      r.fleteId = fleteId;
      r.estado = "activo";
      r.token = generarToken();
      r.asignadoEn = new Date(now()).toISOString();
      return {
        outcome: "ok",
        recorrido: { recorridoId, fleteId, token: r.token, asignadoEn: r.asignadoEn },
      };
    },

    async reasignar(recorridoId, fleteId) {
      const r = recorridos.get(recorridoId);
      if (!r || r.estado !== "activo") return { outcome: "not_found" };
      if (fleteOcupado(fleteId, recorridoId)) return { outcome: "flete_ocupado" };

      const tokenAnterior = r.token;
      r.fleteId = fleteId;
      r.token = generarToken();
      r.asignadoEn = new Date(now()).toISOString();
      if (tokenAnterior) await emqxProvisioning.revocarCredencial(tokenAnterior);
      return {
        outcome: "ok",
        recorrido: { recorridoId, fleteId, token: r.token, asignadoEn: r.asignadoEn },
      };
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
