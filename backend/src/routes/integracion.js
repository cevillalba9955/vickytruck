import { Router } from "express";
import { validarAuthIntegracion } from "../middleware/integracionAuth.js";
import { emqxProvisioningCompartido } from "../mqtt/emqxProvisioning.js";

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
      arriboLat: p.arriboLat ?? null,
      arriboLon: p.arriboLon ?? null,
      descargaEn: p.descargaEn,
      descargaLat: p.descargaLat ?? null,
      descargaLon: p.descargaLon ?? null,
    })),
  };
}

export function createIntegracionRouter(store, emqxProvisioning = emqxProvisioningCompartido) {
  const router = Router();

  router.use(validarAuthIntegracion);

  router.post("/recorridos", async (req, res) => {
    const payload = req.body || {};
    if (!Array.isArray(payload.recorridos)) {
      return res.status(400).json({ error: "invalid_payload" });
    }

    const upserted = store.upsertRecorridos(payload.recorridos);

    // Aprovisiona (o refresca) la credencial MQTT publish-only de cada flete
    // recibido, para que ya esté lista en EMQX Cloud antes de que el chofer
    // abra el link (ver emqxProvisioning.js). Fire-and-forget: un EMQX Cloud
    // lento/caído no debe bloquear ni fallar este push de Oracle/APEX — se
    // reintenta solo en el próximo push del mismo recorrido (idempotente).
    for (const raw of payload.recorridos) {
      if (!raw?.id) continue;
      const [actual] = store.listarEstado(String(raw.id));
      if (!actual?.fleteId) continue;
      emqxProvisioning.provisionarCredencial(actual.fleteId).catch((err) => {
        console.error(`[integracion] no se pudo aprovisionar MQTT para fleteId=${actual.fleteId}:`, err.message);
      });
    }

    return res.status(200).json({ ok: true, upserted, rejected: payload.recorridos.length - upserted });
  });

  router.get("/estado", async (req, res) => {
    const { recorridoId } = req.query || {};
    const recorridos = store.listarEstado(recorridoId ? String(recorridoId) : null);

    if (recorridoId && recorridos.length === 0) {
      return res.status(404).json({ error: "recorrido_no_encontrado" });
    }

    if (recorridoId) {
      return res.status(200).json({ recorridos: recorridos.map(serializarEstado) });
    }

    const limit = Math.max(1, Number(req.query?.limit || 50));
    const offset = Math.max(0, Number(req.query?.offset || 0));
    const page = recorridos.slice(offset, offset + limit).map(serializarEstado);

    return res.status(200).json({
      recorridos: page,
      paginacion: {
        total: recorridos.length,
        limit,
        offset,
        hasNext: offset + limit < recorridos.length,
      },
    });
  });

  return router;
}
