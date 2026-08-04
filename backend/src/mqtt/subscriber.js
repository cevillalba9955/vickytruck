// Suscripción del backend a los canales de los fletes (contracts/mqtt-canal.md
// de 003-mqtt-broker-fletes). El backend es uno de los dos únicos lectores
// autorizados (junto con Central) — ver spec.md Clarifications. Recibe el
// `client` MQTT ya conectado por parámetro (no lo construye) para poder
// testear con un fake EventEmitter, sin depender de un bróker real (ver
// backend/tests/integration/mqtt-ubicacion.test.js).

const TOPIC_UBICACION = "vickytruck/fletes/+/ubicacion";
const TOPIC_EVENTOS = "vickytruck/fletes/+/eventos";

function extraerToken(topic) {
  // vickytruck/fletes/{token}/ubicacion
  return topic.split("/")[2] || null;
}

function parsearPayload(payloadBuf) {
  try {
    return JSON.parse(payloadBuf.toString());
  } catch {
    return null; // payload corrupto: se descarta silenciosamente (FR-013)
  }
}

/**
 * Crea el suscriptor. `repository` resuelve token -> recorrido (el mismo
 * `recorridoRepository` que usa `enlaceRecorrido.js`); `ubicacionStore` es
 * el mismo módulo en memoria que antes escribía el endpoint
 * `POST /:token/ubicacion` retirado (003-mqtt-broker-fletes). `vinculoDispositivo`
 * es opcional: si se pasa, su vínculo se libera junto con la credencial EMQX
 * al completar el recorrido (004-chofer-cloud-broker, FR-005a).
 */
export function createSubscriber({ client, repository, ubicacionStore, emqxProvisioning, vinculoDispositivo }) {
  async function manejarUbicacion(token, payload) {
    if (payload?.lat == null || payload?.lon == null) return; // FR-013
    const recorrido = await repository.obtenerPorToken(token);
    if (!recorrido) return; // token inválido/recorrido inexistente: FR-013

    ubicacionStore.registrar(recorrido.id, {
      lat: payload.lat,
      lon: payload.lon,
      en: payload.en || new Date().toISOString(),
    });
  }

  // FR-002, FR-006 de 001: mismo comportamiento que tenían los handlers HTTP
  // retirados (POST .../arribo, .../descarga) — transición idempotente ante
  // repeticiones (research.md §6 de 001), timestamp de servidor. A diferencia
  // de esos handlers, acá no hay una respuesta HTTP que devolver: un
  // `puntoId` inexistente o una transición inválida (ej. "descarga" antes de
  // "arribo") simplemente se descartan (FR-013) — en operación normal no
  // deberían ocurrir, ya que el frontend construye el mensaje a partir del
  // estado que ya conoce del recorrido.
  async function manejarEvento(token, payload) {
    if (payload?.tipo !== "arribo" && payload?.tipo !== "descarga") return;
    if (!payload.puntoId) return;

    const ubicacion = { lat: payload.lat ?? null, lon: payload.lon ?? null };
    const resultado =
      payload.tipo === "arribo"
        ? await repository.marcarArribo(token, payload.puntoId, ubicacion)
        : await repository.marcarDescarga(token, payload.puntoId, ubicacion);

    // "invalid_token", "not_found" y "conflict" se descartan silenciosamente
    // (FR-013).
    if (resultado.outcome !== "ok") return;

    // FR-008 (US3): si esta descarga deja el recorrido 100% completado, el
    // canal del flete ya no tiene motivo para seguir activo — se revoca su
    // credencial MQTT (least-privilege, Principio VII de la constitución).
    if (payload.tipo === "descarga" && emqxProvisioning) {
      const recorrido = await repository.obtenerPorToken(token);
      if (recorrido && recorrido.progreso.pendientes === 0 && recorrido.progreso.arribados === 0) {
        await emqxProvisioning.revocarCredencial(token);
        vinculoDispositivo?.liberar(token);
      }
    }
  }

  function onMessage(topic, payloadBuf) {
    const token = extraerToken(topic);
    if (!token) return;
    const payload = parsearPayload(payloadBuf);
    if (!payload) return;

    if (topic.endsWith("/ubicacion")) {
      manejarUbicacion(token, payload).catch((err) => {
        console.error("[mqtt] error procesando mensaje de ubicación:", err.message);
      });
    } else if (topic.endsWith("/eventos")) {
      manejarEvento(token, payload).catch((err) => {
        console.error("[mqtt] error procesando mensaje de acción:", err.message);
      });
    }
  }

  function iniciar() {
    client.subscribe(TOPIC_UBICACION, { qos: 0 });
    client.subscribe(TOPIC_EVENTOS, { qos: 1 });
    client.on("message", onMessage);
  }

  return { iniciar, onMessage };
}
