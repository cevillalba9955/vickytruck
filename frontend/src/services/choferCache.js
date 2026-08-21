// Caché local del último chofer que usó este dispositivo (012-ubicacion-por-chofer,
// FR-004): a diferencia de recorridoCache.js (por-token, no se usa ante un
// 404 real), esta caché existe justamente para seguir intentando reportar
// ubicación cuando el backend ya no reconoce el viaje/enlace vigente
// (store en memoria vaciado por un deploy, ver Constitución v5.0.0
// Principio VII) — no está scopeada por token, representa "el último chofer
// conocido en este teléfono", que en la práctica es 1:1 con el dispositivo.
const STORAGE_KEY = "vickytruck.chofer.ultimoChofer.v1";

export function guardarCacheChofer({ choferId, mqtt }) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ choferId, mqtt }));
  } catch {
    // localStorage no disponible (modo privado, cuota excedida): se pierde
    // solo la resiliencia ante un store de backend vacío, no el
    // funcionamiento normal de la app.
  }
}

export function leerCacheChofer() {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}
