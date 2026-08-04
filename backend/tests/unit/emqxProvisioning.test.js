import { test } from "node:test";
import assert from "node:assert/strict";
import { createEmqxProvisioning } from "../../src/mqtt/emqxProvisioning.js";

async function conConfigDeTest(fn) {
  const previo = {
    EMQX_CLOUD_DEPLOYMENT_ID: process.env.EMQX_CLOUD_DEPLOYMENT_ID,
    EMQX_CLOUD_API_KEY: process.env.EMQX_CLOUD_API_KEY,
    EMQX_CLOUD_API_SECRET: process.env.EMQX_CLOUD_API_SECRET,
  };
  process.env.EMQX_CLOUD_DEPLOYMENT_ID = "deploy-test";
  process.env.EMQX_CLOUD_API_KEY = "clave-test";
  process.env.EMQX_CLOUD_API_SECRET = "secreto-test";
  try {
    return await fn();
  } finally {
    Object.assign(process.env, previo);
  }
}

function fakeFetch(respuestas) {
  const llamadas = [];
  const fetchImpl = async (url, opciones) => {
    llamadas.push({ url, opciones });
    const respuesta = respuestas.shift() ?? { ok: true, status: 200 };
    return respuesta;
  };
  fetchImpl.llamadas = llamadas;
  return fetchImpl;
}

test("emqxProvisioning — provisionarCredencial crea un usuario MQTT con username=token", async () => {
  await conConfigDeTest(async () => {
    const fetchImpl = fakeFetch([{ ok: true, status: 201 }]);
    const provisioning = createEmqxProvisioning(fetchImpl);

    const credencial = await provisioning.provisionarCredencial("tok-abc");

    assert.equal(credencial.username, "tok-abc");
    assert.equal(typeof credencial.password, "string");
    assert.ok(credencial.password.length > 0);

    assert.equal(fetchImpl.llamadas.length, 1);
    const { url, opciones } = fetchImpl.llamadas[0];
    assert.match(url, /\/deployments\/deploy-test\/authentication\/.+\/users$/);
    assert.equal(opciones.method, "POST");
    assert.equal(opciones.headers.Authorization, `Basic ${Buffer.from("clave-test:secreto-test").toString("base64")}`);
    const body = JSON.parse(opciones.body);
    assert.equal(body.user_id, "tok-abc");
    assert.equal(body.password, credencial.password);
  });
});

test("emqxProvisioning — provisionarCredencial hace upsert (PUT) si el usuario ya existía (409)", async () => {
  await conConfigDeTest(async () => {
    const fetchImpl = fakeFetch([{ ok: false, status: 409 }, { ok: true, status: 200 }]);
    const provisioning = createEmqxProvisioning(fetchImpl);

    const credencial = await provisioning.provisionarCredencial("tok-repetido");
    assert.equal(credencial.username, "tok-repetido");
    assert.ok(credencial.password.length > 0);

    assert.equal(fetchImpl.llamadas.length, 2);
    const segunda = fetchImpl.llamadas[1];
    assert.match(segunda.url, /\/users\/tok-repetido$/);
    assert.equal(segunda.opciones.method, "PUT");
    assert.equal(JSON.parse(segunda.opciones.body).password, credencial.password);
  });
});

test("emqxProvisioning — provisionarCredencial lanza si el upsert (PUT tras 409) falla", async () => {
  await conConfigDeTest(async () => {
    const fetchImpl = fakeFetch([{ ok: false, status: 409 }, { ok: false, status: 500 }]);
    const provisioning = createEmqxProvisioning(fetchImpl);

    await assert.rejects(() => provisioning.provisionarCredencial("tok-x"), /emqx_provisionar_fallo/);
  });
});

test("emqxProvisioning — provisionarCredencial lanza si la API falla con otro código", async () => {
  await conConfigDeTest(async () => {
    const fetchImpl = fakeFetch([{ ok: false, status: 500 }]);
    const provisioning = createEmqxProvisioning(fetchImpl);

    await assert.rejects(() => provisioning.provisionarCredencial("tok-x"), /emqx_provisionar_fallo/);
  });
});

test("emqxProvisioning — revocarCredencial elimina el usuario por token", async () => {
  await conConfigDeTest(async () => {
    const fetchImpl = fakeFetch([{ ok: true, status: 204 }]);
    const provisioning = createEmqxProvisioning(fetchImpl);

    await provisioning.revocarCredencial("tok-abc");

    assert.equal(fetchImpl.llamadas.length, 1);
    const { url, opciones } = fetchImpl.llamadas[0];
    assert.match(url, /\/users\/tok-abc$/);
    assert.equal(opciones.method, "DELETE");
  });
});

test("emqxProvisioning — revocarCredencial es idempotente (404 no lanza)", async () => {
  await conConfigDeTest(async () => {
    const fetchImpl = fakeFetch([{ ok: false, status: 404 }]);
    const provisioning = createEmqxProvisioning(fetchImpl);

    await assert.doesNotReject(() => provisioning.revocarCredencial("tok-inexistente"));
  });
});

test("emqxProvisioning — revocarCredencial es no-op si no se pasa token (ej. primera asignación)", async () => {
  await conConfigDeTest(async () => {
    const fetchImpl = fakeFetch([]);
    const provisioning = createEmqxProvisioning(fetchImpl);

    await assert.doesNotReject(() => provisioning.revocarCredencial(null));
    assert.equal(fetchImpl.llamadas.length, 0);
  });
});

test("emqxProvisioning — revocarCredencial lanza si la API falla con otro código", async () => {
  await conConfigDeTest(async () => {
    const fetchImpl = fakeFetch([{ ok: false, status: 500 }]);
    const provisioning = createEmqxProvisioning(fetchImpl);

    await assert.rejects(() => provisioning.revocarCredencial("tok-x"), /emqx_revocar_fallo/);
  });
});
