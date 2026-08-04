import mqtt from "mqtt";

// Cliente MQTT-sobre-WebSocket de Central: conexión saliente de solo lectura
// hacia el bróker (config de GET /api/central/mqtt-config), aditiva al
// polling REST ya existente (polling.js) — si el bróker no está disponible,
// Central sigue funcionando vía polling (003-mqtt-broker-fletes,
// research.md §5).
let client = null;

/** Conecta (o reutiliza la conexión ya abierta) con la credencial de servicio de Central. */
export function conectar({ url, username, password }) {
  if (client) return client;
  client = mqtt.connect(url, {
    username,
    password,
    reconnectPeriod: 4000,
  });
  client.on("error", () => {
    // Sin acción: la vista sigue funcionando vía polling mientras mqtt.js reintenta.
  });
  return client;
}

/** true si `topic` matchea el filtro MQTT `filter` (soporta comodín `+` de un nivel). */
function coincideTopic(filter, topic) {
  const f = filter.split("/");
  const t = topic.split("/");
  if (f.length !== t.length) return false;
  return f.every((seg, i) => seg === "+" || seg === t[i]);
}

/**
 * Se suscribe a `topicFilter` y llama a `onMessage(topic, payload)` por cada
 * mensaje que matchee. Devuelve una función para dejar de escuchar (no
 * desuscribe del bróker, solo remueve el listener local).
 */
export function suscribir(topicFilter, onMessage) {
  if (!client) throw new Error("mqtt_no_conectado");
  const qos = topicFilter.endsWith("/eventos") ? 1 : 0;
  client.subscribe(topicFilter, { qos });

  const handler = (topic, payloadBuf) => {
    if (!coincideTopic(topicFilter, topic)) return;
    try {
      onMessage(topic, JSON.parse(payloadBuf.toString()));
    } catch {
      // payload no parseable como JSON: mensaje corrupto, se ignora.
    }
  };
  client.on("message", handler);
  return () => client.off("message", handler);
}

/** Cierra la conexión (uso en tests/cleanup). */
export function desconectar() {
  if (client) {
    client.end(true);
    client = null;
  }
}
