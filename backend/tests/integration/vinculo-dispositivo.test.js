import { test } from "node:test";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { createInMemoryRecorridoRepository } from "../helpers/inMemoryRecorridoRepository.js";
import { createFakeEmqxProvisioning } from "../helpers/fakeEmqxProvisioning.js";
import { createVinculoDispositivo } from "../../src/state/vinculoDispositivo.js";
import { createConexionWatcher } from "../../src/mqtt/conexionWatcher.js";

function crearClienteFake() {
  const emitter = new EventEmitter();
  emitter.subscribe = () => {};
  emitter.simularConexion = (clientid, username) => {
    emitter.emit(
      "message",
      `$SYS/brokers/emqx@node1/clients/${clientid}/connected`,
      Buffer.from(JSON.stringify({ clientid, username })),
    );
  };
  return emitter;
}

function repositorioConRecorrido(token = "tok-1") {
  return createInMemoryRecorridoRepository([
    { token, puntos: [{ id: "p1", orden: 1, latitud: 0, longitud: 0, estado: "pendiente" }] },
  ]);
}

test("conexionWatcher — el primer dispositivo que conecta con un token queda vinculado, sin expulsión", async () => {
  const client = crearClienteFake();
  const vinculoDispositivo = createVinculoDispositivo();
  const emqxProvisioning = createFakeEmqxProvisioning();
  createConexionWatcher({ client, repository: repositorioConRecorrido(), vinculoDispositivo, emqxProvisioning }).iniciar();

  client.simularConexion("dev-a", "tok-1");
  await new Promise((resolve) => setImmediate(resolve));

  assert.deepEqual(emqxProvisioning._expulsados(), []);
});

test("conexionWatcher — una reconexión del mismo clientId no dispara expulsión", async () => {
  const client = crearClienteFake();
  const vinculoDispositivo = createVinculoDispositivo();
  const emqxProvisioning = createFakeEmqxProvisioning();
  createConexionWatcher({ client, repository: repositorioConRecorrido(), vinculoDispositivo, emqxProvisioning }).iniciar();

  client.simularConexion("dev-a", "tok-1");
  await new Promise((resolve) => setImmediate(resolve));
  client.simularConexion("dev-a", "tok-1"); // reconexión (ej. red intermitente)
  await new Promise((resolve) => setImmediate(resolve));

  assert.deepEqual(emqxProvisioning._expulsados(), []);
});

test("conexionWatcher — un clientId distinto para el mismo token dispara la expulsión de esa sesión (FR-005a)", async () => {
  const client = crearClienteFake();
  const vinculoDispositivo = createVinculoDispositivo();
  const emqxProvisioning = createFakeEmqxProvisioning();
  createConexionWatcher({ client, repository: repositorioConRecorrido(), vinculoDispositivo, emqxProvisioning }).iniciar();

  client.simularConexion("dev-a", "tok-1");
  await new Promise((resolve) => setImmediate(resolve));
  client.simularConexion("dev-b", "tok-1"); // segundo dispositivo con el mismo token
  await new Promise((resolve) => setImmediate(resolve));

  assert.deepEqual(emqxProvisioning._expulsados(), ["dev-b"]);
});

test("conexionWatcher — un username que no corresponde a ningún token de recorrido conocido se ignora (mismo criterio que FR-013 de 003-mqtt-broker-fletes)", async () => {
  const client = crearClienteFake();
  const vinculoDispositivo = createVinculoDispositivo();
  const emqxProvisioning = createFakeEmqxProvisioning();
  createConexionWatcher({ client, repository: repositorioConRecorrido(), vinculoDispositivo, emqxProvisioning }).iniciar();

  client.simularConexion("dev-a", "vickytruck-central"); // credencial de servicio, no un token de flete
  await new Promise((resolve) => setImmediate(resolve));
  client.simularConexion("dev-b", "vickytruck-central");
  await new Promise((resolve) => setImmediate(resolve));

  assert.deepEqual(emqxProvisioning._expulsados(), []);
});

test("conexionWatcher — ignora mensajes de otros tópicos (ej. eventos/ubicación de fletes) sin lanzar", async () => {
  const client = crearClienteFake();
  const vinculoDispositivo = createVinculoDispositivo();
  const emqxProvisioning = createFakeEmqxProvisioning();
  createConexionWatcher({ client, repository: repositorioConRecorrido(), vinculoDispositivo, emqxProvisioning }).iniciar();

  assert.doesNotThrow(() => {
    client.emit("message", "vickytruck/fletes/tok-1/ubicacion", Buffer.from(JSON.stringify({ lat: 1, lon: 1 })));
  });
});

test("conexionWatcher — un payload no-JSON en el tópico de conexión se descarta sin lanzar", async () => {
  const client = crearClienteFake();
  const vinculoDispositivo = createVinculoDispositivo();
  const emqxProvisioning = createFakeEmqxProvisioning();
  createConexionWatcher({ client, repository: repositorioConRecorrido(), vinculoDispositivo, emqxProvisioning }).iniciar();

  assert.doesNotThrow(() => {
    client.emit("message", "$SYS/brokers/emqx@node1/clients/dev-a/connected", Buffer.from("no-es-json"));
  });
});
