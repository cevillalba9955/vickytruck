import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const clienteFake = {
  on: vi.fn(),
  off: vi.fn(),
  subscribe: vi.fn(),
  end: vi.fn(),
};

vi.mock("mqtt", () => ({
  default: { connect: vi.fn(() => clienteFake) },
}));

import mqtt from "mqtt";
import { conectar, suscribir, desconectar } from "../../src/services/mqttClient.js";

describe("mqttClient (central)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    desconectar();
  });

  it("conecta una sola vez con la credencial de servicio recibida", () => {
    const config = { url: "wss://broker.test:8084/mqtt", username: "vickytruck-central", password: "secreto" };
    conectar(config);
    conectar(config);

    expect(mqtt.connect).toHaveBeenCalledTimes(1);
    expect(mqtt.connect).toHaveBeenCalledWith(
      "wss://broker.test:8084/mqtt",
      expect.objectContaining({ username: "vickytruck-central", password: "secreto" }),
    );
  });

  it("se suscribe al filtro indicado y despacha solo los mensajes que matchean", () => {
    conectar({ url: "wss://broker.test:8084/mqtt", username: "u", password: "p" });
    const onMessage = vi.fn();
    suscribir("vickytruck/fletes/+/ubicacion", onMessage);

    expect(clienteFake.subscribe).toHaveBeenCalledWith("vickytruck/fletes/+/ubicacion", { qos: 0 });

    const handler = clienteFake.on.mock.calls.find(([evento]) => evento === "message")[1];
    handler("vickytruck/fletes/tok-1/ubicacion", Buffer.from(JSON.stringify({ lat: -34.6, lon: -58.4 })));
    handler("vickytruck/fletes/tok-1/eventos", Buffer.from(JSON.stringify({ tipo: "arribo" })));

    expect(onMessage).toHaveBeenCalledTimes(1);
    expect(onMessage).toHaveBeenCalledWith("vickytruck/fletes/tok-1/ubicacion", { lat: -34.6, lon: -58.4 });
  });

  it("usa QoS 1 al suscribirse a un filtro de eventos", () => {
    conectar({ url: "wss://broker.test:8084/mqtt", username: "u", password: "p" });
    suscribir("vickytruck/fletes/+/eventos", vi.fn());

    expect(clienteFake.subscribe).toHaveBeenCalledWith("vickytruck/fletes/+/eventos", { qos: 1 });
  });

  it("ignora mensajes con payload no-JSON sin lanzar", () => {
    conectar({ url: "wss://broker.test:8084/mqtt", username: "u", password: "p" });
    const onMessage = vi.fn();
    suscribir("vickytruck/fletes/+/ubicacion", onMessage);

    const handler = clienteFake.on.mock.calls.find(([evento]) => evento === "message")[1];
    expect(() => handler("vickytruck/fletes/tok-1/ubicacion", Buffer.from("no-json"))).not.toThrow();
    expect(onMessage).not.toHaveBeenCalled();
  });
});
