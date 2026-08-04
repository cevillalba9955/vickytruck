import { test } from "node:test";
import assert from "node:assert/strict";
import { runSetup } from "../../scripts/emqx-setup.js";

async function conConfigDeTest(fn) {
  const claves = [
    "EMQX_CLOUD_API_URL",
    "EMQX_CLOUD_API_KEY",
    "EMQX_CLOUD_API_SECRET",
    "EMQX_BACKEND_USERNAME",
    "EMQX_BACKEND_PASSWORD",
    "EMQX_CENTRAL_USERNAME",
    "EMQX_CENTRAL_PASSWORD",
  ];
  const previos = Object.fromEntries(claves.map((k) => [k, process.env[k]]));
  process.env.EMQX_CLOUD_API_URL = "https://broker-test.emqxsl.com:8443/api/v5";
  process.env.EMQX_CLOUD_API_KEY = "clave-test";
  process.env.EMQX_CLOUD_API_SECRET = "secreto-test";
  process.env.EMQX_BACKEND_USERNAME = "vickytruck-backend";
  process.env.EMQX_BACKEND_PASSWORD = "pass-backend";
  process.env.EMQX_CENTRAL_USERNAME = "vickytruck-central";
  process.env.EMQX_CENTRAL_PASSWORD = "pass-central";
  try {
    return await fn();
  } finally {
    Object.assign(process.env, previos);
  }
}

function fakeFetch(respuestaPorDefecto = { ok: true, status: 200 }) {
  const llamadas = [];
  const fetchImpl = async (url, opciones) => {
    llamadas.push({ url, opciones });
    return respuestaPorDefecto;
  };
  fetchImpl.llamadas = llamadas;
  return fetchImpl;
}

test("emqx-setup — falla con código 4 si faltan variables de entorno", async () => {
  // Se limpian explícitamente (no basta con "no configurarlas" acá): si hay
  // un .env real cargado (npm test usa --env-file-if-exists=.env) con estas
  // variables ya completas, el ambiente por sí solo no garantiza que falten.
  const claves = [
    "EMQX_CLOUD_API_URL",
    "EMQX_CLOUD_API_KEY",
    "EMQX_CLOUD_API_SECRET",
    "EMQX_BACKEND_USERNAME",
    "EMQX_BACKEND_PASSWORD",
    "EMQX_CENTRAL_USERNAME",
    "EMQX_CENTRAL_PASSWORD",
  ];
  const previos = Object.fromEntries(claves.map((k) => [k, process.env[k]]));
  for (const k of claves) delete process.env[k];

  try {
    const mensajes = [];
    const codigo = await runSetup({ error: (m) => mensajes.push(m), print: () => {} });
    assert.equal(codigo, 4);
    assert.match(mensajes[0], /faltan variables de entorno/);
  } finally {
    for (const k of claves) {
      if (previos[k] === undefined) delete process.env[k];
      else process.env[k] = previos[k];
    }
  }
});

test("emqx-setup — crea los 2 usuarios de servicio y aplica sus reglas de ACL de SUBSCRIBE", async () => {
  await conConfigDeTest(async () => {
    const fetchImpl = fakeFetch();
    const codigo = await runSetup({ print: () => {}, error: () => {}, fetchImpl });

    assert.equal(codigo, 0);
    assert.equal(fetchImpl.llamadas.length, 3);
    assert.match(fetchImpl.llamadas[0].url, /\/authentication\/.+\/users$/);
    assert.equal(JSON.parse(fetchImpl.llamadas[0].opciones.body).user_id, "vickytruck-backend");
    assert.equal(JSON.parse(fetchImpl.llamadas[1].opciones.body).user_id, "vickytruck-central");

    const reglasCall = fetchImpl.llamadas[2];
    assert.match(reglasCall.url, /\/authorization\/sources\/built_in_database\/rules\/users$/);
    const reglas = JSON.parse(reglasCall.opciones.body);
    assert.deepEqual(reglas, [
      {
        username: "vickytruck-backend",
        rules: [{ action: "subscribe", permission: "allow", topic: "vickytruck/fletes/+/#" }],
      },
      {
        username: "vickytruck-central",
        rules: [{ action: "subscribe", permission: "allow", topic: "vickytruck/fletes/+/#" }],
      },
    ]);
  });
});

test("emqx-setup — trata 409 (usuario ya existente) como éxito, no como fallo", async () => {
  await conConfigDeTest(async () => {
    // 409 solo en las 2 llamadas de usuarios; la 3ra (reglas ACL) responde ok.
    const respuestas = [
      { ok: false, status: 409 },
      { ok: false, status: 409 },
      { ok: true, status: 200 },
    ];
    const fetchImpl = async () => respuestas.shift();
    const mensajes = [];
    const codigo = await runSetup({ print: (m) => mensajes.push(m), error: () => {}, fetchImpl });

    assert.equal(codigo, 0);
    assert.ok(mensajes.some((m) => m.includes("ya existía")));
  });
});

test("emqx-setup — es idempotente: correrlo dos veces (409 también en las reglas de ACL) sigue dando éxito", async () => {
  await conConfigDeTest(async () => {
    const respuestas = [
      { ok: false, status: 409 }, // usuario backend ya existía
      { ok: false, status: 409 }, // usuario central ya existía
      { ok: false, status: 409 }, // reglas de ACL ya existían
    ];
    const fetchImpl = async () => respuestas.shift();
    const mensajes = [];
    const codigo = await runSetup({ print: (m) => mensajes.push(m), error: () => {}, fetchImpl });

    assert.equal(codigo, 0);
    assert.ok(mensajes.some((m) => m.includes("reglas de ACL de backend/Central: ya existían")));
  });
});

test("emqx-setup — reporta código 1 si la API de EMQX Cloud falla", async () => {
  await conConfigDeTest(async () => {
    const fetchImpl = fakeFetch({ ok: false, status: 500 });
    const mensajes = [];
    const codigo = await runSetup({ print: () => {}, error: (m) => mensajes.push(m), fetchImpl });
    assert.equal(codigo, 1);
    assert.match(mensajes[0], /FALLO/);
  });
});
