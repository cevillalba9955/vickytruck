import { obtenerUbicacionBestEffort } from "./geolocation.js";
import { encolar, iniciarReintentoAutomatico } from "./offlineQueue.js";
import { publicar } from "./mqttClient.js";

// Mismo template que arma el backend en `recorrido.mqtt.eventosTopic`
// (contracts/enlace-recorrido.md de 004-chofer-cloud-broker, que hereda el
// contrato de tópicos de contracts/mqtt-canal.md de 003-mqtt-broker-fletes)
// — determinístico a partir del token, así no hace falta hacer viajar el
// string completo desde el payload embebido hasta cada llamada de
// marcarArribo/marcarDescarga.
function eventosTopic(token) {
  return `vickytruck/fletes/${token}/eventos`;
}

async function enviarEvento(tipo, token, puntoId) {
  const ubicacion = await obtenerUbicacionBestEffort();
  const payload = {
    tipo,
    puntoId,
    lat: ubicacion?.lat ?? null,
    lon: ubicacion?.lon ?? null,
  };

  try {
    await publicar(eventosTopic(token), payload, { qos: 1 });
  } catch {
    // Sin conexión al bróker (offline, o todavía no conectó): encolar para
    // reintento automático (FR-010), sin bloquear ni marcar la acción como
    // error para el chofer.
    encolar({ tipo, token, puntoId, ubicacion });
    return { queued: true };
  }

  // MQTT no tiene una respuesta síncrona con el nuevo estado (a diferencia
  // del POST HTTP que reemplaza): la UI ya aplicó la actualización optimista
  // (main.jsx); no hay `data` que fusionar acá.
  return { queued: false, data: null };
}

/** Marca "arribo" sobre un punto (US2). No exige orden entre puntos. */
export function marcarArribo(token, puntoId) {
  return enviarEvento("arribo", token, puntoId);
}

/** Marca "descarga completa" sobre un punto (US3). Requiere arribo previo. */
export function marcarDescarga(token, puntoId) {
  return enviarEvento("descarga", token, puntoId);
}

/**
 * Arranca el reintento automático de la cola offline. Devuelve una función
 * para desregistrar los listeners (útil en tests/cleanup de componentes).
 * A diferencia del POST HTTP que reemplaza, `publicar` con QoS 1 no informa
 * si la transición fue válida en el backend (FR-013: eso se descarta
 * silenciosamente allá) — solo confirma que el bróker aceptó el mensaje. Si
 * `publicar` rechaza (sin conexión), el item se mantiene en la cola.
 */
export function iniciarSincronizacionOffline() {
  return iniciarReintentoAutomatico(async (item) => {
    await publicar(
      eventosTopic(item.token),
      { tipo: item.tipo, puntoId: item.puntoId, lat: item.ubicacion?.lat ?? null, lon: item.ubicacion?.lon ?? null },
      { qos: 1 },
    );
  });
}
