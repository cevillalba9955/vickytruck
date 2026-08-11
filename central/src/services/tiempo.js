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
