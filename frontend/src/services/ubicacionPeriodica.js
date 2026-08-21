import { obtenerUbicacionBestEffort } from "./geolocation.js";
import { createPublisherUbicacionMqtt } from "./ubicacionMqtt.js";

const BASE_URL = "/api/recorridos";

// MQTT es el canal primario (FR-004, actualizado 2026-08-10); el REST de
// abajo pasa a ser fallback silencioso, invocado solo cuando la publicación
// MQTT del ciclo no se pudo hacer (sin credencial todavía, broker caído,
// etc.) — antes se llamaba a ambos siempre, en paralelo. `publisher.publicar`
// resuelve `false` tanto si no hay `mqttConfig` (recorrido.mqtt === null)
// como si el publish real falló (ver ubicacionMqtt.js).
async function reportarUnaVez(token, publisher) {
  const ubicacion = await obtenerUbicacionBestEffort();
  if (!ubicacion) return; // sin GPS disponible: se omite este reporte (best-effort)

  let publicadoPorMqtt = false;
  try {
    publicadoPorMqtt = await publisher.publicar({ lat: ubicacion.lat, lon: ubicacion.lon, recorridoId: token });
  } catch {
    publicadoPorMqtt = false;
  }

  if (publicadoPorMqtt) return;

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
}

/**
 * Arranca el reporte periódico de ubicación instantánea (FR-014) mientras el
 * recorrido está activo. Devuelve una función para detener el temporizador.
 *
 * El publisher MQTT usa `choferId` para el topic de publicación (Central lo
 * busca por `choferId`, no por token — ver mqttBridge.js, 012-ubicacion-por-chofer),
 * y la credencial en sí (`mqttConfig`, devuelta por GET /:token →
 * `recorrido.mqtt`) es la permanente del chofer (FR-013, 2026-08-10) — no
 * scoped a un fleteId puntual. El reporte HTTP usa `token` (identifica el
 * recorrido vía enlace) y ahora es solo fallback si la publicación MQTT del
 * ciclo falla (ver reportarUnaVez).
 */
export function iniciarReportePeriodico(token, choferId, mqttConfig, intervaloMs) {
  const publisher = createPublisherUbicacionMqtt(choferId, mqttConfig);

  // Disparo inmediato al arrancar (012-ubicacion-por-chofer, FR-002): el
  // chofer rara vez deja la app abierta el tiempo suficiente para que el
  // setInterval de abajo llegue a disparar — el momento real de oportunidad
  // es cuando abre la app, no un timer corriendo en segundo plano.
  reportarUnaVez(token, publisher);

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
