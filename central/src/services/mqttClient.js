import mqtt from "mqtt";
import { ahoraLocalIso } from "./tiempo.js";

const TOPIC_UBICACION = "chofer/+/ubicacion";

// parsearPayloadUbicacion (013-mqtt-a-backend-directo): extraído como
// función pura para poder testear el parseo sin abrir una conexión MQTT
// real. `choferId` reemplaza a `fleteId` — el payload ya no incluye
// `fleteId` desde 012-ubicacion-por-chofer (2026-08-21); antes de este fix,
// `evento.fleteId` era siempre `undefined` y `aplicarUbicacionViva` (ver
// ubicacionViva.js) nunca encontraba el recorrido a actualizar.
export function parsearPayloadUbicacion(topic, payload) {
  const body = JSON.parse(String(payload));
  return {
    topic,
    choferId: String(body.choferId),
    lat: Number(body.lat),
    lon: Number(body.lon),
    en: body.en || ahoraLocalIso(),
    eventId: body.eventId ?? null,
  };
}

export function conectarUbicacionEnTiempoReal({ onEvento, onEstado }) {
  const brokerUrl = import.meta.env.VITE_MQTT_BROKER_URL;
  if (!brokerUrl) {
    onEstado?.("disabled");
    return () => {};
  }

  const client = mqtt.connect(brokerUrl, {
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
      onEvento?.(parsearPayloadUbicacion(topic, payload));
    } catch {
      onEstado?.("payload_error");
    }
  });

  return () => {
    client.end(true);
  };
}
