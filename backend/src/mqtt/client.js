import mqtt from "mqtt";

// Conexión saliente (nunca entrante) del backend hacia el bróker MQTT en la
// nube (EMQX Cloud, mqtts://). Sesión persistente (`clean: false`) para que
// el bróker retenga los mensajes QoS1 de `vickytruck/fletes/+/eventos`
// mientras el backend está temporalmente desconectado (FR-011, research.md §3
// de 003-mqtt-broker-fletes). Reconexión automática vía `reconnectPeriod`.

function mqttsUrl() {
  const host = process.env.EMQX_MQTTS_HOST;
  const port = process.env.EMQX_MQTTS_PORT || 8883;
  return `mqtts://${host}:${port}`;
}

let client = null;

export function getBackendMqttClient() {
  if (!client) {
    client = mqtt.connect(mqttsUrl(), {
      username: process.env.EMQX_BACKEND_USERNAME,
      password: process.env.EMQX_BACKEND_PASSWORD,
      clientId: `vickytruck-backend-${process.pid}`,
      clean: false,
      reconnectPeriod: 5000,
    });
    client.on("error", (err) => {
      console.error("[mqtt] error de conexión:", err.message);
    });
  }
  return client;
}

export function closeBackendMqttClient() {
  return new Promise((resolve) => {
    if (!client) return resolve();
    const c = client;
    client = null;
    c.end(false, {}, resolve);
  });
}
