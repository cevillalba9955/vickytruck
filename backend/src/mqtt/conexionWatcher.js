// Observa los eventos de conexión del bróker ($SYS) para atar el token de
// publicación de un flete al primer dispositivo que lo usa
// (004-chofer-cloud-broker, FR-005a). Mecanismo reactivo (detecta y
// expulsa), no preventivo — ver research.md §3 para el porqué: el plan EMQX
// Cloud Serverless usado por el proyecto no soporta autenticación HTTP por
// webhook, que sería el mecanismo preventivo ideal.
//
// Reutiliza el mismo cliente MQTT de servicio ya conectado (backend/src/mqtt/
// client.js) que usa mqtt/subscriber.js — agrega una suscripción más sobre
// la misma conexión, sin infraestructura nueva (Principio VII).

const TOPIC_CONECTADO = "$SYS/brokers/+/clients/+/connected";

function esTopicDeConexion(topic) {
  return topic.startsWith("$SYS/") && topic.endsWith("/connected");
}

function parsearPayload(payloadBuf) {
  try {
    return JSON.parse(payloadBuf.toString());
  } catch {
    return null; // payload corrupto: se descarta silenciosamente, igual que subscriber.js
  }
}

/**
 * `repository` resuelve `username` (=token) -> recorrido, para ignorar
 * eventos de conexión de credenciales que no son un token de recorrido
 * conocido (ej. las credenciales de servicio de backend/Central) — mismo
 * criterio de descarte silencioso que FR-013 de 003-mqtt-broker-fletes.
 */
export function createConexionWatcher({ client, repository, vinculoDispositivo, emqxProvisioning }) {
  async function manejarConexion({ username, clientid }) {
    if (!username || !clientid) return;

    const recorrido = await repository.obtenerPorToken(username);
    if (!recorrido) return; // no es un token de recorrido activo conocido

    const resultado = vinculoDispositivo.registrarConexion(username, clientid);
    if (resultado.accion === "expulsar") {
      await emqxProvisioning.expulsarCliente(resultado.clientId);
    }
  }

  function onMessage(topic, payloadBuf) {
    if (!esTopicDeConexion(topic)) return;
    const payload = parsearPayload(payloadBuf);
    if (!payload) return;

    manejarConexion({ username: payload.username, clientid: payload.clientid }).catch((err) => {
      console.error("[mqtt] error procesando evento de conexión:", err.message);
    });
  }

  function iniciar() {
    client.subscribe(TOPIC_CONECTADO, { qos: 0 });
    client.on("message", onMessage);
  }

  return { iniciar, onMessage };
}
