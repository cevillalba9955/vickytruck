import { test } from "node:test";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { createInMemoryRecorridoRepository } from "../helpers/inMemoryRecorridoRepository.js";
import { createUbicacionEnMemoria } from "../../src/state/ubicacionEnMemoria.js";
import { createSubscriber } from "../../src/mqtt/subscriber.js";

// Fake mínimo del cliente mqtt.js: implementa lo mismo que usa
// subscriber.js (`.subscribe()`, `.on('message', ...)`) sobre un
// EventEmitter, sin conectar a un bróker real (research.md §1 de
// 003-mqtt-broker-fletes: los tests no dependen de EMQX Cloud).
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
    { token: "tok-1", id: "50", puntos: [{ id: "p1", orden: 1, latitud: 0, longitud: 0, estado: "pendiente" }] },
  ]);
}

test("mqtt/subscriber — un mensaje de ubicación válido actualiza ubicacionEnMemoria (FR-001)", async () => {
  const client = crearClienteFake();
  const ubicacionStore = createUbicacionEnMemoria();
  createSubscriber({ client, repository: repositorioConRecorrido(), ubicacionStore }).iniciar();

  client.simularMensaje("vickytruck/fletes/tok-1/ubicacion", { lat: -34.6, lon: -58.4, en: "2026-08-04T12:00:00Z" });
  // El handler resuelve el token de forma async (await repository.obtenerPorToken);
  // se espera un microtask/tick para que termine antes de aserta.
  await new Promise((resolve) => setImmediate(resolve));

  assert.deepEqual(ubicacionStore.obtener("50"), { lat: -34.6, lon: -58.4, en: "2026-08-04T12:00:00Z" });
});

test("mqtt/subscriber — un mensaje sin lat/lon se descarta sin lanzar (FR-013)", async () => {
  const client = crearClienteFake();
  const ubicacionStore = createUbicacionEnMemoria();
  createSubscriber({ client, repository: repositorioConRecorrido(), ubicacionStore }).iniciar();

  client.simularMensaje("vickytruck/fletes/tok-1/ubicacion", { en: "2026-08-04T12:00:00Z" });
  await new Promise((resolve) => setImmediate(resolve));

  assert.equal(ubicacionStore.obtener("50"), null);
});

test("mqtt/subscriber — un mensaje con token inválido se descarta sin interrumpir la suscripción (FR-013)", async () => {
  const client = crearClienteFake();
  const ubicacionStore = createUbicacionEnMemoria();
  createSubscriber({ client, repository: repositorioConRecorrido(), ubicacionStore }).iniciar();

  client.simularMensaje("vickytruck/fletes/tok-inexistente/ubicacion", { lat: -1, lon: -1 });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(ubicacionStore.obtener("50"), null);

  // La suscripción sigue viva: un mensaje válido posterior se procesa igual.
  client.simularMensaje("vickytruck/fletes/tok-1/ubicacion", { lat: -34.6, lon: -58.4, en: "2026-08-04T12:00:00Z" });
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(ubicacionStore.obtener("50"), { lat: -34.6, lon: -58.4, en: "2026-08-04T12:00:00Z" });
});

test("mqtt/subscriber — un payload no-JSON se descarta sin lanzar (FR-013)", async () => {
  const client = crearClienteFake();
  const ubicacionStore = createUbicacionEnMemoria();
  createSubscriber({ client, repository: repositorioConRecorrido(), ubicacionStore }).iniciar();

  client.emit("message", "vickytruck/fletes/tok-1/ubicacion", Buffer.from("no-es-json"));
  await new Promise((resolve) => setImmediate(resolve));

  assert.equal(ubicacionStore.obtener("50"), null);
});
