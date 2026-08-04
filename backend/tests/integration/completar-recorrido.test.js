import { test } from "node:test";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { createInMemoryRecorridoRepository } from "../helpers/inMemoryRecorridoRepository.js";
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
  const mqttClient = crearClienteMqttFake();
  createSubscriber({ client: mqttClient, repository, ubicacionStore: { registrar() {} } }).iniciar();

  for (const puntoId of ["p1", "p2"]) {
    mqttClient.simularPublicacion("vickytruck/fletes/tok-1/eventos", { tipo: "arribo", puntoId });
    await new Promise((resolve) => setImmediate(resolve));
    mqttClient.simularPublicacion("vickytruck/fletes/tok-1/eventos", { tipo: "descarga", puntoId });
    await new Promise((resolve) => setImmediate(resolve));
  }

  // 004-chofer-cloud-broker: se lee el estado final directo del repositorio
  // (ya no hay GET HTTP para verificarlo).
  const estadoFinal = await repository.obtenerPorToken("tok-1");
  assert.deepEqual(estadoFinal.progreso, { pendientes: 0, arribados: 0, completados: 2 });
  assert.ok(estadoFinal.puntos.every((p) => p.estado === "completado"));
});
