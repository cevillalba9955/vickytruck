import { Router } from "express";

function serializeAsignacion(recorrido, { tokenAnteriorInvalidado } = {}) {
  const body = {
    recorridoId: recorrido.recorridoId,
    fleteId: recorrido.fleteId,
    token: recorrido.token,
    asignadoEn: recorrido.asignadoEn,
  };
  if (tokenAnteriorInvalidado) body.tokenAnteriorInvalidado = true;
  return body;
}

function responderAsignacion(res, resultado, opts) {
  if (resultado.outcome === "not_found") {
    return res.status(404).json({ error: "recorrido_no_encontrado" });
  }
  if (resultado.outcome === "ya_asignado") {
    return res.status(409).json({ error: "ya_asignado" });
  }
  if (resultado.outcome === "flete_ocupado") {
    return res.status(409).json({ error: "flete_ocupado" });
  }
  return res.status(200).json(serializeAsignacion(resultado.recorrido, opts));
}

/**
 * Router del panel de Central. Recibe el repositorio por parámetro (no lo
 * construye) para poder testear el contrato HTTP con un repositorio en
 * memoria, sin depender de una conexión Oracle real (ver
 * backend/tests/contract, backend/tests/helpers/inMemoryCentralRepository.js).
 */
export function createCentralRouter(repository) {
  const router = Router();

  // GET /api/central/mqtt-config — 003-mqtt-broker-fletes (FR-005, Clarifications
  // de spec.md): credencial de servicio de solo lectura para que Central se
  // suscriba directamente al bróker, sin compilarla dentro del bundle de
  // central/ (ver contracts/mqtt-canal.md).
  router.get("/mqtt-config", (req, res) => {
    res.json({
      url: process.env.EMQX_WSS_URL,
      username: process.env.EMQX_CENTRAL_USERNAME,
      password: process.env.EMQX_CENTRAL_PASSWORD,
      ubicacionTopicFilter: "vickytruck/fletes/+/ubicacion",
      eventosTopicFilter: "vickytruck/fletes/+/eventos",
    });
  });

  // GET /api/central/recorridos/activos — Historia 1, FR-001, FR-002
  router.get("/recorridos/activos", async (req, res, next) => {
    try {
      res.json({ recorridos: await repository.listarActivos() });
    } catch (err) {
      next(err);
    }
  });

  // GET /api/central/recorridos/disponibles — Historia 2, FR-003
  router.get("/recorridos/disponibles", async (req, res, next) => {
    try {
      res.json({ recorridos: await repository.listarDisponibles() });
    } catch (err) {
      next(err);
    }
  });

  // GET /api/central/fletes/disponibles — Historia 2, FR-004
  router.get("/fletes/disponibles", async (req, res, next) => {
    try {
      res.json({ fletes: await repository.listarFletesDisponibles() });
    } catch (err) {
      next(err);
    }
  });

  // GET /api/central/recorridos/historial — Historia 5, FR-010
  router.get("/recorridos/historial", async (req, res, next) => {
    try {
      const historial = await repository.listarHistorial();
      res.json({
        recorridos: historial.map((d) => ({
          id: d.recorrido.id,
          fleteId: d.recorrido.fleteId,
          puntos: d.puntos,
        })),
      });
    } catch (err) {
      next(err);
    }
  });

  // POST /api/central/recorridos/:id/asignar — Historia 2, FR-005 a FR-007, FR-015
  router.post("/recorridos/:id/asignar", async (req, res, next) => {
    try {
      const { fleteId } = req.body || {};
      const resultado = await repository.asignar(req.params.id, fleteId);
      responderAsignacion(res, resultado);
    } catch (err) {
      next(err);
    }
  });

  // POST /api/central/recorridos/:id/reasignar — Historia 4, FR-009
  router.post("/recorridos/:id/reasignar", async (req, res, next) => {
    try {
      const { fleteId } = req.body || {};
      const resultado = await repository.reasignar(req.params.id, fleteId);
      responderAsignacion(res, resultado, { tokenAnteriorInvalidado: true });
    } catch (err) {
      next(err);
    }
  });

  // GET /api/central/recorridos/:id — Historia 3, FR-008 (debe ir después de
  // las rutas literales de arriba, o Express las capturaría como :id)
  router.get("/recorridos/:id", async (req, res, next) => {
    try {
      const detalle = await repository.obtenerDetalle(req.params.id);
      if (!detalle) {
        return res.status(404).json({ error: "recorrido_no_encontrado" });
      }
      res.json(detalle);
    } catch (err) {
      next(err);
    }
  });

  return router;
}
