import mqtt from "mqtt";

const TOPIC_TEMPLATE = "chofer/{fleteId}/ubicacion";

function topicPara(fleteId) {
  return TOPIC_TEMPLATE.replace("{fleteId}", encodeURIComponent(String(fleteId)));
}

/**
 * `mqttConfig` viene de GET /api/recorridos/:token (campo `recorrido.mqtt`,
 * ver backend/src/routes/recorrido.js): credencial publish-only aprovisionada
 * por-flete en EMQX Cloud (backend/src/mqtt/emqxProvisioning.js), no una
 * credencial fija de build — así el bundle público del chofer nunca embebe
 * una credencial con alcance más amplio que "publicar la ubicación de este
 * flete". `mqttConfig` es `null` si el backend todavía no tiene `fleteId`
 * para este recorrido, o si EMQX no está configurado: en ese caso, no-op.
 */
export function createPublisherUbicacionMqtt(fleteId, mqttConfig) {
  if (!fleteId || !mqttConfig?.url) {
    return {
      async publicar() {
        return false;
      },
      cerrar() {},
    };
  }

  const client = mqtt.connect(mqttConfig.url, {
    clientId: `chofer-${Math.random().toString(16).slice(2)}`,
    username: mqttConfig.username || undefined,
    password: mqttConfig.password || undefined,
    reconnectPeriod: Number(import.meta.env.VITE_MQTT_RECONNECT_MS || 3000),
    protocolVersion: 5,
    clean: true,
  });

  const topic = mqttConfig.topic || topicPara(fleteId);

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
        client.publish(topic, payload, { qos: 1 }, (err) => resolve(!err));
      });
    },
    cerrar() {
      client.end(true);
    },
  };
}
