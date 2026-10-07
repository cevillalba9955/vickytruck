import mqtt from "mqtt";
import { ahoraLocalIso } from "./tiempo.js";

const TOPIC_TEMPLATE = "chofer/{choferId}/ubicacion";

// Si el broker no confirma el publish en este tiempo (conexión que no se
// establece: credencial vieja, red bloqueada), mqtt.js deja el mensaje en cola
// y nunca llama al callback — sin este tope `publicar` quedaba colgado y el
// caller jamás caía al POST directo.
const PUBLISH_TIMEOUT_MS = 4000;

function topicPara(choferId) {
  return TOPIC_TEMPLATE.replace("{choferId}", encodeURIComponent(String(choferId)));
}

/**
 * `mqttConfig` viene de GET /api/recorridos/:token (campo `recorrido.mqtt`,
 * ver backend/src/routes/recorrido.js): credencial MQTT permanente del
 * chofer, aprovisionada por `choferId` en EMQX Cloud
 * (backend/src/mqtt/emqxProvisioning.js, FR-013 2026-08-10), no una
 * credencial fija de build. El topic de publicación es por-choferId
 * (`chofer/{choferId}/ubicacion`, 012-ubicacion-por-chofer — antes era
 * por-fleteId, ver contracts/mqtt-topics.md); la credencial no está scoped
 * a ese único topic (ver research.md Decisión 8 — riesgo aceptado
 * explícitamente). `mqttConfig` es `null` si el backend todavía no tiene
 * `choferId` para este recorrido, si EMQX no está configurado, o si el
 * backend tiene el reporte directo como canal preferido en vez del broker
 * (013-mqtt-a-backend-directo, default desde esa feature — ver
 * `UBICACION_CANAL_PREFERIDO` en `backend/src/config/ubicacionCanal.js`):
 * en cualquiera de esos casos, no-op (el caller cae al POST directo, ver
 * ubicacionPeriodica.js). Este archivo no cambia con esa feature — la
 * preferencia de canal la decide el backend, no el frontend.
 */
export function createPublisherUbicacionMqtt(choferId, mqttConfig) {
  if (!choferId || !mqttConfig?.url) {
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

  const topic = mqttConfig.topic || topicPara(choferId);

  return {
    publicar({ lat, lon, recorridoId }) {
      return new Promise((resolve) => {
        const timer = setTimeout(() => resolve(false), PUBLISH_TIMEOUT_MS);
        const payload = JSON.stringify({
          eventId: crypto.randomUUID(),
          choferId: String(choferId),
          recorridoId: recorridoId ? String(recorridoId) : null,
          lat,
          lon,
          en: ahoraLocalIso(),
        });
        client.publish(topic, payload, { qos: 1 }, (err) => {
          clearTimeout(timer);
          resolve(!err);
        });
      });
    },
    cerrar() {
      client.end(true);
    },
  };
}
