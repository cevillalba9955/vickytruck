import { Router } from "express";

/**
 * Router del panel de Central (solo lectura en cloud — la asignación de
 * flete ocurre en Oracle/APEX antes de pushear el recorrido, ver
 * specs/003-arquitectura-cloud-mqtt/contracts/integracion-api.md). Recibe el
 * repositorio por parámetro para poder testear el contrato HTTP con un
 * repositorio en memoria (ver backend/tests/helpers/inMemoryCentralRepository.js).
 */
export function createCentralRouter(repository) {
  const router = Router();

  // GET /api/central/recorridos/activos — Historia 1, FR-001, FR-002
  router.get("/recorridos/activos", async (req, res, next) => {
    try {
      res.json({ recorridos: await repository.listarActivos() });
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
          // cierreEn (008-registro-inicio-fin-recorrido, FR-005): sin esto,
          // Central no puede calcular el tiempo de regreso a base (SC-003).
          cierreEn: d.recorrido.cierreEn,
          puntos: d.puntos,
        })),
      });
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
