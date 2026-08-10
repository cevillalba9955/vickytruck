import { Router } from "express";

/**
 * Router del estado de viaje guiado del chofer (005-chofer-estados-viaje).
 * Recibe el mismo `repository` que `createRecorridoRouter` (debe implementar
 * `iniciarViaje`/`registrarLlegue`/`registrarDescargaCompleta`, y más
 * adelante `moverPrimero`/`cancelarUltimaOperacion`) — en producción es
 * siempre `integracionStoreCompartido` (ver server.js).
 */
export function createViajeRouter(repository) {
  const router = Router();

  // POST /api/recorridos/:token/viaje/iniciar — FR-007
  router.post("/:token/viaje/iniciar", async (req, res, next) => {
    try {
      const resultado = await repository.iniciarViaje(req.params.token);
      responderViaje(res, resultado);
    } catch (err) {
      next(err);
    }
  });

  // POST /api/recorridos/:token/viaje/llegue — FR-008, FR-009
  router.post("/:token/viaje/llegue", async (req, res, next) => {
    try {
      const { lat, lon } = req.body || {};
      const resultado = await repository.registrarLlegue(req.params.token, { lat, lon });
      responderViaje(res, resultado);
    } catch (err) {
      next(err);
    }
  });

  // POST /api/recorridos/:token/viaje/descarga-completa — FR-010, FR-011
  router.post("/:token/viaje/descarga-completa", async (req, res, next) => {
    try {
      const { lat, lon } = req.body || {};
      const resultado = await repository.registrarDescargaCompleta(req.params.token, { lat, lon });
      responderViaje(res, resultado);
    } catch (err) {
      next(err);
    }
  });

  // POST /api/recorridos/:token/viaje/ir-primero — FR-014, FR-015, FR-016
  router.post("/:token/viaje/ir-primero", async (req, res, next) => {
    try {
      const { puntoId } = req.body || {};
      const resultado = await repository.moverPrimero(req.params.token, puntoId);
      if (resultado.outcome === "invalid_token") {
        return res.status(404).json({ error: "enlace_invalido" });
      }
      if (resultado.outcome === "not_found") {
        return res.status(404).json({ error: "punto_no_encontrado" });
      }
      if (resultado.outcome === "conflict") {
        return res.status(409).json({ error: "transicion_invalida", motivo: resultado.motivo ?? null });
      }
      return res.status(200).json({ ok: true, puntos: resultado.puntos, puedeCancelar: true });
    } catch (err) {
      next(err);
    }
  });

  // POST /api/recorridos/:token/viaje/cancelar — FR-017 a FR-020
  router.post("/:token/viaje/cancelar", async (req, res, next) => {
    try {
      const resultado = await repository.cancelarUltimaOperacion(req.params.token);
      if (resultado.outcome === "invalid_token") {
        return res.status(404).json({ error: "enlace_invalido" });
      }
      if (resultado.outcome === "conflict") {
        return res.status(409).json({ error: "nada_para_cancelar" });
      }
      return res.status(200).json({ viajeEstado: resultado.viajeEstado, puntoActivoId: resultado.puntoActivoId, puedeCancelar: false });
    } catch (err) {
      next(err);
    }
  });

  return router;
}

function responderViaje(res, resultado) {
  if (resultado.outcome === "invalid_token") {
    return res.status(404).json({ error: "enlace_invalido" });
  }
  if (resultado.outcome === "not_found") {
    return res.status(404).json({ error: "punto_no_encontrado" });
  }
  if (resultado.outcome === "conflict") {
    return res.status(409).json({
      error: "transicion_invalida",
      viajeEstado: resultado.viajeEstado,
      puntoActivoId: resultado.puntoActivoId ?? null,
    });
  }
  // outcome === "ok" — iniciar/llegue/descarga-completa siempre dejan
  // ultimaOperacion seteado (FR-017), así que puedeCancelar es siempre true acá.
  return res.status(200).json({
    viajeEstado: resultado.viajeEstado,
    puntoActivoId: resultado.puntoActivoId,
    puedeCancelar: true,
    ...(resultado.punto ? { puntoEstado: resultado.punto.estado, arriboEn: resultado.punto.arriboEn, descargaEn: resultado.punto.descargaEn } : {}),
  });
}
