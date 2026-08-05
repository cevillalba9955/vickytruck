import mqtt from "mqtt";

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
    fleteId: String(body.fleteId),
    lat: Number(body.lat),
    lon: Number(body.lon),
    en: body.en || new Date().toISOString(),
  };
}

export function startMqttBridge(store, logger = console) {
  const brokerUrl = process.env.MQTT_BROKER_URL;
  if (!brokerUrl) {
    logger.warn("[mqtt-bridge] MQTT_BROKER_URL no configurado; bridge deshabilitado.");
    return { stop() {} };
  }

  const dedupe = createDeduplicadorEventos();
  const client = mqtt.connect(brokerUrl, opcionesConexion());

  client.on("connect", () => {
    client.subscribe(topicUbicacion(), { qos: 1 }, (err) => {
      if (err) logger.error("[mqtt-bridge] error subscribe", err);
    });
  });

  client.on("message", (topic, payload) => {
    try {
      const evento = parsearPayload(payload);
      if (dedupe.yaVisto(evento.eventId)) return;
      store.actualizarUbicacionPorFlete(evento.fleteId, evento);
    } catch (err) {
      logger.error(`[mqtt-bridge] payload inválido en ${topic}`, err);
    }
  });

  client.on("error", (err) => {
    logger.error("[mqtt-bridge] error", err);
  });

  return {
    stop() {
      client.end(true);
    },
  };
}
