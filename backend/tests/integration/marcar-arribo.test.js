import { test } from "node:test";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { createInMemoryRecorridoRepository } from "../helpers/inMemoryRecorridoRepository.js";
import { createFakeEmqxProvisioning } from "../helpers/fakeEmqxProvisioning.js";
import { iniciarServidorDePrueba } from "../helpers/testServer.js";
import { createSubscriber } from "../../src/mqtt/subscriber.js";

// Reemplaza (003-mqtt-broker-fletes) el POST directo por una publicación
// simulada en vickytruck/fletes/{token}/eventos, igual que hace el chofer
// real a través de frontend/src/services/mqttClient.js.
function crearClienteMqttFake() {
  const emitter = new EventEmitter();
  emitter.subscribe = () => {};
  emitter.simularPublicacion = (topic, payload) => {
    emitter.emit("message", topic, Buffer.from(JSON.stringify(payload)));
  };
  return emitter;
}

test("US2 — marcar arribo sobre un punto no inicial funciona igual (marcado libre)", async () => {
  const repository = createInMemoryRecorridoRepository([
    {
      token: "tok-1",
      puntos: [
        { id: "p1", orden: 1, latitud: 0, longitud: 0, estado: "pendiente" },
        { id: "p2", orden: 2, latitud: 0, longitud: 0, estado: "pendiente" },
        { id: "p3", orden: 3, latitud: 0, longitud: 0, estado: "pendiente" },
      ],
    },
  ]);
  const server = await iniciarServidorDePrueba(repository, undefined, createFakeEmqxProvisioning());
  const mqttClient = crearClienteMqttFake();
  createSubscriber({ client: mqttClient, repository, ubicacionStore: { registrar() {} } }).iniciar();

  try {
    // Se marca arribo en el punto 3 sin haber tocado el 1 ni el 2.
    mqttClient.simularPublicacion("vickytruck/fletes/tok-1/eventos", { tipo: "arribo", puntoId: "p3" });
    await new Promise((resolve) => setImmediate(resolve));

    const estadoActual = await (await fetch(`${server.baseUrl}/tok-1`)).json();
    const porId = Object.fromEntries(estadoActual.puntos.map((p) => [p.id, p.estado]));
    assert.equal(porId.p1, "pendiente");
    assert.equal(porId.p2, "pendiente");
    assert.equal(porId.p3, "arribado");
  } finally {
    await server.cerrar();
  }
});
