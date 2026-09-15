// canalUbicacionPreferido (013-mqtt-a-backend-directo): un solo flag de
// entorno decide si el reporte de ubicación del chofer usa el broker MQTT
// externo o va directo al backend. "directo" es el default — cualquier
// valor ausente, vacío o distinto de "broker" cae ahí (ver
// contracts/ubicacion-canal-config.md, research.md Decisión 1). Nunca se
// cachea entre llamadas: se relee `process.env` en cada invocación, para
// que los tests puedan cambiarlo en runtime sin reiniciar el proceso.
export function canalUbicacionPreferido() {
  const valor = String(process.env.UBICACION_CANAL_PREFERIDO || "").trim().toLowerCase();
  return valor === "broker" ? "broker" : "directo";
}
