import { connect } from "mqtt";

const TOPIC_UBICACION = "chofer/+/ubicacion";

export function conectarUbicacionEnTiempoReal({ onEvento, onEstado }) {
  const brokerUrl = import.meta.env.VITE_MQTT_BROKER_URL;
  if (!brokerUrl) {
    onEstado?.("disabled");
    return () => {};
  }

  const client = connect(brokerUrl, {
    clientId: `central-${Math.random().toString(16).slice(2)}`,
    username: import.meta.env.VITE_MQTT_USERNAME || undefined,
    password: import.meta.env.VITE_MQTT_PASSWORD || undefined,
    reconnectPeriod: Number(import.meta.env.VITE_MQTT_RECONNECT_MS || 3000),
    protocolVersion: 5,
    clean: true,
  });

  client.on("connect", () => {
    onEstado?.("connected");
    client.subscribe(TOPIC_UBICACION, { qos: 1 });
  });

  client.on("reconnect", () => onEstado?.("reconnecting"));
  client.on("close", () => onEstado?.("disconnected"));
  client.on("error", () => onEstado?.("error"));

  client.on("message", (topic, payload) => {
    try {
      const body = JSON.parse(String(payload));
      onEvento?.({
        topic,
        fleteId: String(body.fleteId),
        lat: Number(body.lat),
        lon: Number(body.lon),
        en: body.en || new Date().toISOString(),
        eventId: body.eventId ?? null,
      });
    } catch {
      onEstado?.("payload_error");
    }
  });

  return () => {
    client.end(true);
  };
}
