// Lógica pura (sin I/O) para resolver la última ubicación conocida de un
// flete (FR-016, FR-017 de 002-panel-control-central; research.md §8):
// prioridad memoria -> respaldo del último evento arribo/descarga persistido
// en Oracle -> sin datos. El mismo umbral de "reciente" aplica sin importar
// la fuente.

/**
 * Busca, entre los puntos de un recorrido (con arribo/descarga lat/lon ya
 * leídos por centralRepository), el evento con la marca de tiempo más
 * reciente que tenga ubicación asociada. Devuelve `null` si ninguno tiene
 * ubicación registrada.
 */
export function obtenerRespaldoDesdeEventos(puntos) {
  let mejor = null;

  const considerar = (en, lat, lon) => {
    if (en == null || lat == null || lon == null) return;
    if (!mejor || new Date(en).getTime() > new Date(mejor.en).getTime()) {
      mejor = { lat, lon, en };
    }
  };

  for (const p of puntos) {
    considerar(p.arriboEn, p.arriboLat, p.arriboLon);
    considerar(p.descargaEn, p.descargaLat, p.descargaLon);
  }

  return mejor;
}

/**
 * Combina la posición en memoria (prioridad 1) con el respaldo de Oracle
 * (prioridad 2) y aplica el umbral de antigüedad configurado, sin importar
 * cuál de las dos fuentes se haya usado.
 */
export function resolverUbicacion({ enMemoria, respaldoOracle, staleMs, ahora }) {
  const fuente = enMemoria ?? respaldoOracle ?? null;

  if (!fuente) {
    return { lat: null, lon: null, en: null, reciente: false };
  }

  const enMs = new Date(fuente.en).getTime();
  return {
    lat: fuente.lat,
    lon: fuente.lon,
    // No se re-serializa con toISOString(): eso forzaría UTC ('Z') y
    // descartaría el offset local ('-03:00') que ya trae `fuente.en` desde
    // el origen (006-normalizar-formato-horario, research.md Decisión 1).
    en: fuente.en,
    reciente: ahora - enMs <= staleMs,
  };
}
