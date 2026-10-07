/**
 * Ejecuta `fn` de inmediato y luego cada `intervalMs`, hasta que se llame a
 * la función de limpieza devuelta (FR-002: refresco automático sin recarga
 * manual). No superpone llamadas: espera a que `fn` termine antes de
 * programar la siguiente.
 */
export function pollEvery(intervalMs, fn) {
  let cancelado = false;
  let timer = null;

  async function tick() {
    if (cancelado) return;
    try {
      await fn();
    } finally {
      if (!cancelado) timer = setTimeout(tick, intervalMs);
    }
  }

  tick();

  return () => {
    cancelado = true;
    if (timer) clearTimeout(timer);
  };
}

const INTERVALO_POLLING_MQTT_CONECTADO_MS = 30000;
const INTERVALO_POLLING_RESPALDO_MS = 5000;

/**
 * Cadencia del polling REST. Solo se relaja a modo "respaldo lento" si el
 * broker está conectado Y están llegando eventos de ubicación por él: desde
 * 013-mqtt-a-backend-directo los celulares reportan por POST directo (no por
 * MQTT), así que Central puede estar conectado al broker sin recibir nada, y
 * entonces el polling es la única vía de ubicación en vivo.
 */
export function calcularIntervaloPolling({ mqttEstado, recibiendoEventosMqtt }) {
  return mqttEstado === "connected" && recibiendoEventosMqtt
    ? INTERVALO_POLLING_MQTT_CONECTADO_MS
    : INTERVALO_POLLING_RESPALDO_MS;
}
