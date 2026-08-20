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

// Paleta fija (010-mapa-central-unificado, FR-002): un color por flete
// activo, reciclada con módulo si hubiera más fletes activos que colores
// (escenario fuera del rango esperado de "menos de 10 simultáneos").
const PALETA_COLOR_RECORRIDO = [
  "#2c5f8a",
  "#c0392b",
  "#1a7f37",
  "#8e44ad",
  "#d68910",
  "#117864",
  "#a04000",
  "#1f618d",
  "#943126",
  "#5b2c6f",
];

// Asigna un color por flete (no por recorrido ni por posición arbitraria,
// FR-002) — un flete no tiene más de un recorrido activo a la vez, así que
// dentro de una misma respuesta ambas claves coinciden. Sin persistir
// ningún estado entre llamadas (research.md, Decisión 3): dos llamadas con
// distinto conjunto de recorridos activos pueden asignar distinto color al
// mismo flete. Si el recorrido trae `color` explícito (Oracle, FR-002a), ese
// valor tiene prioridad absoluta sobre la paleta.
export function asignarColorPorFlete(recorridosActivos = []) {
  const colores = new Map();
  let indice = 0;
  for (const r of recorridosActivos) {
    const claveFlete = r.flete?.id ?? r.id;
    if (colores.has(claveFlete)) continue;
    colores.set(claveFlete, r.color ?? PALETA_COLOR_RECORRIDO[indice % PALETA_COLOR_RECORRIDO.length]);
    indice += 1;
  }
  return colores;
}

// Marcadores unificados del mapa consolidado (010-mapa-central-unificado,
// US1): a diferencia de construirMarcadoresFlete/construirPuntosEnMapa (que
// alimentan por separado el mapa general y el de Detalle), esta función
// combina, para TODOS los recorridos activos a la vez, un marcador `tipo:
// "flete"` (si tiene ubicación conocida, FR-007) y un marcador `tipo:
// "punto"` por cada punto con coordenadas válidas, todos con el color de su
// flete (asignarColorPorFlete).
// `puntoSalidaDefault` (010-mapa-central-unificado, US4): opcional — cuando
// se pasa, agrega un ÚNICO marcador `tipo: "salidaDefault"` (sin color,
// Clarifications de spec.md), independientemente de cuántos recorridos
// activos compartan ese origen (FR-006). Un recorrido con `puntoSalida`
// propio agrega, además, su propio marcador `tipo: "salidaRecorrido"` con el
// color de su flete.
export function construirMarcadoresMapaUnificado(recorridosActivos = [], puntoSalidaDefault = null) {
  const colores = asignarColorPorFlete(recorridosActivos);
  const marcadores = [];
  for (const r of recorridosActivos) {
    const claveFlete = r.flete?.id ?? r.id;
    const color = colores.get(claveFlete);

    if (r.ultimaUbicacion?.lat != null && r.ultimaUbicacion?.lon != null) {
      marcadores.push({
        tipo: "flete",
        recorridoId: r.id,
        color,
        lat: r.ultimaUbicacion.lat,
        lon: r.ultimaUbicacion.lon,
        fleteNombre: r.flete?.nombre ?? null,
        reciente: r.ultimaUbicacion.reciente,
      });
    }

    for (const p of r.puntos ?? []) {
      if (p.lat == null || p.lon == null) continue;
      marcadores.push({
        tipo: "punto",
        id: p.id,
        recorridoId: r.id,
        color,
        lat: p.lat,
        lon: p.lon,
        estado: p.estado,
        cliente: p.cliente ?? null,
        orden: p.orden,
      });
    }

    if (r.puntoSalida?.lat != null && r.puntoSalida?.lon != null) {
      marcadores.push({
        tipo: "salidaRecorrido",
        recorridoId: r.id,
        color,
        lat: r.puntoSalida.lat,
        lon: r.puntoSalida.lon,
      });
    }
  }

  if (puntoSalidaDefault?.lat != null && puntoSalidaDefault?.lon != null) {
    marcadores.push({
      tipo: "salidaDefault",
      color: null,
      lat: puntoSalidaDefault.lat,
      lon: puntoSalidaDefault.lon,
    });
  }

  return marcadores;
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
