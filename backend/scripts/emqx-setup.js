// Setup ADMINISTRATIVO (ejecución manual, una sola vez por deployment de
// EMQX Cloud) para 003-mqtt-broker-fletes: crea las credenciales de servicio
// de backend/Central y sus reglas de ACL de solo-lectura sobre todo el árbol
// de fletes (research.md §2-§3). NO forma parte de `npm test` (vive en
// scripts/, que `node --test` no escanea) — es infraestructura, no lógica de
// aplicación, igual que scripts/smoke-oracle-connection.js.
//
// La regla de ACL de cada flete (aislamiento por token, FR-006) NO se crea
// acá: se crea/actualiza junto con su credencial en
// backend/src/mqtt/emqxProvisioning.js, porque el endpoint de ACL de EMQX
// asigna reglas a un username LITERAL (no soporta un placeholder ${username}
// que aplique a cualquier usuario futuro — confirmado empíricamente
// 2026-08-04 contra un deployment real: una regla con username="${username}"
// no es un comodín, sería literalmente ese string).
//
// IMPORTANTE: apunta a la API HTTP nativa (v5) del propio deployment de
// EMQX Cloud, NO a la "Platform API" a nivel cuenta (cloud-intl.emqx.com,
// que gestiona deployments/facturación). EMQX_CLOUD_API_URL debe ser la URL
// completa que muestra la consola para ese deployment (ej.
// `https://<host>.emqxsl.com:8443/api/v5`), sin agregar nada más — ver
// backend/src/mqtt/emqxProvisioning.js para el detalle confirmado
// empíricamente (2026-08-04) de que no lleva prefijo `/deployments/{id}/`.
//
// Uso: npm run emqx:setup

import { pathToFileURL } from "node:url";

function apiBaseUrl() {
  const url = process.env.EMQX_CLOUD_API_URL;
  if (!url) throw new Error("EMQX_CLOUD_API_URL no configurado");
  return url;
}

function authId() {
  return process.env.EMQX_CLOUD_AUTH_ID || "password_based:built_in_database";
}

function authHeader() {
  const apiKey = process.env.EMQX_CLOUD_API_KEY;
  const apiSecret = process.env.EMQX_CLOUD_API_SECRET;
  if (!apiKey || !apiSecret) {
    throw new Error("EMQX_CLOUD_API_KEY / EMQX_CLOUD_API_SECRET no configurados");
  }
  return `Basic ${Buffer.from(`${apiKey}:${apiSecret}`).toString("base64")}`;
}

function usersUrl() {
  return `${apiBaseUrl()}/authentication/${authId()}/users`;
}

function reglasAclUrl() {
  return `${apiBaseUrl()}/authorization/sources/built_in_database/rules/users`;
}

async function upsertUsuarioServicio({ fetchImpl, print, username, password }) {
  const res = await fetchImpl(usersUrl(), {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: authHeader() },
    body: JSON.stringify({ user_id: username, password }),
  });
  if (res.ok) {
    print(`  usuario de servicio "${username}": creado.`);
    return;
  }
  if (res.status === 409) {
    print(`  usuario de servicio "${username}": ya existía (sin cambios).`);
    return;
  }
  throw new Error(`no se pudo crear el usuario de servicio "${username}": HTTP ${res.status}`);
}

// Reglas de ACL de las credenciales de servicio (research.md §2): backend y
// Central pueden SUBSCRIBE sobre todo el árbol de fletes, sin PUBLISH.
async function upsertReglasAcl({ fetchImpl, print }) {
  const reglas = [
    {
      username: process.env.EMQX_BACKEND_USERNAME,
      rules: [{ action: "subscribe", permission: "allow", topic: "vickytruck/fletes/+/#" }],
    },
    {
      username: process.env.EMQX_CENTRAL_USERNAME,
      rules: [{ action: "subscribe", permission: "allow", topic: "vickytruck/fletes/+/#" }],
    },
  ];

  const res = await fetchImpl(reglasAclUrl(), {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: authHeader() },
    body: JSON.stringify(reglas),
  });
  if (res.ok) {
    print(`  reglas de ACL de backend/Central: aplicadas (${reglas.length}).`);
    return;
  }
  if (res.status === 409) {
    // Idempotente: correr el script de nuevo con las mismas reglas ya
    // aplicadas no es un error (igual que upsertUsuarioServicio arriba).
    print(`  reglas de ACL de backend/Central: ya existían (sin cambios).`);
    return;
  }
  throw new Error(`no se pudieron aplicar las reglas de ACL: HTTP ${res.status}`);
}

export async function runSetup({ print = console.log, error = console.error, fetchImpl = fetch } = {}) {
  print("Setup EMQX Cloud — 003-mqtt-broker-fletes");

  const faltantes = [
    "EMQX_CLOUD_API_URL",
    "EMQX_CLOUD_API_KEY",
    "EMQX_CLOUD_API_SECRET",
    "EMQX_BACKEND_USERNAME",
    "EMQX_BACKEND_PASSWORD",
    "EMQX_CENTRAL_USERNAME",
    "EMQX_CENTRAL_PASSWORD",
  ].filter((k) => !process.env[k]);
  if (faltantes.length > 0) {
    error(`FALLO: faltan variables de entorno: ${faltantes.join(", ")} (ver backend/.env.example).`);
    return 4;
  }

  try {
    await upsertUsuarioServicio({
      fetchImpl,
      print,
      username: process.env.EMQX_BACKEND_USERNAME,
      password: process.env.EMQX_BACKEND_PASSWORD,
    });
    await upsertUsuarioServicio({
      fetchImpl,
      print,
      username: process.env.EMQX_CENTRAL_USERNAME,
      password: process.env.EMQX_CENTRAL_PASSWORD,
    });
    await upsertReglasAcl({ fetchImpl, print });
  } catch (err) {
    error(`FALLO: ${err.message}`);
    return 1;
  }

  print("Setup: ÉXITO.");
  return 0;
}

const isMainModule = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMainModule) {
  runSetup()
    .then((code) => {
      process.exitCode = code;
    })
    .catch((err) => {
      console.error(`Error fatal del setup: ${err.message}`);
      process.exitCode = 1;
    });
}
