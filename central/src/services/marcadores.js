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

// 009-central-mejora-visual: radio de tolerancia entre la posición GPS
// capturada al marcar arribo/descarga y el destino real del punto. Un valor
// fuera de este radio no bloquea nada (no hay geocerca, ver
// specs/008-registro-inicio-fin-recorrido/spec.md) — es solo una señal
// visual para que el operador de Central revise el caso. Exportado (antes
// vivía solo en RecorridoDetalle.jsx) para que la tabla y el mapa de
// Detalle (014-mapa-historial-hora-distancia) usen el mismo umbral sin
// duplicarlo.
export const RADIO_PROXIMIDAD_M = 500;

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

// 014-mapa-historial-hora-distancia, FR-002/FR-003: evalúa si la posición
// GPS de un evento (llegada/descarga) quedó fuera de RADIO_PROXIMIDAD_M
// respecto del destino del punto. `null` cuando el evento no tiene
// coordenadas registradas (no se puede calcular, y no debe confundirse con
// "dentro de rango").
function evaluarAlertaEvento(puntoLat, puntoLon, eventoLat, eventoLon) {
  if (eventoLat == null || eventoLon == null) return null;
  return distanciaMetros(puntoLat, puntoLon, eventoLat, eventoLon) > RADIO_PROXIMIDAD_M;
}

// 014-mapa-historial-hora-distancia, US2 (FR-005/FR-006/FR-007): marcador
// de inicio o de cierre del recorrido para el mapa de Detalle, a partir de
// un evento ya calculado por el llamador (`primerEventoConUbicacion` para
// inicio, `recorrido.cierreEn/cierreLat/cierreLon` para cierre). `null`
// cuando no hay evento o le faltan coordenadas — no se inventa una
// posición (mismo criterio que `construirMarcadoresFlete`).
export function construirMarcadorExtremo(evento, tipo) {
  if (evento?.lat == null || evento?.lon == null) return null;
  return { tipo, iso: evento.iso, lat: evento.lat, lon: evento.lon };
}

// Historia 2: puntos de entrega de un recorrido, con su estado, para
// dibujarlos en el mapa de detalle (FR-006). Se omiten los puntos sin
// coordenadas (no debería ocurrir, Principio II exige lat/lon válidos, pero
// se evita romper el mapa si llegara a pasar).
//
// 014-mapa-historial-hora-distancia, FR-001/FR-002/FR-003/FR-004: además
// del estado, cada punto de salida trae `arriboEn`/`descargaEn` (para
// mostrar la hora en el mapa) y `alerta.{llegada,descarga}` (para marcar
// visualmente cuándo esa posición quedó fuera de la distancia mínima
// esperada), evaluados por separado por evento.
export function construirPuntosEnMapa(puntos = []) {
  return puntos
    .filter((p) => p.lat != null && p.lon != null)
    .map((p) => ({
      id: p.id,
      orden: p.orden,
      lat: p.lat,
      lon: p.lon,
      estado: p.estado,
      arriboEn: p.arriboEn ?? null,
      descargaEn: p.descargaEn ?? null,
      alerta: {
        llegada: evaluarAlertaEvento(p.lat, p.lon, p.arriboLat, p.arriboLon),
        descarga: evaluarAlertaEvento(p.lat, p.lon, p.descargaLat, p.descargaLon),
      },
    }));
}
