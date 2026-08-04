import { test } from "node:test";
import assert from "node:assert/strict";
import { runSetup } from "../../scripts/emqx-setup.js";

async function conConfigDeTest(fn) {
  const claves = [
    "EMQX_CLOUD_DEPLOYMENT_ID",
    "EMQX_CLOUD_API_KEY",
    "EMQX_CLOUD_API_SECRET",
    "EMQX_BACKEND_USERNAME",
    "EMQX_BACKEND_PASSWORD",
    "EMQX_CENTRAL_USERNAME",
    "EMQX_CENTRAL_PASSWORD",
  ];
  const previos = Object.fromEntries(claves.map((k) => [k, process.env[k]]));
  process.env.EMQX_CLOUD_DEPLOYMENT_ID = "deploy-test";
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
  const mensajes = [];
  const codigo = await runSetup({ error: (m) => mensajes.push(m), print: () => {} });
  assert.equal(codigo, 4);
  assert.match(mensajes[0], /faltan variables de entorno/);
});

test("emqx-setup — crea los 2 usuarios de servicio y aplica las reglas de ACL", async () => {
  await conConfigDeTest(async () => {
    const fetchImpl = fakeFetch();
    const codigo = await runSetup({ print: () => {}, error: () => {}, fetchImpl });

    assert.equal(codigo, 0);
    assert.equal(fetchImpl.llamadas.length, 3);
    assert.match(fetchImpl.llamadas[0].url, /\/authentication\/.+\/users$/);
    assert.equal(JSON.parse(fetchImpl.llamadas[0].opciones.body).user_id, "vickytruck-backend");
    assert.equal(JSON.parse(fetchImpl.llamadas[1].opciones.body).user_id, "vickytruck-central");
    assert.match(fetchImpl.llamadas[2].url, /\/authorization\/sources\/built_in_database\/rules\/users$/);
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

test("emqx-setup — reporta código 1 si la API de EMQX Cloud falla", async () => {
  await conConfigDeTest(async () => {
    const fetchImpl = fakeFetch({ ok: false, status: 500 });
    const mensajes = [];
    const codigo = await runSetup({ print: () => {}, error: (m) => mensajes.push(m), fetchImpl });
    assert.equal(codigo, 1);
    assert.match(mensajes[0], /FALLO/);
  });
});
