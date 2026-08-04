// Aprovisiona/revoca la credencial MQTT de un flete (username=token) contra
// la API de administración de EMQX Cloud (research.md §2 de
// 003-mqtt-broker-fletes). Usa la misma forma de API que el resto de EMQX
// (Built-in Database de autenticación, endpoints `/authentication/{id}/users`),
// expuesta por EMQX Cloud bajo su Deployment API (`{base}/api/v5/deployments/{deploymentId}/...`).
//
// IMPORTANTE: el path exacto y el identificador del mecanismo de
// autenticación (`authId`) son un supuesto razonable a confirmar contra la
// instancia real de EMQX Cloud durante el despliegue (mismo criterio que ya
// se usó para nombres de tabla/vista de Oracle en 001/002-recorrido) — ver
// EMQX_CLOUD_AUTH_ID más abajo, ajustable sin tocar código.

function apiBaseUrl() {
  return process.env.EMQX_CLOUD_API_BASE_URL || "https://cloud-intl.emqx.com";
}

function deploymentId() {
  const id = process.env.EMQX_CLOUD_DEPLOYMENT_ID;
  if (!id) throw new Error("EMQX_CLOUD_DEPLOYMENT_ID no configurado");
  return id;
}

function authId() {
  return process.env.EMQX_CLOUD_AUTH_ID || "password_based:built_in_database";
}

function credencialesAdmin() {
  const apiKey = process.env.EMQX_CLOUD_API_KEY;
  const apiSecret = process.env.EMQX_CLOUD_API_SECRET;
  if (!apiKey || !apiSecret) {
    throw new Error("EMQX_CLOUD_API_KEY / EMQX_CLOUD_API_SECRET no configurados");
  }
  return { apiKey, apiSecret };
}

function usersUrl() {
  return `${apiBaseUrl()}/api/v5/deployments/${deploymentId()}/authentication/${authId()}/users`;
}

function userUrl(token) {
  return `${usersUrl()}/${encodeURIComponent(token)}`;
}

function authHeader() {
  const { apiKey, apiSecret } = credencialesAdmin();
  const basic = Buffer.from(`${apiKey}:${apiSecret}`).toString("base64");
  return `Basic ${basic}`;
}

function generarPassword() {
  return globalThis.crypto?.randomUUID ? globalThis.crypto.randomUUID() : `${Date.now()}-${Math.random()}`;
}

/**
 * Crea (o actualiza) la credencial MQTT de un token de recorrido y devuelve
 * SIEMPRE la contraseña vigente para ese `username`. Es un upsert idempotente
 * a propósito: `GET /:token` (recorrido.js) la llama en cada carga de la SPA
 * del chofer en vez de cachear el resultado en algún lado — así no hay
 * ningún estado local que pueda quedar desincronizado de EMQX Cloud (ej.
 * tras un reinicio del backend) ni que dependa de que Oracle tenga una
 * columna nueva (Principio IV). `fetchImpl` es inyectable para poder testear
 * sin llamar a la API real de EMQX Cloud.
 */
export function createEmqxProvisioning(fetchImpl = fetch) {
  return {
    async provisionarCredencial(token) {
      const password = generarPassword();
      const res = await fetchImpl(usersUrl(), {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: authHeader() },
        body: JSON.stringify({ user_id: token, password }),
      });
      if (res.ok) return { username: token, password };

      if (res.status === 409) {
        // Ya existía (llamada anterior a este mismo token): actualizar la
        // contraseña para que quede igual a la que se devuelve acá.
        const resUpdate = await fetchImpl(userUrl(token), {
          method: "PUT",
          headers: { "Content-Type": "application/json", Authorization: authHeader() },
          body: JSON.stringify({ password }),
        });
        if (!resUpdate.ok) {
          throw new Error(`emqx_provisionar_fallo: ${resUpdate.status}`);
        }
        return { username: token, password };
      }

      throw new Error(`emqx_provisionar_fallo: ${res.status}`);
    },

    async revocarCredencial(token) {
      if (!token) return; // no-op si no había credencial previa (ej. primera asignación)
      const res = await fetchImpl(userUrl(token), {
        method: "DELETE",
        headers: { Authorization: authHeader() },
      });
      // 404 = ya no existía: idempotente, no es un error (FR-008, US3).
      if (!res.ok && res.status !== 404) {
        throw new Error(`emqx_revocar_fallo: ${res.status}`);
      }
    },
  };
}
