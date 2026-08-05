// Vacío en dev (el proxy de vite.config.js reenvía /api a localhost:3001);
// en producción (Cloudflare Workers) apunta al backend real en Fly.io, ver
// .env.production.
const BASE_URL = `${import.meta.env.VITE_API_BASE_URL || ""}/api/central`;

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

async function obtenerJson(url) {
  const res = await fetch(url);
  if (!res.ok) {
    const body = await safeJson(res);
    throw new ApiError(body?.error || "error_desconocido", res.status);
  }
  return res.json();
}

/** Historia 1 (FR-001, FR-002): recorridos activos con progreso y ubicación. */
export async function listarActivos() {
  return (await obtenerJson(`${BASE_URL}/recorridos/activos`)).recorridos;
}

/** Historia 3 (FR-008): detalle completo de un recorrido. */
export function obtenerDetalle(recorridoId) {
  return obtenerJson(`${BASE_URL}/recorridos/${encodeURIComponent(recorridoId)}`);
}

/** Historia 5 (FR-010): recorridos finalizados con su línea de tiempo. */
export async function listarHistorial() {
  return (await obtenerJson(`${BASE_URL}/recorridos/historial`)).recorridos;
}
