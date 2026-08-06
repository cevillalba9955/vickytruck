import { obtenerUbicacionBestEffort } from "./geolocation.js";
import { createPublisherUbicacionMqtt } from "./ubicacionMqtt.js";

const BASE_URL = "/api/recorridos";

async function reportarUnaVez(token, publisher) {
  const ubicacion = await obtenerUbicacionBestEffort();
  if (!ubicacion) return; // sin GPS disponible: se omite este reporte (best-effort)

  try {
    await fetch(`${BASE_URL}/${encodeURIComponent(token)}/ubicacion`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ lat: ubicacion.lat, lon: ubicacion.lon }),
    });
  } catch {
    // Sin conectividad: a diferencia de arribo/descarga, este reporte NO se
    // encola (FR-017 — es un dato efímero, no crítico); se reintenta solo en
    // el próximo ciclo del temporizador.
  }

  // Publicación MQTT best-effort para tiempo real en Central. Si falla, no
  // afecta el ciclo HTTP ya existente.
  try {
    await publisher.publicar({ lat: ubicacion.lat, lon: ubicacion.lon, recorridoId: token });
  } catch {
    // Sin acción: la publicación se vuelve a intentar en el próximo ciclo.
  }
}

/**
 * Arranca el reporte periódico de ubicación instantánea (FR-014) mientras el
 * recorrido está activo. Devuelve una función para detener el temporizador.
 *
 * El reporte HTTP usa `token` (identifica el recorrido vía enlace). El
 * publisher MQTT usa `fleteId` (identifica el flete real) porque Central lo
 * busca por `fleteId`, no por token — ver mqttBridge.js. `mqttConfig` es la
 * credencial publish-only por-flete que devuelve GET /:token (`recorrido.mqtt`).
 */
export function iniciarReportePeriodico(token, fleteId, mqttConfig, intervaloMs) {
  const publisher = createPublisherUbicacionMqtt(fleteId, mqttConfig);

  const timer = setInterval(() => {
    reportarUnaVez(token, publisher);
  }, intervaloMs);

  return () => {
    clearInterval(timer);
    publisher.cerrar();
  };
}
