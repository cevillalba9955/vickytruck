import { Router } from "express";
import { createEmqxProvisioning } from "../mqtt/emqxProvisioning.js";

function intervaloReporteUbicacionMs() {
  return Number(process.env.UBICACION_REPORTE_INTERVALO_MS || 60000);
}

// Config de conexión MQTT entregada al frontend del chofer (contracts/mqtt-canal.md
// de 003-mqtt-broker-fletes): reemplaza los POST directos de ubicación/arribo/
// descarga por publicaciones hacia el bróker, para no exponer IP propia del
// backend ni del dispositivo del chofer.
async function construirConfigMqtt(token, emqxProvisioning) {
  const { username, password } = await emqxProvisioning.provisionarCredencial(token);
  return {
    url: process.env.EMQX_WSS_URL,
    username,
    password,
    ubicacionTopic: `vickytruck/fletes/${token}/ubicacion`,
    eventosTopic: `vickytruck/fletes/${token}/eventos`,
    intervaloUbicacionMs: intervaloReporteUbicacionMs(),
  };
}

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
export function createRecorridoRouter(repository, emqxProvisioning = createEmqxProvisioning()) {
  const router = Router();

  // GET /api/recorridos/:token — FR-002, FR-003, FR-008, FR-012 (001);
  // incluye `recorrido.mqtt` desde 003-mqtt-broker-fletes (FR-001, FR-002).
  router.get("/:token", async (req, res, next) => {
    try {
      const recorrido = await repository.obtenerPorToken(req.params.token);
      if (!recorrido) {
        return res.status(404).json({ error: "enlace_invalido" });
      }
      res.json({
        recorrido: {
          estado: recorrido.estado,
          mqtt: await construirConfigMqtt(req.params.token, emqxProvisioning),
        },
        progreso: recorrido.progreso,
        puntos: recorrido.puntos.map((p) => serializePunto(p, recorrido.puntos.length)),
      });
    } catch (err) {
      next(err);
    }
  });

  // POST /:token/puntos/:puntoId/arribo — RETIRADO (003-mqtt-broker-fletes,
  // FR-002): llega por el bróker MQTT (ver mqtt/subscriber.js).
  // POST /:token/puntos/:puntoId/descarga — RETIRADO, idem.
  // POST /:token/ubicacion — RETIRADO (003-mqtt-broker-fletes, FR-001): el
  // reporte periódico de ubicación instantánea ahora llega por el bróker MQTT
  // (ver mqtt/subscriber.js), no por este endpoint.

  return router;
}
