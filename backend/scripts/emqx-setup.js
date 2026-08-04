// Setup ADMINISTRATIVO (ejecución manual, una sola vez por deployment de
// EMQX Cloud) para 003-mqtt-broker-fletes: crea las credenciales de servicio
// de backend/Central y la regla de ACL global que aísla a cada flete dentro
// de su propio tópico (research.md §2-§3). NO forma parte de `npm test`
// (vive en scripts/, que `node --test` no escanea) — es infraestructura, no
// lógica de aplicación, igual que scripts/smoke-oracle-connection.js.
//
// IMPORTANTE: los paths exactos de la API de administración de EMQX Cloud
// para autorización (ACL) son un supuesto razonable a confirmar contra el
// dashboard/documentación real del deployment (Serverless no soporta
// auth/ACL externa vía webhook — sí soporta reglas de ACL con placeholders
// ${username}/${clientid} desde su base integrada; ver research.md §2 de
// 003-mqtt-broker-fletes). Si el path real difiere, ajustar solo
// `reglasAclUrl()` acá — el resto del script no cambia.
//
// Uso: npm run emqx:setup

import { pathToFileURL } from "node:url";

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

function authHeader() {
  const apiKey = process.env.EMQX_CLOUD_API_KEY;
  const apiSecret = process.env.EMQX_CLOUD_API_SECRET;
  if (!apiKey || !apiSecret) {
    throw new Error("EMQX_CLOUD_API_KEY / EMQX_CLOUD_API_SECRET no configurados");
  }
  return `Basic ${Buffer.from(`${apiKey}:${apiSecret}`).toString("base64")}`;
}

function usersUrl() {
  return `${apiBaseUrl()}/api/v5/deployments/${deploymentId()}/authentication/${authId()}/users`;
}

function reglasAclUrl() {
  return `${apiBaseUrl()}/api/v5/deployments/${deploymentId()}/authorization/sources/built_in_database/rules/users`;
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

// Reglas de ACL globales (research.md §2): los fletes publican solo dentro
// de su propio token vía placeholder ${username}; las credenciales de
// servicio de backend/Central se identifican por username exacto para leer
// todo el árbol de fletes.
async function upsertReglasAcl({ fetchImpl, print }) {
  const reglas = [
    { username: "${username}", topic: "vickytruck/fletes/${username}/#", permission: "allow", action: "publish" },
    {
      username: process.env.EMQX_BACKEND_USERNAME,
      topic: "vickytruck/fletes/+/#",
      permission: "allow",
      action: "subscribe",
    },
    {
      username: process.env.EMQX_CENTRAL_USERNAME,
      topic: "vickytruck/fletes/+/#",
      permission: "allow",
      action: "subscribe",
    },
  ];

  const res = await fetchImpl(reglasAclUrl(), {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: authHeader() },
    body: JSON.stringify(reglas),
  });
  if (!res.ok) {
    throw new Error(`no se pudieron aplicar las reglas de ACL: HTTP ${res.status}`);
  }
  print(`  reglas de ACL: aplicadas (${reglas.length}).`);
}

export async function runSetup({ print = console.log, error = console.error, fetchImpl = fetch } = {}) {
  print("Setup EMQX Cloud — 003-mqtt-broker-fletes");

  const faltantes = [
    "EMQX_CLOUD_DEPLOYMENT_ID",
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
