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

  // iOS (Safari/WebKit — Chrome en iOS usa el mismo motor por regla de
  // Apple) pausa los timers de JS de una pestaña en segundo plano (pantalla
  // bloqueada, cambio de app): el setInterval de arriba prácticamente no
  // dispara mientras tanto, reproducido en vivo el 2026-08-06 (cliente MQTT
  // conectado varios minutos sin publicar nada). Al volver a estar visible,
  // se dispara un reporte inmediato en vez de esperar el próximo tick del
  // timer (que además siguió corriendo "de fondo" desalineado).
  const alCambiarVisibilidad = () => {
    if (document.visibilityState === "visible") {
      reportarUnaVez(token, publisher);
    }
  };
  document.addEventListener("visibilitychange", alCambiarVisibilidad);

  return () => {
    clearInterval(timer);
    document.removeEventListener("visibilitychange", alCambiarVisibilidad);
    publisher.cerrar();
  };
}
