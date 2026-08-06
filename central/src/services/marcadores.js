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
