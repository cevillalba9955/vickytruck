import { test } from "node:test";
import assert from "node:assert/strict";
import { createInMemoryRecorridoRepository } from "../helpers/inMemoryRecorridoRepository.js";
import { createFakeEmqxProvisioning } from "../helpers/fakeEmqxProvisioning.js";
import { iniciarServidorDePrueba } from "../helpers/testServer.js";

test("GET /api/recorridos/:token — 200 con puntos ordenados y progreso", async () => {
  const repository = createInMemoryRecorridoRepository([
    {
      token: "tok-valido",
      estado: "activo",
      puntos: [
        { id: "p2", orden: 2, latitud: -34.6, longitud: -58.4, estado: "pendiente" },
        { id: "p1", orden: 1, latitud: -34.5, longitud: -58.3, estado: "completado" },
      ],
    },
  ]);
  const server = await iniciarServidorDePrueba(repository, undefined, createFakeEmqxProvisioning());

  try {
    const res = await fetch(`${server.baseUrl}/tok-valido`);
    assert.equal(res.status, 200);
    const body = await res.json();

    assert.equal(body.recorrido.estado, "activo");
    assert.equal(body.puntos.length, 2);
    // Orden por `orden`, no por orden de inserción (FR-003)
    assert.deepEqual(
      body.puntos.map((p) => p.orden),
      [1, 2],
    );
    assert.equal(body.puntos[0].totalPuntos, 2);
    assert.deepEqual(body.progreso, { pendientes: 1, arribados: 0, completados: 1 });
  } finally {
    await server.cerrar();
  }
});

test("GET /api/recorridos/:token — 200 incluye el bloque recorrido.mqtt (003-mqtt-broker-fletes)", async () => {
  const repository = createInMemoryRecorridoRepository([
    { token: "tok-valido", estado: "activo", puntos: [{ id: "p1", orden: 1, latitud: 0, longitud: 0, estado: "pendiente" }] },
  ]);
  const previoWss = process.env.EMQX_WSS_URL;
  process.env.EMQX_WSS_URL = "wss://broker.test:8084/mqtt";
  const server = await iniciarServidorDePrueba(repository, undefined, createFakeEmqxProvisioning());

  try {
    const res = await fetch(`${server.baseUrl}/tok-valido`);
    assert.equal(res.status, 200);
    const { recorrido } = await res.json();

    assert.equal(recorrido.mqtt.url, "wss://broker.test:8084/mqtt");
    assert.equal(recorrido.mqtt.username, "tok-valido");
    assert.equal(recorrido.mqtt.password, "fake-pass-tok-valido");
    assert.equal(recorrido.mqtt.ubicacionTopic, "vickytruck/fletes/tok-valido/ubicacion");
    assert.equal(recorrido.mqtt.eventosTopic, "vickytruck/fletes/tok-valido/eventos");
    assert.equal(typeof recorrido.mqtt.intervaloUbicacionMs, "number");
  } finally {
    await server.cerrar();
    process.env.EMQX_WSS_URL = previoWss;
  }
});

test("GET /api/recorridos/:token — 404 con token inválido", async () => {
  const repository = createInMemoryRecorridoRepository([
    { token: "tok-valido", puntos: [{ id: "p1", orden: 1, latitud: 0, longitud: 0, estado: "pendiente" }] },
  ]);
  const server = await iniciarServidorDePrueba(repository, undefined, createFakeEmqxProvisioning());

  try {
    const res = await fetch(`${server.baseUrl}/tok-inexistente`);
    assert.equal(res.status, 404);
    const body = await res.json();
    assert.equal(body.error, "enlace_invalido");
  } finally {
    await server.cerrar();
  }
});
