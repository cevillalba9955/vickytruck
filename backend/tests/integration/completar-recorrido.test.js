import { test } from "node:test";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { createInMemoryRecorridoRepository } from "../helpers/inMemoryRecorridoRepository.js";
import { createFakeEmqxProvisioning } from "../helpers/fakeEmqxProvisioning.js";
import { iniciarServidorDePrueba } from "../helpers/testServer.js";
import { createSubscriber } from "../../src/mqtt/subscriber.js";

function crearClienteMqttFake() {
  const emitter = new EventEmitter();
  emitter.subscribe = () => {};
  emitter.simularPublicacion = (topic, payload) => {
    emitter.emit("message", topic, Buffer.from(JSON.stringify(payload)));
  };
  return emitter;
}

test("US3 — flujo completo arribo -> descarga en los 2 puntos deja el recorrido 100% completado", async () => {
  const repository = createInMemoryRecorridoRepository([
    {
      token: "tok-1",
      puntos: [
        { id: "p1", orden: 1, latitud: 0, longitud: 0, estado: "pendiente" },
        { id: "p2", orden: 2, latitud: 0, longitud: 0, estado: "pendiente" },
      ],
    },
  ]);
  const server = await iniciarServidorDePrueba(repository, undefined, createFakeEmqxProvisioning());
  const mqttClient = crearClienteMqttFake();
  createSubscriber({ client: mqttClient, repository, ubicacionStore: { registrar() {} } }).iniciar();

  try {
    for (const puntoId of ["p1", "p2"]) {
      mqttClient.simularPublicacion("vickytruck/fletes/tok-1/eventos", { tipo: "arribo", puntoId });
      await new Promise((resolve) => setImmediate(resolve));
      mqttClient.simularPublicacion("vickytruck/fletes/tok-1/eventos", { tipo: "descarga", puntoId });
      await new Promise((resolve) => setImmediate(resolve));
    }

    const estadoFinal = await (await fetch(`${server.baseUrl}/tok-1`)).json();
    assert.deepEqual(estadoFinal.progreso, { pendientes: 0, arribados: 0, completados: 2 });
    assert.ok(estadoFinal.puntos.every((p) => p.estado === "completado"));
  } finally {
    await server.cerrar();
  }
});
