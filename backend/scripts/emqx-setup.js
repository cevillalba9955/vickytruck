// Setup ADMINISTRATIVO (ejecución manual, una sola vez por deployment de
// EMQX Cloud) para 003-arquitectura-cloud-mqtt: da de alta el usuario de
// servicio que usa el propio backend para SUSCRIBIRSE a `chofer/+/ubicacion`
// (ver backend/src/services/mqttBridge.js, credenciales MQTT_USERNAME/
// MQTT_PASSWORD) y le otorga la regla de ACL correspondiente. NO forma parte
// de `npm test` (vive en scripts/, que `node --test` no escanea) — es
// infraestructura, no lógica de aplicación.
//
// Adaptado de la rama 003-mqtt-broker-fletes (`emqx-setup.js` original): esa
// versión daba de alta TAMBIÉN un usuario de servicio para Central, porque
// ahí Central se suscribía directo al bróker. La arquitectura actual no lo
// necesita — Central lee vía REST (`GET /api/central/recorridos/activos`),
// poblado por el backend, que es el único que se suscribe al bróker.
//
// La regla de ACL de cada FLETE (publish-only, aislada por su propio tópico)
// NO se crea acá: se crea/actualiza junto con su credencial en
// backend/src/mqtt/emqxProvisioning.js, al recibir cada recorrido de Oracle
// (POST /api/integracion/recorridos) — ver research.md §2-§3 de la feature
// vieja para el razonamiento de por qué la regla de ACL de EMQX no admite un
// placeholder de username que aplique a cualquier usuario futuro.
//
// IMPORTANTE: apunta a la API HTTP nativa (v5) del propio deployment de EMQX
// Cloud, NO a la "Platform API" a nivel cuenta (cloud-intl.emqx.com, que
// gestiona deployments/facturación). EMQX_CLOUD_API_URL debe ser la URL
// completa que muestra la consola para ESE deployment (ej.
// `https://<host>.emqxsl.com:8443/api/v5`), sin agregar nada más al final.
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

// Regla de ACL del backend: puede SUSCRIBIRSE a chofer/+/ubicacion (mismo
// tópico de MQTT_TOPIC_UBICACION en mqttBridge.js), sin PUBLISH.
async function upsertReglaAcl({ fetchImpl, print }) {
  const topic = process.env.MQTT_TOPIC_UBICACION || "chofer/+/ubicacion";
  const reglas = [
    {
      username: process.env.MQTT_USERNAME,
      rules: [{ action: "subscribe", permission: "allow", topic }],
    },
  ];

  const res = await fetchImpl(reglasAclUrl(), {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: authHeader() },
    body: JSON.stringify(reglas),
  });
  if (res.ok) {
    print(`  regla de ACL del backend (subscribe sobre "${topic}"): aplicada.`);
    return;
  }
  if (res.status === 409) {
    // Idempotente: correr el script de nuevo con la misma regla ya aplicada
    // no es un error (igual que upsertUsuarioServicio arriba).
    print(`  regla de ACL del backend (subscribe sobre "${topic}"): ya existía (sin cambios).`);
    return;
  }
  throw new Error(`no se pudo aplicar la regla de ACL: HTTP ${res.status}`);
}

export async function runSetup({ print = console.log, error = console.error, fetchImpl = fetch } = {}) {
  print("Setup EMQX Cloud — 003-arquitectura-cloud-mqtt (credencial de suscripción del backend)");

  const faltantes = [
    "EMQX_CLOUD_API_URL",
    "EMQX_CLOUD_API_KEY",
    "EMQX_CLOUD_API_SECRET",
    "MQTT_USERNAME",
    "MQTT_PASSWORD",
  ].filter((k) => !process.env[k]);
  if (faltantes.length > 0) {
    error(`FALLO: faltan variables de entorno: ${faltantes.join(", ")} (ver backend/.env.example).`);
    return 4;
  }

  try {
    await upsertUsuarioServicio({
      fetchImpl,
      print,
      username: process.env.MQTT_USERNAME,
      password: process.env.MQTT_PASSWORD,
    });
    await upsertReglaAcl({ fetchImpl, print });
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
