// Caché local del recorrido (por-token) para sobrevivir un reload sin
// conectividad: la cola offline (offlineQueue.js) ya persiste las acciones
// pendientes, pero no la vista de la ruta en sí — sin esto, recargar la
// página estando offline tapa toda la ruta con la pantalla de error, aunque
// nada se haya perdido realmente.
const STORAGE_KEY_PREFIX = "vickytruck.chofer.recorridoCache.v1.";

export function guardarCacheRecorrido(token, data) {
  try {
    window.localStorage.setItem(STORAGE_KEY_PREFIX + token, JSON.stringify(data));
  } catch {
    // localStorage no disponible (modo privado, cuota excedida): se pierde
    // solo el fallback offline, no la carga normal con conectividad.
  }
}

export function leerCacheRecorrido(token) {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY_PREFIX + token);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}
