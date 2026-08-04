import { test } from "node:test";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { createInMemoryRecorridoRepository } from "../helpers/inMemoryRecorridoRepository.js";
import { createFakeEmqxProvisioning } from "../helpers/fakeEmqxProvisioning.js";
import { createSubscriber } from "../../src/mqtt/subscriber.js";

function crearClienteFake() {
  const emitter = new EventEmitter();
  emitter.subscribe = () => {};
  emitter.simularMensaje = (topic, payload) => {
    emitter.emit("message", topic, Buffer.from(JSON.stringify(payload)));
  };
  return emitter;
}

function repositorioConRecorrido() {
  return createInMemoryRecorridoRepository([
    {
      token: "tok-1",
      puntos: [{ id: "p1", orden: 1, latitud: 0, longitud: 0, estado: "pendiente" }],
    },
  ]);
}

const ubicacionStoreNoop = { registrar() {} };

test("mqtt/subscriber — un mensaje de arribo marca el punto como arribado (FR-002)", async () => {
  const client = crearClienteFake();
  const repository = repositorioConRecorrido();
  createSubscriber({ client, repository, ubicacionStore: ubicacionStoreNoop }).iniciar();

  client.simularMensaje("vickytruck/fletes/tok-1/eventos", { tipo: "arribo", puntoId: "p1", lat: -1, lon: -1 });
  await new Promise((resolve) => setImmediate(resolve));

  const recorrido = await repository.obtenerPorToken("tok-1");
  assert.equal(recorrido.puntos[0].estado, "arribado");
});

test("mqtt/subscriber — un mensaje de descarga marca el punto como completado (FR-002)", async () => {
  const client = crearClienteFake();
  const repository = repositorioConRecorrido();
  createSubscriber({ client, repository, ubicacionStore: ubicacionStoreNoop }).iniciar();

  client.simularMensaje("vickytruck/fletes/tok-1/eventos", { tipo: "arribo", puntoId: "p1" });
  await new Promise((resolve) => setImmediate(resolve));
  client.simularMensaje("vickytruck/fletes/tok-1/eventos", { tipo: "descarga", puntoId: "p1" });
  await new Promise((resolve) => setImmediate(resolve));

  const recorrido = await repository.obtenerPorToken("tok-1");
  assert.equal(recorrido.puntos[0].estado, "completado");
});

test("mqtt/subscriber — un puntoId inexistente se descarta sin interrumpir la suscripción (FR-013)", async () => {
  const client = crearClienteFake();
  const repository = repositorioConRecorrido();
  createSubscriber({ client, repository, ubicacionStore: ubicacionStoreNoop }).iniciar();

  client.simularMensaje("vickytruck/fletes/tok-1/eventos", { tipo: "arribo", puntoId: "no-existe" });
  await new Promise((resolve) => setImmediate(resolve));

  client.simularMensaje("vickytruck/fletes/tok-1/eventos", { tipo: "arribo", puntoId: "p1" });
  await new Promise((resolve) => setImmediate(resolve));

  const recorrido = await repository.obtenerPorToken("tok-1");
  assert.equal(recorrido.puntos[0].estado, "arribado");
});

test("mqtt/subscriber — una transición inválida (descarga antes de arribo) se descarta sin lanzar (FR-013)", async () => {
  const client = crearClienteFake();
  const repository = repositorioConRecorrido();
  createSubscriber({ client, repository, ubicacionStore: ubicacionStoreNoop }).iniciar();

  client.simularMensaje("vickytruck/fletes/tok-1/eventos", { tipo: "descarga", puntoId: "p1" });
  await new Promise((resolve) => setImmediate(resolve));

  const recorrido = await repository.obtenerPorToken("tok-1");
  assert.equal(recorrido.puntos[0].estado, "pendiente");
});

test("mqtt/subscriber — un tipo desconocido se descarta sin lanzar (FR-013)", async () => {
  const client = crearClienteFake();
  const repository = repositorioConRecorrido();
  createSubscriber({ client, repository, ubicacionStore: ubicacionStoreNoop }).iniciar();

  client.simularMensaje("vickytruck/fletes/tok-1/eventos", { tipo: "otra-cosa", puntoId: "p1" });
  await new Promise((resolve) => setImmediate(resolve));

  const recorrido = await repository.obtenerPorToken("tok-1");
  assert.equal(recorrido.puntos[0].estado, "pendiente");
});

test("mqtt/subscriber — al completar el último punto, se revoca la credencial MQTT del token (FR-008, US3)", async () => {
  const client = crearClienteFake();
  const repository = repositorioConRecorrido(); // un solo punto: "descarga" ya deja el recorrido 100% completado
  const emqxProvisioning = createFakeEmqxProvisioning();
  await emqxProvisioning.provisionarCredencial("tok-1");
  createSubscriber({ client, repository, ubicacionStore: ubicacionStoreNoop, emqxProvisioning }).iniciar();

  client.simularMensaje("vickytruck/fletes/tok-1/eventos", { tipo: "arribo", puntoId: "p1" });
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(emqxProvisioning._revocados(), []); // todavía no completó

  client.simularMensaje("vickytruck/fletes/tok-1/eventos", { tipo: "descarga", puntoId: "p1" });
  await new Promise((resolve) => setImmediate(resolve));

  assert.deepEqual(emqxProvisioning._revocados(), ["tok-1"]);
});

test("mqtt/subscriber — completar un punto sin dejar el recorrido 100% no revoca nada", async () => {
  const client = crearClienteFake();
  const repository = createInMemoryRecorridoRepository([
    {
      token: "tok-2",
      puntos: [
        { id: "p1", orden: 1, latitud: 0, longitud: 0, estado: "pendiente" },
        { id: "p2", orden: 2, latitud: 0, longitud: 0, estado: "pendiente" },
      ],
    },
  ]);
  const emqxProvisioning = createFakeEmqxProvisioning();
  await emqxProvisioning.provisionarCredencial("tok-2");
  createSubscriber({ client, repository, ubicacionStore: ubicacionStoreNoop, emqxProvisioning }).iniciar();

  client.simularMensaje("vickytruck/fletes/tok-2/eventos", { tipo: "arribo", puntoId: "p1" });
  await new Promise((resolve) => setImmediate(resolve));
  client.simularMensaje("vickytruck/fletes/tok-2/eventos", { tipo: "descarga", puntoId: "p1" });
  await new Promise((resolve) => setImmediate(resolve));

  assert.deepEqual(emqxProvisioning._revocados(), []); // p2 sigue pendiente
});
