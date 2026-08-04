import { test } from "node:test";
import assert from "node:assert/strict";
import { createEmqxProvisioning } from "../../src/mqtt/emqxProvisioning.js";

const BASE = "https://broker-test.emqxsl.com:8443/api/v5";
const USERS_URL = `${BASE}/authentication/password_based:built_in_database/users`;
const REGLAS_URL = `${BASE}/authorization/sources/built_in_database/rules/users`;

async function conConfigDeTest(fn) {
  const previo = {
    EMQX_CLOUD_API_URL: process.env.EMQX_CLOUD_API_URL,
    EMQX_CLOUD_API_KEY: process.env.EMQX_CLOUD_API_KEY,
    EMQX_CLOUD_API_SECRET: process.env.EMQX_CLOUD_API_SECRET,
  };
  process.env.EMQX_CLOUD_API_URL = BASE;
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

test("emqxProvisioning — provisionarCredencial crea el usuario MQTT y su regla de ACL (FR-006)", async () => {
  await conConfigDeTest(async () => {
    const fetchImpl = fakeFetch([{ ok: true, status: 201 }, { ok: true, status: 204 }]);
    const provisioning = createEmqxProvisioning(fetchImpl);

    const credencial = await provisioning.provisionarCredencial("tok-abc");

    assert.equal(credencial.username, "tok-abc");
    assert.equal(typeof credencial.password, "string");
    assert.ok(credencial.password.length > 0);

    assert.equal(fetchImpl.llamadas.length, 2);

    const [creaUsuario, creaRegla] = fetchImpl.llamadas;
    assert.equal(creaUsuario.url, USERS_URL);
    assert.equal(creaUsuario.opciones.method, "POST");
    assert.equal(
      creaUsuario.opciones.headers.Authorization,
      `Basic ${Buffer.from("clave-test:secreto-test").toString("base64")}`,
    );
    const bodyUsuario = JSON.parse(creaUsuario.opciones.body);
    assert.equal(bodyUsuario.user_id, "tok-abc");
    assert.equal(bodyUsuario.password, credencial.password);

    assert.equal(creaRegla.url, REGLAS_URL);
    assert.equal(creaRegla.opciones.method, "POST");
    const bodyRegla = JSON.parse(creaRegla.opciones.body);
    assert.deepEqual(bodyRegla, [
      { username: "tok-abc", rules: [{ action: "publish", permission: "allow", topic: "vickytruck/fletes/tok-abc/#" }] },
    ]);
  });
});

test("emqxProvisioning — provisionarCredencial hace upsert (PUT) del usuario si ya existía (409)", async () => {
  await conConfigDeTest(async () => {
    const fetchImpl = fakeFetch([{ ok: false, status: 409 }, { ok: true, status: 200 }, { ok: true, status: 204 }]);
    const provisioning = createEmqxProvisioning(fetchImpl);

    const credencial = await provisioning.provisionarCredencial("tok-repetido");
    assert.equal(credencial.username, "tok-repetido");
    assert.ok(credencial.password.length > 0);

    assert.equal(fetchImpl.llamadas.length, 3);
    const actualizaUsuario = fetchImpl.llamadas[1];
    assert.match(actualizaUsuario.url, /\/users\/tok-repetido$/);
    assert.equal(actualizaUsuario.opciones.method, "PUT");
    assert.equal(JSON.parse(actualizaUsuario.opciones.body).password, credencial.password);

    const creaRegla = fetchImpl.llamadas[2];
    assert.equal(creaRegla.url, REGLAS_URL);
  });
});

test("emqxProvisioning — provisionarCredencial lanza si el upsert (PUT tras 409) del usuario falla", async () => {
  await conConfigDeTest(async () => {
    const fetchImpl = fakeFetch([{ ok: false, status: 409 }, { ok: false, status: 500 }]);
    const provisioning = createEmqxProvisioning(fetchImpl);

    await assert.rejects(() => provisioning.provisionarCredencial("tok-x"), /emqx_provisionar_fallo/);
  });
});

test("emqxProvisioning — provisionarCredencial lanza si crear el usuario falla con otro código", async () => {
  await conConfigDeTest(async () => {
    const fetchImpl = fakeFetch([{ ok: false, status: 500 }]);
    const provisioning = createEmqxProvisioning(fetchImpl);

    await assert.rejects(() => provisioning.provisionarCredencial("tok-x"), /emqx_provisionar_fallo/);
  });
});

test("emqxProvisioning — provisionarCredencial lanza si la regla de ACL falla", async () => {
  await conConfigDeTest(async () => {
    const fetchImpl = fakeFetch([{ ok: true, status: 201 }, { ok: false, status: 400 }]);
    const provisioning = createEmqxProvisioning(fetchImpl);

    await assert.rejects(() => provisioning.provisionarCredencial("tok-x"), /emqx_provisionar_acl_fallo/);
  });
});

test("emqxProvisioning — revocarCredencial elimina el usuario y su regla de ACL por token", async () => {
  await conConfigDeTest(async () => {
    const fetchImpl = fakeFetch([{ ok: true, status: 204 }, { ok: true, status: 204 }]);
    const provisioning = createEmqxProvisioning(fetchImpl);

    await provisioning.revocarCredencial("tok-abc");

    assert.equal(fetchImpl.llamadas.length, 2);
    const [borraUsuario, borraRegla] = fetchImpl.llamadas;
    assert.match(borraUsuario.url, /\/authentication\/.+\/users\/tok-abc$/);
    assert.equal(borraUsuario.opciones.method, "DELETE");
    assert.match(borraRegla.url, /\/authorization\/.+\/rules\/users\/tok-abc$/);
    assert.equal(borraRegla.opciones.method, "DELETE");
  });
});

test("emqxProvisioning — revocarCredencial es idempotente (404 en usuario y regla no lanza)", async () => {
  await conConfigDeTest(async () => {
    const fetchImpl = fakeFetch([{ ok: false, status: 404 }, { ok: false, status: 404 }]);
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

test("emqxProvisioning — revocarCredencial lanza si borrar el usuario falla con otro código", async () => {
  await conConfigDeTest(async () => {
    const fetchImpl = fakeFetch([{ ok: false, status: 500 }]);
    const provisioning = createEmqxProvisioning(fetchImpl);

    await assert.rejects(() => provisioning.revocarCredencial("tok-x"), /emqx_revocar_fallo/);
  });
});

test("emqxProvisioning — revocarCredencial lanza si borrar la regla de ACL falla con otro código", async () => {
  await conConfigDeTest(async () => {
    const fetchImpl = fakeFetch([{ ok: true, status: 204 }, { ok: false, status: 500 }]);
    const provisioning = createEmqxProvisioning(fetchImpl);

    await assert.rejects(() => provisioning.revocarCredencial("tok-x"), /emqx_revocar_acl_fallo/);
  });
});
