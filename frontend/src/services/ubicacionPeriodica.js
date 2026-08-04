import { obtenerUbicacionBestEffort } from "./geolocation.js";
import { publicar } from "./mqttClient.js";

// FR-001, FR-014: el reporte periódico ahora se publica en el bróker MQTT
// (retained, QoS 0 — research.md §3 de 003-mqtt-broker-fletes) en vez de
// hacer POST directo al backend.
async function reportarUnaVez(ubicacionTopic) {
  const ubicacion = await obtenerUbicacionBestEffort();
  if (!ubicacion) return; // sin GPS disponible: se omite este reporte (best-effort)

  try {
    await publicar(
      ubicacionTopic,
      { lat: ubicacion.lat, lon: ubicacion.lon, en: new Date().toISOString() },
      { qos: 0, retain: true },
    );
  } catch {
    // Sin conectividad con el bróker: a diferencia de arribo/descarga, este
    // reporte NO se encola (FR-012 — es un dato efímero, no crítico); se
    // reintenta solo en el próximo ciclo del temporizador.
  }
}

/**
 * Arranca el reporte periódico de ubicación instantánea (FR-001, FR-014)
 * mientras el recorrido está activo. Devuelve una función para detener el
 * temporizador.
 */
export function iniciarReportePeriodico(ubicacionTopic, intervaloMs) {
  const timer = setInterval(() => {
    reportarUnaVez(ubicacionTopic);
  }, intervaloMs);

  return () => clearInterval(timer);
}
