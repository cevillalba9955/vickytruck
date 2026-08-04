const BASE_URL = "/api/central";

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

async function enviarJson(url, body) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const respBody = await safeJson(res);
    throw new ApiError(respBody?.error || "error_desconocido", res.status);
  }
  return res.json();
}

/** Historia 1 (FR-001, FR-002): recorridos activos con progreso y ubicación. */
export async function listarActivos() {
  return (await obtenerJson(`${BASE_URL}/recorridos/activos`)).recorridos;
}

/** Historia 2 (FR-003): recorridos precargados sin flete asignado. */
export async function listarDisponibles() {
  return (await obtenerJson(`${BASE_URL}/recorridos/disponibles`)).recorridos;
}

/** Historia 2 (FR-004): fletes sin un recorrido activo asignado. */
export async function listarFletesDisponibles() {
  return (await obtenerJson(`${BASE_URL}/fletes/disponibles`)).fletes;
}

/** Historia 3 (FR-008): detalle completo de un recorrido. */
export function obtenerDetalle(recorridoId) {
  return obtenerJson(`${BASE_URL}/recorridos/${encodeURIComponent(recorridoId)}`);
}

/** Historia 5 (FR-010): recorridos finalizados con su línea de tiempo. */
export async function listarHistorial() {
  return (await obtenerJson(`${BASE_URL}/recorridos/historial`)).recorridos;
}

/** Historia 2 (FR-005, FR-006): asigna un recorrido disponible a un flete. */
export function asignarRecorrido(recorridoId, fleteId) {
  return enviarJson(`${BASE_URL}/recorridos/${encodeURIComponent(recorridoId)}/asignar`, { fleteId });
}

/** Historia 4 (FR-009): reasigna un recorrido activo a otro flete. */
export function reasignarRecorrido(recorridoId, fleteId) {
  return enviarJson(`${BASE_URL}/recorridos/${encodeURIComponent(recorridoId)}/reasignar`, { fleteId });
}
