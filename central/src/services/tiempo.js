// Argentina no observa horario de verano desde 2009 (UTC-3 fijo todo el
// año), por lo que un offset constante es correcto en cualquier fecha —
// ver specs/006-normalizar-formato-horario/research.md Decisión 1.
// Duplicado deliberadamente en backend/frontend/central (Decisión 6): no
// hay tooling de monorepo entre los 3 despliegues independientes.
const OFFSET_MINUTOS_AR = -180;

/**
 * Genera un timestamp ISO 8601 con la hora de pared de Argentina y offset
 * explícito `-03:00` (reemplaza `Date.prototype.toISOString()`, siempre
 * UTC). No depende de la zona horaria del dispositivo del operador.
 */
export function ahoraLocalIso(fecha = new Date()) {
  const desplazada = new Date(fecha.getTime() + OFFSET_MINUTOS_AR * 60000);
  return desplazada.toISOString().replace("Z", "") + "-03:00";
}

const formateadorHora = new Intl.DateTimeFormat("es-AR", {
  timeZone: "America/Argentina/Buenos_Aires",
  hour12: false,
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
});

/**
 * Formatea cualquier timestamp ISO 8601 (con offset `-03:00` nuevo o `Z`
 * histórico, sin migrar — FR-006) como `HH:MM:SS` de Buenos Aires. Siempre
 * reconvierte a partir del instante real; nunca asume que el string de
 * entrada ya está en hora local (ver research.md Decisión 2).
 */
export function formatearHoraLocal(iso) {
  return formateadorHora.format(new Date(iso));
}

const formateadorFecha = new Intl.DateTimeFormat("es-AR", {
  timeZone: "America/Argentina/Buenos_Aires",
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
});

/**
 * Formatea cualquier timestamp ISO 8601 como fecha `DD/MM/AAAA` de Buenos
 * Aires (009-central-mejora-visual, columna "Fecha" de Historial) — mismo
 * criterio de reconversión que `formatearHoraLocal`.
 */
export function formatearFechaLocal(iso) {
  return formateadorFecha.format(new Date(iso));
}

/**
 * Duración en minutos enteros, formateada como `"Xh Ym"` (o `"Y min"` si
 * dura menos de una hora) — 009-central-mejora-visual, columna "Tiempo
 * total" de Historial. `null`/negativo da "—".
 */
export function formatearDuracionMin(minutos) {
  if (minutos == null || minutos < 0) return "—";
  const horas = Math.floor(minutos / 60);
  const resto = minutos % 60;
  return horas > 0 ? `${horas}h ${resto}min` : `${resto} min`;
}

/**
 * Primer evento registrado de un recorrido (009-central-mejora-visual,
 * "Hora inicio" del encabezado de RecorridoDetalle y "Tiempo total" de
 * Historial): el `inicioEn` más temprano entre los puntos; si ningún punto
 * tiene `inicioEn` (dato nuevo de 008, puede faltar en recorridos viejos),
 * cae al `arriboEn` más temprano. `null` si no hay ningún evento.
 */
export function primerEventoIso(puntos) {
  const inicios = puntos.map((p) => p.inicioEn).filter(Boolean);
  const eventos = inicios.length > 0 ? inicios : puntos.map((p) => p.arriboEn).filter(Boolean);
  if (eventos.length === 0) return null;
  return eventos.reduce((min, e) => (new Date(e) < new Date(min) ? e : min));
}

/**
 * Mismo evento que `primerEventoIso` (inicioEn más temprano, o arriboEn si
 * ningún punto tiene inicioEn), pero devolviendo también la ubicación GPS
 * capturada en ese evento — 008-registro-inicio-fin-recorrido, User Story 3
 * (2026-08-25, research.md Decisión 7): Central ahora puede mostrar de dónde
 * salió el chofer, no solo a qué hora. `{ iso, lat, lon }`, con `lat`/`lon`
 * en `null` si el dispositivo no proveyó ubicación en ese evento; `null`
 * completo si no hay ningún evento registrado (mismo caso que `primerEventoIso`).
 */
export function primerEventoConUbicacion(puntos) {
  const conInicio = puntos.filter((p) => p.inicioEn);
  const candidatos =
    conInicio.length > 0
      ? conInicio.map((p) => ({ iso: p.inicioEn, lat: p.inicioLat ?? null, lon: p.inicioLon ?? null }))
      : puntos.filter((p) => p.arriboEn).map((p) => ({ iso: p.arriboEn, lat: p.arriboLat ?? null, lon: p.arriboLon ?? null }));
  if (candidatos.length === 0) return null;
  return candidatos.reduce((min, e) => (new Date(e.iso) < new Date(min.iso) ? e : min));
}

/**
 * Duración total del recorrido en minutos, desde `primerEventoIso(puntos)`
 * hasta `cierreEn` (o hasta `ahora` si todavía no se finalizó — un recorrido
 * activo muestra el tiempo transcurrido hasta el momento). `null` si no hay
 * ningún evento de inicio registrado.
 */
export function calcularTiempoTotalMin(puntos, cierreEn, ahora = new Date()) {
  const inicioIso = primerEventoIso(puntos);
  if (!inicioIso) return null;
  const finMs = cierreEn ? new Date(cierreEn).getTime() : ahora.getTime();
  const diffMs = finMs - new Date(inicioIso).getTime();
  if (!Number.isFinite(diffMs) || diffMs < 0) return null;
  return Math.round(diffMs / 60000);
}

/**
 * Minutos enteros transcurridos desde `iso` hasta `ahora` (009-central-
 * mejora-visual): usado en Monitoreo para mostrar "hace cuánto" fue la
 * última lectura de ubicación, en vez de la hora absoluta. `null` si `iso`
 * es nulo/indefinido. Nunca negativo (un reloj de cliente ligeramente
 * adelantado no debe mostrar minutos negativos).
 */
export function minutosTranscurridos(iso, ahora = new Date()) {
  if (!iso) return null;
  const ms = ahora.getTime() - new Date(iso).getTime();
  return Math.max(0, Math.floor(ms / 60000));
}
