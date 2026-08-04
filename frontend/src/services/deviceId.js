// Identificador de dispositivo persistente (004-chofer-cloud-broker, FR-005a):
// se usa como `clientId` MQTT para que el backend pueda distinguir "el mismo
// dispositivo reconectando" de "un dispositivo distinto" al atar el token de
// publicación al primero que lo usa (ver
// specs/004-chofer-cloud-broker/contracts/vinculo-dispositivo.md).

const STORAGE_KEY = "vickytruck.chofer.deviceId.v1";

function generarId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  // Fallback para navegadores sin crypto.randomUUID (no es criptográficamente
  // fuerte, pero alcanza: solo necesita ser distinto entre dispositivos).
  return `dev-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

// Si `localStorage` no está disponible (modo privado estricto, cuota
// agotada), se degrada a "cada carga de página cuenta como un dispositivo
// nuevo" (ver research.md §3) — este módulo mantiene el id en memoria para
// que al menos sea estable durante la sesión actual de la pestaña.
let idEnMemoria = null;

export function obtenerDeviceId() {
  try {
    const existente = window.localStorage.getItem(STORAGE_KEY);
    if (existente) return existente;

    const nuevo = generarId();
    window.localStorage.setItem(STORAGE_KEY, nuevo);
    return nuevo;
  } catch {
    if (!idEnMemoria) idEnMemoria = generarId();
    return idEnMemoria;
  }
}
