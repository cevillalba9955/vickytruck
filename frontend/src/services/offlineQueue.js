// Cola de reintento offline (FR-010): guarda en localStorage las acciones de
// marcado que no se pudieron enviar por falta de conectividad, y las reintenta
// automáticamente al reconectar. Ver research.md §4 (por qué localStorage) y
// §6 (por qué el backend trata los reintentos como idempotentes).
const STORAGE_KEY = "vickytruck.chofer.colaOffline.v1";

function leerCola() {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function guardarCola(cola) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(cola));
  } catch {
    // localStorage no disponible (modo privado, cuota excedida): la acción ya
    // se intentó enviar antes de encolar, así que solo se pierde el reintento
    // automático, no el evento en sí si la red está disponible.
  }
}

/** Agrega una acción a la cola y devuelve su id. */
export function encolar(accion) {
  const cola = leerCola();
  const item = { id: `${Date.now()}-${Math.random().toString(36).slice(2)}`, ...accion };
  cola.push(item);
  guardarCola(cola);
  return item.id;
}

export function listar() {
  return leerCola();
}

export function quitar(id) {
  guardarCola(leerCola().filter((item) => item.id !== id));
}

let reintentando = false;

/**
 * Recorre la cola en orden y ejecuta `ejecutarAccion` para cada una. Se
 * detiene ante el primer fallo (probablemente seguimos offline) para no
 * reordenar eventos ni martillar la red; se reintenta en la próxima llamada.
 */
export async function reintentarCola(ejecutarAccion) {
  if (reintentando) return;
  reintentando = true;
  try {
    const cola = leerCola();
    for (const item of cola) {
      try {
        await ejecutarAccion(item);
        quitar(item.id);
      } catch {
        break;
      }
    }
  } finally {
    reintentando = false;
  }
}

/** Registra los listeners que disparan el reintento automático. */
export function iniciarReintentoAutomatico(ejecutarAccion) {
  const disparar = () => reintentarCola(ejecutarAccion);
  window.addEventListener("online", disparar);
  disparar();
  return () => window.removeEventListener("online", disparar);
}
