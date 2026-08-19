/**
 * Deriva los marcadores del mapa a partir de datos ya expuestos por la API
 * de Central (Historia 1/2, 004-mapa-seguimiento-central). Lógica pura,
 * sin dependencia de Leaflet, para poder testearla sin montar el mapa.
 */

// FR-007: un recorrido sin ubicación conocida (lat/lon ausentes) no produce
// ningún marcador — nunca se inventa una posición por defecto.
export function construirMarcadoresFlete(recorridosActivos = []) {
  return recorridosActivos
    .filter((r) => r.ultimaUbicacion?.lat != null && r.ultimaUbicacion?.lon != null)
    .map((r) => ({
      recorridoId: r.id,
      fleteNombre: r.flete?.nombre ?? null,
      lat: r.ultimaUbicacion.lat,
      lon: r.ultimaUbicacion.lon,
      en: r.ultimaUbicacion.en,
      reciente: r.ultimaUbicacion.reciente,
    }));
}

// Radio de la Tierra en metros, para la fórmula de Haversine.
const RADIO_TIERRA_M = 6371000;

/**
 * Distancia en metros entre dos coordenadas (fórmula de Haversine),
 * 009-central-mejora-visual: usada para marcar si la posición GPS
 * registrada al arribar/descargar cayó cerca del destino del punto.
 */
export function distanciaMetros(lat1, lon1, lat2, lon2) {
  const radianes = (grados) => (grados * Math.PI) / 180;
  const dLat = radianes(lat2 - lat1);
  const dLon = radianes(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 + Math.cos(radianes(lat1)) * Math.cos(radianes(lat2)) * Math.sin(dLon / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return RADIO_TIERRA_M * c;
}

// Historia 2: puntos de entrega de un recorrido, con su estado, para
// dibujarlos en el mapa de detalle (FR-006). Se omiten los puntos sin
// coordenadas (no debería ocurrir, Principio II exige lat/lon válidos, pero
// se evita romper el mapa si llegara a pasar).
export function construirPuntosEnMapa(puntos = []) {
  return puntos
    .filter((p) => p.lat != null && p.lon != null)
    .map((p) => ({
      id: p.id,
      orden: p.orden,
      lat: p.lat,
      lon: p.lon,
      estado: p.estado,
    }));
}
