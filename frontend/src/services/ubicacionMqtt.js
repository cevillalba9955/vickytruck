import mqtt from "mqtt";

const TOPIC_TEMPLATE = "chofer/{fleteId}/ubicacion";

function topicPara(fleteId) {
  return TOPIC_TEMPLATE.replace("{fleteId}", encodeURIComponent(String(fleteId)));
}

export function createPublisherUbicacionMqtt(fleteId) {
  const brokerUrl = import.meta.env.VITE_MQTT_BROKER_URL;
  if (!brokerUrl || !fleteId) {
    return {
      async publicar() {
        return false;
      },
      cerrar() {},
    };
  }

  const client = mqtt.connect(brokerUrl, {
    clientId: `chofer-${Math.random().toString(16).slice(2)}`,
    username: import.meta.env.VITE_MQTT_USERNAME || undefined,
    password: import.meta.env.VITE_MQTT_PASSWORD || undefined,
    reconnectPeriod: Number(import.meta.env.VITE_MQTT_RECONNECT_MS || 3000),
    protocolVersion: 5,
    clean: true,
  });

  return {
    publicar({ lat, lon, recorridoId }) {
      return new Promise((resolve) => {
        const payload = JSON.stringify({
          eventId: crypto.randomUUID(),
          fleteId: String(fleteId),
          recorridoId: recorridoId ? String(recorridoId) : null,
          lat,
          lon,
          en: new Date().toISOString(),
        });
        client.publish(topicPara(fleteId), payload, { qos: 1 }, (err) => resolve(!err));
      });
    },
    cerrar() {
      client.end(true);
    },
  };
}
