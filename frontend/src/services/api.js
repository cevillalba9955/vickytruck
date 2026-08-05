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

function rutaEvento(token, puntoId, tipo) {
  return `${BASE_URL}/${encodeURIComponent(token)}/puntos/${encodeURIComponent(puntoId)}/${tipo}`;
}

async function enviarEvento(tipo, token, puntoId) {
  const ubicacion = await obtenerUbicacionBestEffort();
  const body = JSON.stringify(ubicacion ? { lat: ubicacion.lat, lon: ubicacion.lon } : {});

  let res;
  try {
    res = await fetch(rutaEvento(token, puntoId, tipo), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
    });
  } catch {
    // Fallo de red (offline): encolar para reintento automático (FR-010),
    // sin bloquear ni marcar la acción como error para el chofer.
    encolar({ tipo, token, puntoId, ubicacion });
    return { queued: true };
  }

  if (!res.ok) {
    const respBody = await safeJson(res);
    throw new ApiError(respBody?.error || "error_desconocido", res.status);
  }
  return { queued: false, data: await res.json() };
}

/** Marca "arribo" sobre un punto (US2). No exige orden entre puntos. */
export function marcarArribo(token, puntoId) {
  return enviarEvento("arribo", token, puntoId);
}

/** Marca "descarga completa" sobre un punto (US3). Requiere arribo previo. */
export function marcarDescarga(token, puntoId) {
  return enviarEvento("descarga", token, puntoId);
}

/**
 * Arranca el reintento automático de la cola offline. Devuelve una función
 * para desregistrar los listeners (útil en tests/cleanup de componentes).
 */
export function iniciarSincronizacionOffline() {
  return iniciarReintentoAutomatico(async (item) => {
    const res = await fetch(rutaEvento(item.token, item.puntoId, item.tipo), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(item.ubicacion ? { lat: item.ubicacion.lat, lon: item.ubicacion.lon } : {}),
    });
    // 2xx: aplicado. 404/409: ya no aplica o inválido, no tiene sentido
    // reintentar de nuevo. Solo un error de servidor (5xx) o de red amerita
    // reintentar más tarde (mantiene el item en la cola).
    if (!res.ok && res.status >= 500) {
      throw new Error("reintentar_luego");
    }
  });
}
