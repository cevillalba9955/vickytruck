/**
 * aplicarUbicacionViva (013-mqtt-a-backend-directo): matchea un evento de
 * ubicación en tiempo real (suscripción MQTT directa desde el navegador,
 * ver mqttClient.js) contra la lista de recorridos activos ya cargada por
 * polling, actualizando `ultimaUbicacion` in-place. Matchea por
 * `chofer.id` (identidad estable del chofer, misma clave que ya usa
 * `GET /api/central/recorridos/activos`) — antes matcheaba por
 * `flete.id`/`evento.fleteId`, campo que el payload MQTT ya no incluye
 * desde 012-ubicacion-por-chofer (2026-08-21): ese matching nunca
 * encontraba el recorrido correcto desde esa fecha, dejando este push en
 * tiempo real efectivamente inoperante (el polling REST de respaldo
 * enmascaraba el síntoma, ya que sigue reflejando la posición con menor
 * cadencia).
 */
export function aplicarUbicacionViva(recorridosActivos, evento) {
  return recorridosActivos.map((r) => {
    if (String(r.chofer?.id) !== String(evento.choferId)) return r;
    return {
      ...r,
      ultimaUbicacion: {
        lat: evento.lat,
        lon: evento.lon,
        en: evento.en,
        reciente: true,
      },
    };
  });
}
