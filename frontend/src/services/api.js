import { obtenerUbicacionBestEffort } from "./geolocation.js";
import { encolar, iniciarReintentoAutomatico } from "./offlineQueue.js";
import { publicar } from "./mqttClient.js";

const BASE_URL = "/api/recorridos";

// Mismo template que arma el backend en `recorrido.mqtt.eventosTopic`
// (contracts/mqtt-canal.md de 003-mqtt-broker-fletes) — determinístico a
// partir del token, así no hace falta hacer viajar el string completo desde
// GET /:token hasta cada llamada de marcarArribo/marcarDescarga.
function eventosTopic(token) {
  return `vickytruck/fletes/${token}/eventos`;
}

export class ApiError extends Error {
  constructor(codigo, status) {
    super(codigo);
    this.codigo = codigo;
    this.status = status;
  }
}

async function safeJson(res) {
  try {
    return await res.json();
  } catch {
    return null;
  }
}

/** GET del recorrido completo (US1). Lanza ApiError si el token es inválido. */
export async function obtenerRecorrido(token) {
  const res = await fetch(`${BASE_URL}/${encodeURIComponent(token)}`);
  if (!res.ok) {
    const body = await safeJson(res);
    throw new ApiError(body?.error || "error_desconocido", res.status);
  }
  return res.json();
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
