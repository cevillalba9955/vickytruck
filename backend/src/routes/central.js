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
  // puntoSalidaDefault (010-mapa-central-unificado, FR-006): siempre
  // presente en la respuesta, incluso con `recorridos: []` — el mapa
  // consolidado lo muestra aunque no haya ningún recorrido activo.
  router.get("/recorridos/activos", async (req, res, next) => {
    try {
      const [recorridos, puntoSalidaDefault] = await Promise.all([
        repository.listarActivos(),
        repository.obtenerPuntoSalidaDefault(),
      ]);
      res.json({ recorridos, puntoSalidaDefault });
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
          // flete/chofer (009-central-mejora-visual): nombres para la tabla
          // de Historial, no solo ids.
          flete: d.recorrido.flete,
          chofer: d.recorrido.chofer,
          // cierreEn (008-registro-inicio-fin-recorrido, FR-005): sin esto,
          // Central no puede calcular el tiempo de regreso a base (SC-003).
          cierreEn: d.recorrido.cierreEn,
          // cierreLat/cierreLon (008, User Story 3, 2026-08-25): research.md
          // Decisión 7 — sin este mapeo explícito, el repository ya las
          // trae pero este router las recortaría igual que a cualquier otro
          // campo no listado acá.
          cierreLat: d.recorrido.cierreLat,
          cierreLon: d.recorrido.cierreLon,
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
