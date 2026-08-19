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
