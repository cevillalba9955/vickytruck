import { test } from "node:test";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { startMqttBridgeWithConnector } from "../../src/services/mqttBridge.js";
import { createIntegracionStore } from "../../src/state/integracionStore.js";

function crearClienteFake() {
  const emitter = new EventEmitter();
  emitter.subscribe = (topic, opts, cb) => cb?.();
  emitter.end = () => {};
  return emitter;
}

test("US3 — bridge procesa mensaje tras reconexión", async () => {
  const prevUrl = process.env.MQTT_BROKER_URL;
  process.env.MQTT_BROKER_URL = "mqtt://fake";

  const store = createIntegracionStore();
  store.upsertRecorridos([{ id: "R-1", fleteId: "F-1", estado: "activo", puntos: [] }]);

  const logs = [];
  const logger = {
    warn: () => {},
    error: () => {},
    info: (msg) => logs.push(msg),
  };

  const client = crearClienteFake();
  const bridge = startMqttBridgeWithConnector(store, () => client, logger);

  try {
    client.emit("connect");
    client.emit("reconnect");
    client.emit(
      "message",
      "chofer/F-1/ubicacion",
      Buffer.from(
        JSON.stringify({ eventId: "evt-1", fleteId: "F-1", lat: -34.6, lon: -58.4, en: "2026-08-05T12:00:00Z" }),
      ),
    );

    const estado = store.listarEstado("R-1")[0];
    assert.equal(estado.ultimaUbicacion.lat, -34.6);
    assert.equal(estado.ultimaUbicacion.lon, -58.4);
    assert.ok(logs.includes("[mqtt-bridge] reconectando..."));
  } finally {
    bridge.stop();
    process.env.MQTT_BROKER_URL = prevUrl;
  }
});
