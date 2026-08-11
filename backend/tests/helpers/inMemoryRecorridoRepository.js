// Repositorio en memoria que implementa el mismo contrato que
// createOracleRecorridoRepository, para poder testear el contrato HTTP sin
// depender de una conexión Oracle real.
import { ahoraLocalIso } from "../../src/util/tiempo.js";

function calcularProgreso(puntos) {
  const progreso = { pendientes: 0, arribados: 0, completados: 0 };
  for (const p of puntos) {
    if (p.estado === "pendiente") progreso.pendientes += 1;
    else if (p.estado === "arribado") progreso.arribados += 1;
    else if (p.estado === "completado") progreso.completados += 1;
  }
  return progreso;
}

export function createInMemoryRecorridoRepository(seedRecorridos) {
  const recorridos = new Map(
    seedRecorridos.map((r) => [
      r.token,
      {
        id: r.id ?? r.token,
        fleteId: r.fleteId ?? null,
        choferId: r.choferId ?? null,
        estado: r.estado ?? "activo",
        puntos: r.puntos.map((p) => ({ ...p })),
      },
    ]),
  );

  function transicionar(token, puntoId, ubicacion, opts) {
    const r = recorridos.get(token);
    if (!r) return { outcome: "invalid_token" };
    const punto = r.puntos.find((p) => p.id === puntoId);
    if (!punto) return { outcome: "not_found" };

    if (punto.estado === opts.estadoOrigen) {
      punto.estado = opts.estadoDestino;
      punto[opts.campoTimestamp] = ahoraLocalIso();
      return { outcome: "ok", punto: { ...punto } };
    }
    if (punto.estado === opts.estadoIdempotente) {
      return { outcome: "ok", punto: { ...punto } };
    }
    return { outcome: "conflict", punto: { ...punto } };
  }

  return {
    async obtenerPorToken(token) {
      const r = recorridos.get(token);
      if (!r) return null;
      // Mismo contrato que el repositorio Oracle: los puntos vienen ordenados
      // por `orden` (ORDER BY orden en la query real).
      const puntos = r.puntos.map((p) => ({ ...p })).sort((a, b) => a.orden - b.orden);
      return { id: r.id, fleteId: r.fleteId, choferId: r.choferId, estado: r.estado, puntos, progreso: calcularProgreso(puntos) };
    },

    async marcarArribo(token, puntoId, ubicacion) {
      return transicionar(token, puntoId, ubicacion, {
        estadoOrigen: "pendiente",
        estadoDestino: "arribado",
        estadoIdempotente: "arribado",
        campoTimestamp: "arriboEn",
      });
    },

    async marcarDescarga(token, puntoId, ubicacion) {
      return transicionar(token, puntoId, ubicacion, {
        estadoOrigen: "arribado",
        estadoDestino: "completado",
        estadoIdempotente: "completado",
        campoTimestamp: "descargaEn",
      });
    },
  };
}
