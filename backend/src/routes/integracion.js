import { Router } from "express";
import { validarAuthIntegracion } from "../middleware/integracionAuth.js";

function serializarEstado(recorrido) {
  return {
    id: recorrido.id,
    estado: recorrido.estado,
    fleteId: recorrido.fleteId,
    updatedAt: recorrido.updatedAt,
    ultimaUbicacion: recorrido.ultimaUbicacion ?? null,
    puntos: recorrido.puntos.map((p) => ({
      id: p.id,
      orden: p.orden,
      estado: p.estado,
      arriboEn: p.arriboEn,
      descargaEn: p.descargaEn,
    })),
  };
}

export function createIntegracionRouter(store) {
  const router = Router();

  router.use(validarAuthIntegracion);

  router.post("/recorridos", async (req, res) => {
    const payload = req.body || {};
    if (!Array.isArray(payload.recorridos)) {
      return res.status(400).json({ error: "invalid_payload" });
    }

    const upserted = store.upsertRecorridos(payload.recorridos);
    return res.status(200).json({ ok: true, upserted, rejected: payload.recorridos.length - upserted });
  });

  router.get("/estado", async (req, res) => {
    const { recorridoId } = req.query || {};
    const recorridos = store.listarEstado(recorridoId ? String(recorridoId) : null);

    if (recorridoId && recorridos.length === 0) {
      return res.status(404).json({ error: "recorrido_no_encontrado" });
    }

    return res.status(200).json({ recorridos: recorridos.map(serializarEstado) });
  });

  return router;
}
