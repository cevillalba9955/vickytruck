import { Router } from "express";
import { ubicacionEnMemoriaCompartida } from "../state/ubicacionEnMemoria.js";
import { derivarCredencialChofer, topicPara } from "../mqtt/emqxProvisioning.js";
import { ahoraLocalIso } from "../util/tiempo.js";

function intervaloReporteUbicacionMs() {
  return Number(process.env.UBICACION_REPORTE_INTERVALO_MS || 60000);
}

// Config de conexión MQTT del chofer, derivada sin llamar a la API de EMQX
// Cloud (ver derivarCredencialChofer — determinística, la credencial ya se
// aprovisionó de antemano al recibir el push de Oracle, ver
// POST /api/integracion/recorridos en integracion.js). El topic de
// publicación sigue siendo por-fleteId (chofer/{fleteId}/ubicacion,
// FR-004), pero la credencial ahora es la permanente del chofer (FR-013,
// 2026-08-10) — no scoped a este único fleteId, ver research.md Decisión 8.
// Degrada a `null` sin romper este endpoint si todavía no hay
// fleteId/choferId asignado o si el backend corre sin EMQX configurado
// (dev/test) — el frontend ya trata `mqtt: null` como "no reportar
// ubicación por MQTT" (cae al fallback REST, FR-004).
function mqttConfigPara(fleteId, choferId) {
  const url = process.env.EMQX_WSS_URL;
  if (!fleteId || !choferId || !url) return null;
  try {
    const { username, password } = derivarCredencialChofer(choferId);
    return { url, username, password, topic: topicPara(fleteId) };
  } catch {
    return null;
  }
}

// Allow-list explícito (no un spread de `punto`): es la garantía real de que
// remitoIds nunca llegue al chofer (005-chofer-estados-viaje, FR-003), sin
// depender de que las capas de abajo lo filtren correctamente.
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
    cliente: punto.cliente ?? null,
    direccion: punto.direccion ?? null,
    rangoHorario: punto.rangoHorario ?? null,
    notasEntrega: punto.notasEntrega ?? null,
  };
}

/**
 * Router de la API del chofer. Recibe el repositorio por parámetro (no lo
 * construye) para poder testear el contrato HTTP con un repositorio en
 * memoria, sin depender de una conexión Oracle real (ver
 * backend/tests/contract).
 */
export function createRecorridoRouter(repository, ubicacionStore = ubicacionEnMemoriaCompartida) {
  const router = Router();

  // GET /api/recorridos/:token — FR-002, FR-003, FR-008, FR-012
  router.get("/:token", async (req, res, next) => {
    try {
      const recorrido = await repository.obtenerPorToken(req.params.token);
      if (!recorrido) {
        return res.status(404).json({ error: "enlace_invalido" });
      }
      res.json({
        recorrido: {
          estado: recorrido.estado,
          fleteId: recorrido.fleteId ?? null,
          intervaloUbicacionMs: intervaloReporteUbicacionMs(),
          mqtt: mqttConfigPara(recorrido.fleteId, recorrido.choferId),
          // Estado de viaje guiado (005-chofer-estados-viaje, FR-005).
          viajeEstado: recorrido.viajeEstado ?? "detenido",
          puntoActivoId: recorrido.puntoActivoId ?? null,
          // FR-019: visibilidad de CANCELAR persistida en el servidor.
          puedeCancelar: recorrido.puedeCancelar ?? false,
        },
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
      const { lat, lon, clienteEn } = req.body || {};
      const resultado = await repository.marcarArribo(
        req.params.token,
        req.params.puntoId,
        { lat, lon },
        clienteEn,
      );
      responderTransicion(res, resultado);
    } catch (err) {
      next(err);
    }
  });

  // POST /api/recorridos/:token/puntos/:puntoId/descarga — FR-005, FR-006, FR-007
  router.post("/:token/puntos/:puntoId/descarga", async (req, res, next) => {
    try {
      const { lat, lon, clienteEn } = req.body || {};
      const resultado = await repository.marcarDescarga(
        req.params.token,
        req.params.puntoId,
        { lat, lon },
        clienteEn,
      );
      responderTransicion(res, resultado);
    } catch (err) {
      next(err);
    }
  });

  // POST /api/recorridos/:token/ubicacion — FR-014, FR-015 de 001-chofer-recorrido.
  // Reporte periódico de ubicación instantánea mientras el recorrido está
  // activo; se guarda solo en memoria (nunca en Oracle, research.md §8 de
  // 002-panel-control-central).
  router.post("/:token/ubicacion", async (req, res, next) => {
    try {
      const { lat, lon } = req.body || {};
      if (lat == null || lon == null) {
        return res.status(400).json({ error: "ubicacion_invalida" });
      }
      const recorrido = await repository.obtenerPorToken(req.params.token);
      if (!recorrido) {
        return res.status(404).json({ error: "enlace_invalido" });
      }
      ubicacionStore.registrar(recorrido.id, { lat, lon, en: ahoraLocalIso() });
      res.status(200).json({ ok: true });
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
