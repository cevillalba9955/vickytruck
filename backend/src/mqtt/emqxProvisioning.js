import { createHmac } from "node:crypto";

// Aprovisiona/revoca la credencial MQTT de un flete contra la API HTTP nativa
// (v5) del propio deployment de EMQX Cloud — NO la "Platform API" a nivel
// cuenta (esa vive bajo cloud-intl.emqx.com y sirve para gestionar
// deployments/facturación, no usuarios MQTT). Cada deployment Serverless
// expone su propia API en `https://<host-del-deployment>:8443/api/v5`
// (visible en la consola, sección "Connect"/"Overview" del deployment) — ese
// es el valor esperado en EMQX_CLOUD_API_URL, sin agregar nada más al final.
//
// Adaptado de la rama 003-mqtt-broker-fletes (verificada end-to-end contra un
// deployment real, 2026-08-04) a la arquitectura actual (003-arquitectura-
// cloud-mqtt): esa versión indexaba por `token` sobre el árbol de tópicos
// `vickytruck/fletes/{token}/#` (ubicación + eventos de arribo/descarga, todo
// vía MQTT). Acá el backend sigue recibiendo arribo/descarga por REST — MQTT
// es solo para el reporte periódico de ubicación — así que se indexa por
// `fleteId` (no `token`, ver bug-mqtt-ubicacion-fleteid-token) sobre el único
// tópico que ya usan `ubicacionMqtt.js`/`mqttBridge.js`: `chofer/{fleteId}/ubicacion`.
//
// IMPORTANTE: `authId` (identificador del mecanismo de autenticación) es un
// supuesto razonable (`password_based:built_in_database`, el nombre estándar
// de EMQX v5 para la base de usuarios integrada) a confirmar contra el
// deployment real si algo devuelve 404 en vez de 401/403/409 — ajustable vía
// EMQX_CLOUD_AUTH_ID sin tocar código.
//
// Aislamiento por flete (equivalente a FR-006 de la spec vieja): el endpoint
// de ACL "built_in_database" (`/authorization/sources/built_in_database/rules/users`)
// asigna reglas a un username LITERAL, no soporta un placeholder ${username}
// que aplique a cualquier usuario futuro (confirmado contra un deployment
// real en la rama vieja: HTTP 400 con un intento de regla global). Por eso
// cada flete recibe su propia regla explícita en el mismo momento en que se
// crea su credencial, en vez de una regla global preconfigurada.

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

function userUrl(username) {
  return `${usersUrl()}/${encodeURIComponent(username)}`;
}

function reglasUsuariosUrl() {
  return `${apiBaseUrl()}/authorization/sources/built_in_database/rules/users`;
}

function reglaUsuarioUrl(username) {
  return `${reglasUsuariosUrl()}/${encodeURIComponent(username)}`;
}

function authHeader() {
  const { apiKey, apiSecret } = credencialesAdmin();
  const basic = Buffer.from(`${apiKey}:${apiSecret}`).toString("base64");
  return `Basic ${basic}`;
}

// Username determinístico, sin llamar a EMQX ni necesitar el secreto de
// passwords — usable desde GET /:token (recorrido.js) para devolver la
// config MQTT sin pegarle a la API de EMQX en cada carga de la SPA.
function usernamePara(fleteId) {
  return `chofer-${fleteId}`;
}

export function topicPara(fleteId) {
  return `chofer/${encodeURIComponent(String(fleteId))}/ubicacion`;
}

// 2026-08-10 (spec.md FR-013, research.md Decisión 8): credencial MQTT
// PERMANENTE por `choferId`, en vez de publish-only por `fleteId` (arriba).
// Mismo username que la versión por-flete (`chofer-{id}`) pero indexado por
// choferId — un mismo chofer con varios fletes a lo largo del tiempo reusa
// siempre `chofer-{choferId}`, sin reaprovisionamiento por recorrido nuevo.
function usernameParaChofer(choferId) {
  return `chofer-${choferId}`;
}

// Wildcard, no scoped a un único fleteId: el chofer publica en el topic de
// CUALQUIER fleteId con esta credencial. Riesgo de spoofing entre fletes
// aceptado explícitamente (ver plan.md Constitution Check, Principio VII) —
// no es un descuido, es la alternativa elegida sobre ACL dinámica o
// validación server-side (research.md Decisión 8).
export const TOPIC_WILDCARD_CHOFER = "chofer/+/ubicacion";

// Determinística (HMAC-SHA256 del fleteId con un secreto propio del
// backend), NO aleatoria: si esto se llamara con una password aleatoria en
// cada `GET /:token` (cada carga/recarga de la SPA del chofer), pisaría en
// EMQX Cloud la contraseña de cualquier conexión anterior de ese mismo
// fleteId — mismo bug ya reproducido y arreglado en la rama vieja
// (2026-08-04, "Bad username or password"). Al ser función pura de
// (fleteId, secreto), da siempre el mismo resultado sin necesitar cachear
// nada.
export function derivarCredencial(fleteId) {
  const secreto = process.env.EMQX_TOKEN_PASSWORD_SECRET;
  if (!secreto) throw new Error("EMQX_TOKEN_PASSWORD_SECRET no configurado");
  return {
    username: usernamePara(fleteId),
    password: createHmac("sha256", secreto).update(String(fleteId)).digest("hex"),
  };
}

// Misma lógica que derivarCredencial, pero indexada por choferId — ver
// research.md Decisión 8. Password determinística por las mismas razones
// (GET /:token puede devolverla en cualquier recarga sin llamar a EMQX).
export function derivarCredencialChofer(choferId) {
  const secreto = process.env.EMQX_TOKEN_PASSWORD_SECRET;
  if (!secreto) throw new Error("EMQX_TOKEN_PASSWORD_SECRET no configurado");
  return {
    username: usernameParaChofer(choferId),
    password: createHmac("sha256", secreto).update(String(choferId)).digest("hex"),
  };
}

async function upsertReglaDelFlete(fetchImpl, fleteId, username) {
  // `provisionarCredencial` es un upsert que se llama repetidas veces para
  // el mismo fleteId (cada push de Oracle con ese flete todavía activo) —
  // el endpoint de ACL de EMQX devuelve 409 si la regla ya existe
  // (confirmado en la rama vieja contra un deployment real); se trata igual
  // que el 409 de creación de usuario: éxito, sin cambios.
  const res = await fetchImpl(reglasUsuariosUrl(), {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: authHeader() },
    body: JSON.stringify([
      {
        username,
        rules: [{ action: "publish", permission: "allow", topic: topicPara(fleteId) }],
      },
    ]),
  });
  if (!res.ok && res.status !== 409) {
    throw new Error(`emqx_provisionar_acl_fallo: ${res.status}`);
  }
}

// ACL amplia del chofer (research.md Decisión 8): a diferencia de
// upsertReglaDelFlete, no scoped a un topic con un id concreto — el mismo
// wildcard para cualquier choferId.
async function upsertReglaDelChofer(fetchImpl, username) {
  const res = await fetchImpl(reglasUsuariosUrl(), {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: authHeader() },
    body: JSON.stringify([
      {
        username,
        rules: [{ action: "publish", permission: "allow", topic: TOPIC_WILDCARD_CHOFER }],
      },
    ]),
  });
  if (!res.ok && res.status !== 409) {
    throw new Error(`emqx_provisionar_acl_fallo: ${res.status}`);
  }
}

// Da de alta (o deja igual, si ya existía) el usuario MQTT en EMQX Cloud —
// compartido por provisionarCredencial y provisionarCredencialChofer, que
// solo difieren en cómo derivan la credencial y qué regla de ACL aplican.
async function upsertUsuarioMqtt(fetchImpl, username, password) {
  const res = await fetchImpl(usersUrl(), {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: authHeader() },
    body: JSON.stringify({ user_id: username, password }),
  });

  if (!res.ok && res.status !== 409) {
    throw new Error(`emqx_provisionar_fallo: ${res.status}`);
  }
  if (res.status === 409) {
    // Ya existía: actualizar la contraseña para que quede igual a la que se
    // devuelve acá (siempre la misma, credencial determinística).
    const resUpdate = await fetchImpl(userUrl(username), {
      method: "PUT",
      headers: { "Content-Type": "application/json", Authorization: authHeader() },
      body: JSON.stringify({ password }),
    });
    if (!resUpdate.ok) {
      throw new Error(`emqx_provisionar_fallo: ${resUpdate.status}`);
    }
  }
}

export function createEmqxProvisioning(fetchImpl = fetch) {
  return {
    // Se llama al recibir un recorrido de Oracle con `fleteId` (ver
    // POST /api/integracion/recorridos en integracion.js) — da de alta (o
    // deja igual, si ya existía) la credencial MQTT publish-only de ese
    // flete, scoped a su propio tópico.
    // Superseded 2026-08-10 para el reporte de ubicación periódica del
    // chofer — ver provisionarCredencialChofer abajo (research.md Decisión
    // 8). Se conserva por si algún caller viejo todavía la referencia.
    async provisionarCredencial(fleteId) {
      const { username, password } = derivarCredencial(fleteId);
      await upsertUsuarioMqtt(fetchImpl, username, password);
      await upsertReglaDelFlete(fetchImpl, fleteId, username);
      return { username, password };
    },

    // 2026-08-10 (spec.md FR-013): se llama al recibir un recorrido de
    // Oracle con `choferId` — da de alta (o deja igual) la credencial MQTT
    // PERMANENTE de ese chofer, con ACL amplia sobre chofer/+/ubicacion. A
    // diferencia de provisionarCredencial, esta credencial se reutiliza sin
    // cambios en cada recorrido futuro del mismo chofer.
    async provisionarCredencialChofer(choferId) {
      const { username, password } = derivarCredencialChofer(choferId);
      await upsertUsuarioMqtt(fetchImpl, username, password);
      await upsertReglaDelChofer(fetchImpl, username);
      return { username, password };
    },

    async revocarCredencial(fleteId) {
      if (!fleteId) return; // no-op si no había fleteId (ej. recorrido sin asignar)
      const username = usernamePara(fleteId);

      const res = await fetchImpl(userUrl(username), {
        method: "DELETE",
        headers: { Authorization: authHeader() },
      });
      // 404 = ya no existía: idempotente, no es un error.
      if (!res.ok && res.status !== 404) {
        throw new Error(`emqx_revocar_fallo: ${res.status}`);
      }

      // Borra también la regla de ACL del flete, por si el deployment no la
      // elimina en cascada al borrar el usuario. Idempotente: 404 no es error.
      const resRegla = await fetchImpl(reglaUsuarioUrl(username), {
        method: "DELETE",
        headers: { Authorization: authHeader() },
      });
      if (!resRegla.ok && resRegla.status !== 404) {
        throw new Error(`emqx_revocar_acl_fallo: ${resRegla.status}`);
      }
    },
  };
}

export const emqxProvisioningCompartido = createEmqxProvisioning();
