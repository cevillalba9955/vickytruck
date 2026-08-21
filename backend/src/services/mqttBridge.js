import mqtt from "mqtt";
import { ahoraLocalIso } from "../util/tiempo.js";

function opcionesConexion() {
  return {
    clientId: process.env.MQTT_BACKEND_CLIENT_ID || `vickytruck-backend-${Math.random().toString(16).slice(2)}`,
    username: process.env.MQTT_USERNAME || undefined,
    password: process.env.MQTT_PASSWORD || undefined,
    reconnectPeriod: Number(process.env.MQTT_RECONNECT_MS || 3000),
    connectTimeout: Number(process.env.MQTT_CONNECT_TIMEOUT_MS || 10000),
    clean: true,
    protocolVersion: 5,
  };
}

function topicUbicacion() {
  return process.env.MQTT_TOPIC_UBICACION || "chofer/+/ubicacion";
}

export function createDeduplicadorEventos(maxItems = 2000) {
  const vistos = new Map();

  return {
    yaVisto(eventId, ts = Date.now()) {
      if (!eventId) return false;
      if (vistos.has(eventId)) return true;
      vistos.set(eventId, ts);
      if (vistos.size > maxItems) {
        const keys = [...vistos.keys()].slice(0, vistos.size - maxItems);
        for (const k of keys) vistos.delete(k);
      }
      return false;
    },
  };
}

function parsearPayload(raw) {
  const body = JSON.parse(String(raw));
  return {
    eventId: body.eventId ?? null,
    // choferId (012-ubicacion-por-chofer): reemplaza a fleteId como clave
    // de ruteo — ver contracts/mqtt-topics.md.
    choferId: String(body.choferId),
    lat: Number(body.lat),
    lon: Number(body.lon),
    en: body.en || ahoraLocalIso(),
  };
}

export function startMqttBridge(store, logger = console) {
  return startMqttBridgeWithConnector(store, mqtt.connect, logger);
}

// crearMetricas (012-ubicacion-por-chofer, FR-007/FR-008): snapshot en
// memoria de la salud del canal de ubicación, sin persistencia — se
// reinicia en cada deploy/restart del proceso, igual que el resto del store
// (ver contracts/mqtt-estado-api.md).
function crearMetricas() {
  return {
    recibidos: 0,
    procesados: 0,
    duplicadosDescartados: 0,
    invalidos: 0,
    reconexiones: 0,
    ultimoMensajeEn: null,
    conectado: false,
  };
}

export function startMqttBridgeWithConnector(store, connectClient, logger = console) {
  const brokerUrl = process.env.MQTT_BROKER_URL;
  if (!brokerUrl) {
    logger.warn("[mqtt-bridge] MQTT_BROKER_URL no configurado; bridge deshabilitado.");
    return { stop() {}, obtenerMetricas: () => ({ habilitado: false }) };
  }

  const dedupe = createDeduplicadorEventos();
  const metricas = crearMetricas();
  const client = connectClient(brokerUrl, opcionesConexion());

  client.on("connect", () => {
    metricas.conectado = true;
    client.subscribe(topicUbicacion(), { qos: 1 }, (err) => {
      if (err) logger.error("[mqtt-bridge] error subscribe", err);
    });
  });

  client.on("message", (topic, payload) => {
    metricas.recibidos += 1;
    try {
      const evento = parsearPayload(payload);
      if (dedupe.yaVisto(evento.eventId)) {
        metricas.duplicadosDescartados += 1;
        return;
      }
      store.actualizarUbicacionPorChofer(evento.choferId, evento);
      metricas.procesados += 1;
      metricas.ultimoMensajeEn = evento.en;
    } catch (err) {
      metricas.invalidos += 1;
      logger.error(`[mqtt-bridge] payload inválido en ${topic}`, err);
    }
  });

  client.on("error", (err) => {
    logger.error("[mqtt-bridge] error", err);
  });

  client.on("reconnect", () => {
    metricas.conectado = false;
    metricas.reconexiones += 1;
    logger.info("[mqtt-bridge] reconectando...");
  });

  client.on("close", () => {
    metricas.conectado = false;
  });

  client.on("offline", () => {
    metricas.conectado = false;
  });

  return {
    stop() {
      client.end(true);
    },
    obtenerMetricas: () => ({ habilitado: true, ...metricas }),
  };
}
