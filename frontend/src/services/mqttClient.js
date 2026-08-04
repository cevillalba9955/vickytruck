import mqtt from "mqtt";

// Cliente MQTT-sobre-WebSocket del chofer: conexión saliente hacia el bróker
// (config.url = wss://..., credenciales por token recibidas de
// GET /api/recorridos/:token) para publicar ubicación y acciones, en vez de
// llamar directo al backend (003-mqtt-broker-fletes, objetivo: evitar
// exponer IP propia).
let client = null;

/** Conecta (o reutiliza la conexión ya abierta) con la config recibida de GET /:token. */
export function conectar({ url, username, password }) {
  if (client) return client;
  client = mqtt.connect(url, {
    username,
    password,
    reconnectPeriod: 4000,
  });
  client.on("error", () => {
    // Sin acción: mqtt.js reintenta solo (reconnectPeriod); publish() falla
    // mientras tanto y el llamador decide si encolar (ver offlineQueue.js).
  });
  return client;
}

/** Publica un mensaje JSON en `topic`. Rechaza si no hay conexión activa. */
export function publicar(topic, payload, { qos = 0, retain = false } = {}) {
  return new Promise((resolve, reject) => {
    if (!client) return reject(new Error("mqtt_no_conectado"));
    client.publish(topic, JSON.stringify(payload), { qos, retain }, (err) => {
      if (err) reject(err);
      else resolve();
    });
  });
}

/** Cierra la conexión (uso en tests/cleanup). */
export function desconectar() {
  if (client) {
    client.end(true);
    client = null;
  }
}
