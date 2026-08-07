import { obtenerUbicacionBestEffort } from "./geolocation.js";
import { encolar, iniciarReintentoAutomatico } from "./offlineQueue.js";

// Vacío en dev (el proxy de vite.config.js reenvía /api a localhost:3001);
// en producción (Cloudflare Workers) apunta al backend real en Fly.io, ver
// .env.production.
const BASE_URL = `${import.meta.env.VITE_API_BASE_URL || ""}/api/recorridos`;

export class ApiError extends Error {
  constructor(codigo, status) {
    super(codigo);
    this.codigo = codigo;
    this.status = status;
  }
}

async function safeJson(res) {
  try {
    return await res.json();
  } catch {
    return null;
  }
}

/** GET del recorrido completo (US1). Lanza ApiError si el token es inválido. */
export async function obtenerRecorrido(token) {
  const res = await fetch(`${BASE_URL}/${encodeURIComponent(token)}`);
  if (!res.ok) {
    const body = await safeJson(res);
    throw new ApiError(body?.error || "error_desconocido", res.status);
  }
  return res.json();
}

// Construye la URL de cada tipo de acción encolable (005-chofer-estados-viaje)
// — se usa tanto al enviar en el momento como al reintentar desde la cola
// offline (FR-010 de 001-chofer-recorrido, FR-020a de esta feature).
export function rutaAccion(item) {
  const base = `${BASE_URL}/${encodeURIComponent(item.token)}`;
  switch (item.tipo) {
    case "arribo":
    case "descarga":
      return `${base}/puntos/${encodeURIComponent(item.puntoId)}/${item.tipo}`;
    case "viaje-iniciar":
      return `${base}/viaje/iniciar`;
    case "viaje-llegue":
      return `${base}/viaje/llegue`;
    case "viaje-descarga-completa":
      return `${base}/viaje/descarga-completa`;
    case "viaje-ir-primero":
      return `${base}/viaje/ir-primero`;
    default:
      throw new Error(`tipo de acción offline desconocido: ${item.tipo}`);
  }
}

function bodyPara(item) {
  if (item.tipo === "viaje-ir-primero") {
    return JSON.stringify({ puntoId: item.puntoId });
  }
  return JSON.stringify(item.ubicacion ? { lat: item.ubicacion.lat, lon: item.ubicacion.lon } : {});
}

async function enviarAccion(tipo, token, { puntoId, conUbicacion = false } = {}) {
  const ubicacion = conUbicacion ? await obtenerUbicacionBestEffort() : null;
  const item = { tipo, token, puntoId, ubicacion };
  const body = bodyPara(item);

  let res;
  try {
    res = await fetch(rutaAccion(item), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
    });
  } catch {
    // Fallo de red (offline): encolar para reintento automático, sin
    // bloquear ni marcar la acción como error para el chofer.
    const id = encolar(item);
    return { queued: true, id };
  }

  if (!res.ok) {
    const respBody = await safeJson(res);
    throw new ApiError(respBody?.error || "error_desconocido", res.status);
  }
  return { queued: false, data: await res.json() };
}

/** Marca "arribo" sobre un punto directo (no vía el flujo guiado). */
export function marcarArribo(token, puntoId) {
  return enviarAccion("arribo", token, { puntoId, conUbicacion: true });
}

/** Marca "descarga completa" sobre un punto directo (no vía el flujo guiado). */
export function marcarDescarga(token, puntoId) {
  return enviarAccion("descarga", token, { puntoId, conUbicacion: true });
}

/** Detenido -> Manejando sobre el primer punto pendiente (FR-007). */
export function iniciarViaje(token) {
  return enviarAccion("viaje-iniciar", token, {});
}

/** Manejando -> Descargando; marca arribo sobre el punto activo (FR-008, FR-009). */
export function marcarLlegue(token) {
  return enviarAccion("viaje-llegue", token, { conUbicacion: true });
}

/** Descargando -> Detenido; marca descarga sobre el punto activo (FR-010, FR-011). */
export function marcarDescargaCompleta(token) {
  return enviarAccion("viaje-descarga-completa", token, { conUbicacion: true });
}

/** Mueve `puntoId` (pendiente, no el primero) al frente, en Detenido (FR-014). */
export function irPrimero(token, puntoId) {
  return enviarAccion("viaje-ir-primero", token, { puntoId });
}

/**
 * Arranca el reintento automático de la cola offline. Devuelve una función
 * para desregistrar los listeners (útil en tests/cleanup de componentes).
 */
export function iniciarSincronizacionOffline() {
  return iniciarReintentoAutomatico(async (item) => {
    const res = await fetch(rutaAccion(item), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: bodyPara(item),
    });
    // 2xx: aplicado. 404/409: ya no aplica o inválido, no tiene sentido
    // reintentar de nuevo. Solo un error de servidor (5xx) o de red amerita
    // reintentar más tarde (mantiene el item en la cola).
    if (!res.ok && res.status >= 500) {
      throw new Error("reintentar_luego");
    }
  });
}
