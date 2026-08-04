import { createHmac } from "node:crypto";

// Aprovisiona/revoca la credencial MQTT de un flete (username=token) contra
// la API HTTP nativa (v5) del propio deployment de EMQX Cloud — NO la
// "Platform API" a nivel cuenta (esa vive bajo cloud-intl.emqx.com y sirve
// para gestionar deployments/facturación, no usuarios MQTT). Cada deployment
// Serverless expone su propia API en `https://<host-del-deployment>:8443/api/v5`
// (visible en la consola, sección "Connect"/"Overview" del deployment) — ese
// es el valor esperado en EMQX_CLOUD_API_URL, SIN agregar nada más al final.
// Confirmado empíricamente (2026-08-04): `{EMQX_CLOUD_API_URL}/authentication`
// responde (403 con credenciales inválidas, no 404), o sea que el path es
// `/authentication/{authId}/users` directo, sin prefijo de deployment.
//
// IMPORTANTE: `authId` (identificador del mecanismo de autenticación) es un
// supuesto razonable (`password_based:built_in_database`, el nombre estándar
// de EMQX v5 para la base de usuarios integrada) a confirmar contra el
// deployment real si algo devuelve 404 en vez de 401/403/409 — ajustable vía
// EMQX_CLOUD_AUTH_ID sin tocar código.
//
// Aislamiento por flete (FR-006, US3): el endpoint de ACL "built_in_database"
// (`/authorization/sources/built_in_database/rules/users`) asigna reglas a un
// username LITERAL, no soporta un placeholder ${username} que aplique a
// cualquier usuario futuro (eso se probó contra el deployment real: HTTP 400
// con un intento de regla global — ver git history de emqx-setup.js). Por
// eso cada token recibe su propia regla explícita (`topic` con el token ya
// resuelto) en el mismo momento en que se crea su credencial, en vez de una
// regla global preconfigurada.

function apiBaseUrl() {
  const url = process.env.EMQX_CLOUD_API_URL;
  if (!url) throw new Error("EMQX_CLOUD_API_URL no configurado");
  return url;
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
  return `${apiBaseUrl()}/authentication/${authId()}/users`;
}

function userUrl(token) {
  return `${usersUrl()}/${encodeURIComponent(token)}`;
}

function reglasUsuariosUrl() {
  return `${apiBaseUrl()}/authorization/sources/built_in_database/rules/users`;
}

function reglaUsuarioUrl(token) {
  return `${reglasUsuariosUrl()}/${encodeURIComponent(token)}`;
}

function authHeader() {
  const { apiKey, apiSecret } = credencialesAdmin();
  const basic = Buffer.from(`${apiKey}:${apiSecret}`).toString("base64");
  return `Basic ${basic}`;
}

// Determinística (HMAC-SHA256 del token con un secreto propio del backend),
// NO aleatoria: `provisionarCredencial` se llama en cada GET /:token (cada
// carga/recarga de la página del chofer), y con una contraseña aleatoria
// cada llamada la pisaba en EMQX Cloud — dejando obsoleta la que ya tenía
// cargada cualquier pestaña/conexión anterior de ese mismo token ("Bad
// username or password" en el navegador, reproducido 2026-08-04). Al ser
// función pura de (token, secreto), da siempre el mismo resultado sin
// necesitar cachear nada (Principio IV/VII).
function derivarPassword(token) {
  const secreto = process.env.EMQX_TOKEN_PASSWORD_SECRET;
  if (!secreto) throw new Error("EMQX_TOKEN_PASSWORD_SECRET no configurado");
  return createHmac("sha256", secreto).update(token).digest("hex");
}

/**
 * Crea (o actualiza) la credencial MQTT de un token de recorrido y devuelve
 * SIEMPRE la misma contraseña (determinística, ver `derivarPassword`) para
 * ese `username`. Es un upsert idempotente a propósito: `GET /:token`
 * (recorrido.js) la llama en cada carga de la SPA del chofer en vez de
 * cachear el resultado en algún lado — así no hay ningún estado local que
 * pueda quedar desincronizado de EMQX Cloud (ej. tras un reinicio del
 * backend) ni que dependa de que Oracle tenga una columna nueva (Principio
 * IV). Al ser determinística, dos llamadas concurrentes para el mismo token
 * (dos pestañas, recarga de página) ya no compiten por dejar contraseñas
 * distintas. `fetchImpl` es inyectable para poder testear sin llamar a la
 * API real de EMQX Cloud.
 */
async function upsertReglaDelToken(fetchImpl, token) {
  // Regla explícita para este token: solo puede publicar dentro de su propio
  // árbol de tópicos (FR-006). `provisionarCredencial` es un upsert llamado
  // en cada GET /:token (recarga de página incluida), así que esto se llama
  // repetidas veces para el mismo token — a diferencia de lo asumido
  // originalmente, el endpoint NO actualiza en silencio: devuelve 409 si la
  // regla ya existe (confirmado contra un deployment real, 2026-08-04). Se
  // trata igual que el 409 de creación de usuario: éxito, sin cambios.
  const res = await fetchImpl(reglasUsuariosUrl(), {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: authHeader() },
    body: JSON.stringify([
      {
        username: token,
        rules: [{ action: "publish", permission: "allow", topic: `vickytruck/fletes/${token}/#` }],
      },
    ]),
  });
  if (!res.ok && res.status !== 409) {
    throw new Error(`emqx_provisionar_acl_fallo: ${res.status}`);
  }
}

export function createEmqxProvisioning(fetchImpl = fetch) {
  return {
    async provisionarCredencial(token) {
      const password = derivarPassword(token);
      const res = await fetchImpl(usersUrl(), {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: authHeader() },
        body: JSON.stringify({ user_id: token, password }),
      });

      if (!res.ok && res.status !== 409) {
        throw new Error(`emqx_provisionar_fallo: ${res.status}`);
      }
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
      }

      await upsertReglaDelToken(fetchImpl, token);
      return { username: token, password };
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

      // Borra también la regla de ACL del token, por si el deployment no la
      // elimina en cascada al borrar el usuario. Idempotente: 404 no es error.
      const resRegla = await fetchImpl(reglaUsuarioUrl(token), {
        method: "DELETE",
        headers: { Authorization: authHeader() },
      });
      if (!resRegla.ok && resRegla.status !== 404) {
        throw new Error(`emqx_revocar_acl_fallo: ${resRegla.status}`);
      }
    },
  };
}
