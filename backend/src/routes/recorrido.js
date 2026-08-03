import { Router } from "express";

function serializePunto(punto, totalPuntos) {
  return {
    id: punto.id,
    orden: punto.orden,
    totalPuntos,
    latitud: punto.latitud,
    longitud: punto.longitud,
    estado: punto.estado,
    arriboEn: punto.arriboEn,
    descargaEn: punto.descargaEn,
  };
}

/**
 * Router de la API del chofer. Recibe el repositorio por parámetro (no lo
 * construye) para poder testear el contrato HTTP con un repositorio en
 * memoria, sin depender de una conexión Oracle real (ver
 * backend/tests/contract).
 */
export function createRecorridoRouter(repository) {
  const router = Router();

  // GET /api/recorridos/:token — FR-002, FR-003, FR-008, FR-012
  router.get("/:token", async (req, res, next) => {
    try {
      const recorrido = await repository.obtenerPorToken(req.params.token);
      if (!recorrido) {
        return res.status(404).json({ error: "enlace_invalido" });
      }
      res.json({
        recorrido: { estado: recorrido.estado },
        progreso: recorrido.progreso,
        puntos: recorrido.puntos.map((p) => serializePunto(p, recorrido.puntos.length)),
      });
    } catch (err) {
      next(err);
    }
  });

  // POST /api/recorridos/:token/puntos/:puntoId/arribo — FR-004, FR-006, FR-007
  router.post("/:token/puntos/:puntoId/arribo", async (req, res, next) => {
    try {
      const { lat, lon } = req.body || {};
      const resultado = await repository.marcarArribo(req.params.token, req.params.puntoId, {
        lat,
        lon,
      });
      responderTransicion(res, resultado);
    } catch (err) {
      next(err);
    }
  });

  // POST /api/recorridos/:token/puntos/:puntoId/descarga — FR-005, FR-006, FR-007
  router.post("/:token/puntos/:puntoId/descarga", async (req, res, next) => {
    try {
      const { lat, lon } = req.body || {};
      const resultado = await repository.marcarDescarga(req.params.token, req.params.puntoId, {
        lat,
        lon,
      });
      responderTransicion(res, resultado);
    } catch (err) {
      next(err);
    }
  });

  return router;
}

function responderTransicion(res, resultado) {
  if (resultado.outcome === "invalid_token") {
    return res.status(404).json({ error: "enlace_invalido" });
  }
  if (resultado.outcome === "not_found") {
    return res.status(404).json({ error: "punto_no_encontrado" });
  }
  if (resultado.outcome === "conflict") {
    return res.status(409).json({
      error: "transicion_invalida",
      puntoId: resultado.punto.id,
      estado: resultado.punto.estado,
    });
  }
  // outcome === "ok" (aplicada ahora, o repetición idempotente — research.md §6)
  return res.status(200).json({
    puntoId: resultado.punto.id,
    estado: resultado.punto.estado,
    arriboEn: resultado.punto.arriboEn,
    descargaEn: resultado.punto.descargaEn,
  });
}
