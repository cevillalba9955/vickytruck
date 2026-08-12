// Argentina no observa horario de verano desde 2009 (UTC-3 fijo todo el
// año), por lo que un offset constante es correcto en cualquier fecha —
// ver specs/006-normalizar-formato-horario/research.md Decisión 1.
const OFFSET_MINUTOS_AR = -180;

/**
 * Genera un timestamp ISO 8601 con la hora de pared de Argentina y offset
 * explícito `-03:00`, para el contrato de intercambio interno (reemplaza
 * `Date.prototype.toISOString()`, que siempre es UTC con sufijo `Z`).
 * No depende del `TZ` del proceso ni del reloj del dispositivo que lo llama.
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

const TOLERANCIA_FUTURO_MS = 5 * 60 * 1000;

/**
 * Valida la hora que manda el chofer en el momento de marcar (capturada en
 * el cliente para no perderla si la request queda encolada offline y se
 * reintenta más tarde — ver frontend/src/services/api.js). Devuelve un
 * `Date` si es un ISO parseable y no cae más de 5 minutos en el futuro
 * respecto del reloj del servidor (guarda contra un reloj de celular mal
 * configurado pisando el dato de auditoría que consume Oracle/APEX);
 * `null` en cualquier otro caso, para que el caller caiga al reloj del
 * servidor como hacía antes.
 */
export function parsearClienteEn(iso) {
  if (!iso) return null;
  const fecha = new Date(iso);
  if (Number.isNaN(fecha.getTime())) return null;
  if (fecha.getTime() - Date.now() > TOLERANCIA_FUTURO_MS) return null;
  return fecha;
}
