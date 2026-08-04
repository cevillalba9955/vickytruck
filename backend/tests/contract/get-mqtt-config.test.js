import { test } from "node:test";
import assert from "node:assert/strict";
import { createInMemoryCentralRepository } from "../helpers/inMemoryCentralRepository.js";
import { iniciarServidorDePrueba } from "../helpers/testServer.js";

test("GET /api/central/mqtt-config — 200 con la credencial de servicio de Central (003-mqtt-broker-fletes)", async () => {
  const previos = {
    EMQX_WSS_URL: process.env.EMQX_WSS_URL,
    EMQX_CENTRAL_USERNAME: process.env.EMQX_CENTRAL_USERNAME,
    EMQX_CENTRAL_PASSWORD: process.env.EMQX_CENTRAL_PASSWORD,
  };
  process.env.EMQX_WSS_URL = "wss://broker.test:8084/mqtt";
  process.env.EMQX_CENTRAL_USERNAME = "vickytruck-central";
  process.env.EMQX_CENTRAL_PASSWORD = "secreto-central";

  const repository = createInMemoryCentralRepository({});
  const server = await iniciarServidorDePrueba(undefined, repository);

  try {
    const res = await fetch(`${server.centralBaseUrl}/mqtt-config`);
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.deepEqual(body, {
      url: "wss://broker.test:8084/mqtt",
      username: "vickytruck-central",
      password: "secreto-central",
      ubicacionTopicFilter: "vickytruck/fletes/+/ubicacion",
      eventosTopicFilter: "vickytruck/fletes/+/eventos",
    });
  } finally {
    await server.cerrar();
    Object.assign(process.env, previos);
  }
});
