import { test } from "node:test";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { startMqttBridgeWithConnector } from "../../src/services/mqttBridge.js";
import { createIntegracionStore } from "../../src/state/integracionStore.js";

// Mismo patrón que tests/integration/mqtt-reconexion.test.js: un cliente MQTT
// fake basado en EventEmitter, sin conexión real a ningún broker.
function crearClienteFake() {
  const emitter = new EventEmitter();
  emitter.subscribe = (topic, opts, cb) => cb?.();
  emitter.end = () => {};
  return emitter;
}

function loggerSilencioso() {
  return { warn: () => {}, error: () => {}, info: () => {} };
}

test("obtenerMetricas — habilitado:false y sin conectar si no hay MQTT_BROKER_URL", () => {
  const prevUrl = process.env.MQTT_BROKER_URL;
  delete process.env.MQTT_BROKER_URL;

  try {
    const bridge = startMqttBridgeWithConnector(createIntegracionStore(), () => crearClienteFake(), loggerSilencioso());
    assert.deepEqual(bridge.obtenerMetricas(), { habilitado: false });
  } finally {
    if (prevUrl === undefined) delete process.env.MQTT_BROKER_URL;
    else process.env.MQTT_BROKER_URL = prevUrl;
  }
});

test("obtenerMetricas — conectado pasa a true en 'connect' y a false en 'reconnect'/'close'/'offline'", () => {
  const prevUrl = process.env.MQTT_BROKER_URL;
  process.env.MQTT_BROKER_URL = "mqtt://fake";
  const client = crearClienteFake();
  const bridge = startMqttBridgeWithConnector(createIntegracionStore(), () => client, loggerSilencioso());

  try {
    assert.equal(bridge.obtenerMetricas().conectado, false);
    client.emit("connect");
    assert.equal(bridge.obtenerMetricas().conectado, true);
    client.emit("reconnect");
    assert.equal(bridge.obtenerMetricas().conectado, false);
    assert.equal(bridge.obtenerMetricas().reconexiones, 1);
    client.emit("connect");
    client.emit("close");
    assert.equal(bridge.obtenerMetricas().conectado, false);
    client.emit("connect");
    client.emit("offline");
    assert.equal(bridge.obtenerMetricas().conectado, false);
  } finally {
    bridge.stop();
    if (prevUrl === undefined) delete process.env.MQTT_BROKER_URL;
    else process.env.MQTT_BROKER_URL = prevUrl;
  }
});

test("obtenerMetricas — recibidos/procesados suben con un mensaje válido de un chofer sin recorrido activo", () => {
  const prevUrl = process.env.MQTT_BROKER_URL;
  process.env.MQTT_BROKER_URL = "mqtt://fake";
  const client = crearClienteFake();
  const store = createIntegracionStore();
  const bridge = startMqttBridgeWithConnector(store, () => client, loggerSilencioso());

  try {
    client.emit(
      "message",
      "chofer/CH-1/ubicacion",
      Buffer.from(JSON.stringify({ eventId: "evt-1", choferId: "CH-1", lat: -34.6, lon: -58.4, en: "2026-08-21T12:00:00-03:00" })),
    );

    const metricas = bridge.obtenerMetricas();
    assert.equal(metricas.recibidos, 1);
    assert.equal(metricas.procesados, 1);
    assert.equal(metricas.duplicadosDescartados, 0);
    assert.equal(metricas.invalidos, 0);
    assert.equal(metricas.ultimoMensajeEn, "2026-08-21T12:00:00-03:00");
  } finally {
    bridge.stop();
    if (prevUrl === undefined) delete process.env.MQTT_BROKER_URL;
    else process.env.MQTT_BROKER_URL = prevUrl;
  }
});

test("obtenerMetricas — duplicadosDescartados sube en un segundo mensaje con el mismo eventId", () => {
  const prevUrl = process.env.MQTT_BROKER_URL;
  process.env.MQTT_BROKER_URL = "mqtt://fake";
  const client = crearClienteFake();
  const bridge = startMqttBridgeWithConnector(createIntegracionStore(), () => client, loggerSilencioso());

  try {
    const payload = Buffer.from(
      JSON.stringify({ eventId: "evt-dup", choferId: "CH-1", lat: -34.6, lon: -58.4, en: "2026-08-21T12:00:00-03:00" }),
    );
    client.emit("message", "chofer/CH-1/ubicacion", payload);
    client.emit("message", "chofer/CH-1/ubicacion", payload);

    const metricas = bridge.obtenerMetricas();
    assert.equal(metricas.recibidos, 2);
    assert.equal(metricas.procesados, 1);
    assert.equal(metricas.duplicadosDescartados, 1);
  } finally {
    bridge.stop();
    if (prevUrl === undefined) delete process.env.MQTT_BROKER_URL;
    else process.env.MQTT_BROKER_URL = prevUrl;
  }
});

test("obtenerMetricas — invalidos sube con un payload que no es JSON válido", () => {
  const prevUrl = process.env.MQTT_BROKER_URL;
  process.env.MQTT_BROKER_URL = "mqtt://fake";
  const client = crearClienteFake();
  const bridge = startMqttBridgeWithConnector(createIntegracionStore(), () => client, loggerSilencioso());

  try {
    client.emit("message", "chofer/CH-1/ubicacion", Buffer.from("esto no es json"));

    const metricas = bridge.obtenerMetricas();
    assert.equal(metricas.recibidos, 1);
    assert.equal(metricas.invalidos, 1);
    assert.equal(metricas.procesados, 0);
  } finally {
    bridge.stop();
    if (prevUrl === undefined) delete process.env.MQTT_BROKER_URL;
    else process.env.MQTT_BROKER_URL = prevUrl;
  }
});
