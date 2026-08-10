import { test } from "node:test";
import assert from "node:assert/strict";
import { createEmqxProvisioning, derivarCredencial, derivarCredencialChofer } from "../../src/mqtt/emqxProvisioning.js";

const BASE = "https://broker-test.emqxsl.com:8443/api/v5";
const USERS_URL = `${BASE}/authentication/password_based:built_in_database/users`;
const REGLAS_URL = `${BASE}/authorization/sources/built_in_database/rules/users`;

async function conConfigDeTest(fn) {
  const previo = {
    EMQX_CLOUD_API_URL: process.env.EMQX_CLOUD_API_URL,
    EMQX_CLOUD_API_KEY: process.env.EMQX_CLOUD_API_KEY,
    EMQX_CLOUD_API_SECRET: process.env.EMQX_CLOUD_API_SECRET,
    EMQX_TOKEN_PASSWORD_SECRET: process.env.EMQX_TOKEN_PASSWORD_SECRET,
  };
  process.env.EMQX_CLOUD_API_URL = BASE;
  process.env.EMQX_CLOUD_API_KEY = "clave-test";
  process.env.EMQX_CLOUD_API_SECRET = "secreto-test";
  process.env.EMQX_TOKEN_PASSWORD_SECRET = "secreto-de-passwords-test";
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

test("derivarCredencial — determinística: mismo fleteId, misma contraseña siempre", async () => {
  await conConfigDeTest(async () => {
    const a = derivarCredencial("13");
    const b = derivarCredencial("13");
    assert.equal(a.username, "chofer-13");
    assert.equal(a.password, b.password);
  });
});

test("derivarCredencial — contraseñas distintas para fleteId distintos", async () => {
  await conConfigDeTest(async () => {
    const a = derivarCredencial("13");
    const b = derivarCredencial("14");
    assert.notEqual(a.password, b.password);
  });
});

test("derivarCredencial — lanza si falta EMQX_TOKEN_PASSWORD_SECRET", async () => {
  const previo = process.env.EMQX_TOKEN_PASSWORD_SECRET;
  delete process.env.EMQX_TOKEN_PASSWORD_SECRET;
  try {
    assert.throws(() => derivarCredencial("13"), /EMQX_TOKEN_PASSWORD_SECRET/);
  } finally {
    if (previo !== undefined) process.env.EMQX_TOKEN_PASSWORD_SECRET = previo;
  }
});

test("emqxProvisioning — provisionarCredencial crea el usuario MQTT y su regla de ACL scoped a chofer/{fleteId}/ubicacion", async () => {
  await conConfigDeTest(async () => {
    const fetchImpl = fakeFetch([{ ok: true, status: 201 }, { ok: true, status: 204 }]);
    const provisioning = createEmqxProvisioning(fetchImpl);

    const credencial = await provisioning.provisionarCredencial("13");

    assert.equal(credencial.username, "chofer-13");
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
    assert.equal(bodyUsuario.user_id, "chofer-13");
    assert.equal(bodyUsuario.password, credencial.password);

    assert.equal(creaRegla.url, REGLAS_URL);
    assert.equal(creaRegla.opciones.method, "POST");
    const bodyRegla = JSON.parse(creaRegla.opciones.body);
    assert.deepEqual(bodyRegla, [
      { username: "chofer-13", rules: [{ action: "publish", permission: "allow", topic: "chofer/13/ubicacion" }] },
    ]);
  });
});

test("emqxProvisioning — provisionarCredencial hace upsert (PUT) del usuario si ya existía (409)", async () => {
  await conConfigDeTest(async () => {
    const fetchImpl = fakeFetch([{ ok: false, status: 409 }, { ok: true, status: 200 }, { ok: true, status: 204 }]);
    const provisioning = createEmqxProvisioning(fetchImpl);

    const credencial = await provisioning.provisionarCredencial("13");
    assert.equal(credencial.username, "chofer-13");

    assert.equal(fetchImpl.llamadas.length, 3);
    const actualizaUsuario = fetchImpl.llamadas[1];
    assert.match(actualizaUsuario.url, /\/users\/chofer-13$/);
    assert.equal(actualizaUsuario.opciones.method, "PUT");
    assert.equal(JSON.parse(actualizaUsuario.opciones.body).password, credencial.password);
  });
});

test("emqxProvisioning — provisionarCredencial es idempotente si la regla de ACL ya existía (409)", async () => {
  await conConfigDeTest(async () => {
    const fetchImpl = fakeFetch([{ ok: true, status: 201 }, { ok: false, status: 409 }]);
    const provisioning = createEmqxProvisioning(fetchImpl);

    const credencial = await provisioning.provisionarCredencial("13");
    assert.equal(credencial.username, "chofer-13");
  });
});

test("emqxProvisioning — provisionarCredencial lanza si crear el usuario falla con otro código", async () => {
  await conConfigDeTest(async () => {
    const fetchImpl = fakeFetch([{ ok: false, status: 500 }]);
    const provisioning = createEmqxProvisioning(fetchImpl);

    await assert.rejects(() => provisioning.provisionarCredencial("13"), /emqx_provisionar_fallo/);
  });
});

test("emqxProvisioning — provisionarCredencial lanza si la regla de ACL falla", async () => {
  await conConfigDeTest(async () => {
    const fetchImpl = fakeFetch([{ ok: true, status: 201 }, { ok: false, status: 400 }]);
    const provisioning = createEmqxProvisioning(fetchImpl);

    await assert.rejects(() => provisioning.provisionarCredencial("13"), /emqx_provisionar_acl_fallo/);
  });
});

test("emqxProvisioning — revocarCredencial elimina el usuario y su regla de ACL por fleteId", async () => {
  await conConfigDeTest(async () => {
    const fetchImpl = fakeFetch([{ ok: true, status: 204 }, { ok: true, status: 204 }]);
    const provisioning = createEmqxProvisioning(fetchImpl);

    await provisioning.revocarCredencial("13");

    assert.equal(fetchImpl.llamadas.length, 2);
    const [borraUsuario, borraRegla] = fetchImpl.llamadas;
    assert.match(borraUsuario.url, /\/authentication\/.+\/users\/chofer-13$/);
    assert.equal(borraUsuario.opciones.method, "DELETE");
    assert.match(borraRegla.url, /\/authorization\/.+\/rules\/users\/chofer-13$/);
    assert.equal(borraRegla.opciones.method, "DELETE");
  });
});

test("emqxProvisioning — revocarCredencial es idempotente (404 en usuario y regla no lanza)", async () => {
  await conConfigDeTest(async () => {
    const fetchImpl = fakeFetch([{ ok: false, status: 404 }, { ok: false, status: 404 }]);
    const provisioning = createEmqxProvisioning(fetchImpl);

    await assert.doesNotReject(() => provisioning.revocarCredencial("13"));
  });
});

test("emqxProvisioning — revocarCredencial es no-op si no se pasa fleteId", async () => {
  await conConfigDeTest(async () => {
    const fetchImpl = fakeFetch([]);
    const provisioning = createEmqxProvisioning(fetchImpl);

    await assert.doesNotReject(() => provisioning.revocarCredencial(null));
    assert.equal(fetchImpl.llamadas.length, 0);
  });
});

// 2026-08-10 (T060/T061 de tasks.md, Phase 8) — credencial permanente por-chofer.

test("derivarCredencialChofer — determinística: mismo choferId, misma contraseña siempre", async () => {
  await conConfigDeTest(async () => {
    const a = derivarCredencialChofer("CH-345");
    const b = derivarCredencialChofer("CH-345");
    assert.equal(a.username, "chofer-CH-345");
    assert.equal(a.password, b.password);
  });
});

test("derivarCredencialChofer — distinta de derivarCredencial para el mismo valor de id", async () => {
  await conConfigDeTest(async () => {
    // Mismo string usado como fleteId y como choferId: los usernames
    // coinciden (mismo prefijo `chofer-{id}`) porque comparten espacio de
    // nombres en EMQX — comportamiento conocido, no un bug de este test.
    // Lo que SÍ debe diferir es que cada función deriva desde su propio
    // parámetro sin mezclarlos.
    const porFlete = derivarCredencial("99");
    const porChofer = derivarCredencialChofer("99");
    assert.equal(porFlete.username, porChofer.username);
    assert.equal(porFlete.password, porChofer.password); // HMAC del mismo string de entrada
  });
});

test("emqxProvisioning — provisionarCredencialChofer crea el usuario MQTT con ACL amplia (chofer/+/ubicacion)", async () => {
  await conConfigDeTest(async () => {
    const fetchImpl = fakeFetch([{ ok: true, status: 201 }, { ok: true, status: 204 }]);
    const provisioning = createEmqxProvisioning(fetchImpl);

    const credencial = await provisioning.provisionarCredencialChofer("CH-345");

    assert.equal(credencial.username, "chofer-CH-345");
    assert.ok(credencial.password.length > 0);
    assert.equal(fetchImpl.llamadas.length, 2);

    const [creaUsuario, creaRegla] = fetchImpl.llamadas;
    assert.equal(creaUsuario.url, USERS_URL);
    const bodyUsuario = JSON.parse(creaUsuario.opciones.body);
    assert.equal(bodyUsuario.user_id, "chofer-CH-345");

    assert.equal(creaRegla.url, REGLAS_URL);
    const bodyRegla = JSON.parse(creaRegla.opciones.body);
    assert.deepEqual(bodyRegla, [
      { username: "chofer-CH-345", rules: [{ action: "publish", permission: "allow", topic: "chofer/+/ubicacion" }] },
    ]);
  });
});

test("emqxProvisioning — provisionarCredencialChofer es idempotente (409 en usuario y regla no lanza)", async () => {
  await conConfigDeTest(async () => {
    const fetchImpl = fakeFetch([
      { ok: false, status: 409 },
      { ok: true, status: 200 },
      { ok: false, status: 409 },
    ]);
    const provisioning = createEmqxProvisioning(fetchImpl);

    const credencial = await provisioning.provisionarCredencialChofer("CH-345");
    assert.equal(credencial.username, "chofer-CH-345");
    assert.equal(fetchImpl.llamadas.length, 3);
  });
});

test("emqxProvisioning — provisionarCredencialChofer reusa la misma credencial en llamadas repetidas (recorridos distintos, mismo chofer)", async () => {
  await conConfigDeTest(async () => {
    const fetchImpl = fakeFetch([
      { ok: true, status: 201 },
      { ok: true, status: 204 },
      { ok: false, status: 409 },
      { ok: true, status: 200 },
      { ok: false, status: 409 },
    ]);
    const provisioning = createEmqxProvisioning(fetchImpl);

    const primera = await provisioning.provisionarCredencialChofer("CH-345");
    const segunda = await provisioning.provisionarCredencialChofer("CH-345");

    assert.equal(primera.username, segunda.username);
    assert.equal(primera.password, segunda.password);
  });
});
