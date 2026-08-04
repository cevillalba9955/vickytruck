import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const clienteFake = {
  on: vi.fn(),
  publish: vi.fn((topic, payload, opts, cb) => cb(null)),
  end: vi.fn(),
};

vi.mock("mqtt", () => ({
  default: { connect: vi.fn(() => clienteFake) },
}));

import mqtt from "mqtt";
import { conectar, publicar, desconectar } from "../../src/services/mqttClient.js";

describe("mqttClient (frontend)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clienteFake.publish.mockImplementation((topic, payload, opts, cb) => cb(null));
  });

  afterEach(() => {
    desconectar();
  });

  it("conecta una sola vez con la config recibida (url/username/password)", () => {
    const config = { url: "wss://broker.test:8084/mqtt", username: "tok-1", password: "secreto" };
    conectar(config);
    conectar(config);

    expect(mqtt.connect).toHaveBeenCalledTimes(1);
    expect(mqtt.connect).toHaveBeenCalledWith(
      "wss://broker.test:8084/mqtt",
      expect.objectContaining({ username: "tok-1", password: "secreto", reconnectPeriod: expect.any(Number) }),
    );
  });

  it("publica con las opciones de qos/retain indicadas", async () => {
    conectar({ url: "wss://broker.test:8084/mqtt", username: "tok-1", password: "secreto" });

    await publicar("vickytruck/fletes/tok-1/ubicacion", { lat: -34.6, lon: -58.4 }, { qos: 0, retain: true });

    expect(clienteFake.publish).toHaveBeenCalledWith(
      "vickytruck/fletes/tok-1/ubicacion",
      JSON.stringify({ lat: -34.6, lon: -58.4 }),
      { qos: 0, retain: true },
      expect.any(Function),
    );
  });

  it("rechaza publicar si todavía no se conectó", async () => {
    await expect(publicar("x", {})).rejects.toThrow("mqtt_no_conectado");
  });

  it("rechaza la promesa si mqtt.js informa error en el publish", async () => {
    clienteFake.publish.mockImplementation((topic, payload, opts, cb) => cb(new Error("fallo_red")));
    conectar({ url: "wss://broker.test:8084/mqtt", username: "tok-1", password: "secreto" });

    await expect(publicar("x", {})).rejects.toThrow("fallo_red");
  });
});
