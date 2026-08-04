import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EventEmitter } from "node:events";

// EventEmitter real (no un simple vi.fn() para `.on`) para poder simular
// eventos de conexión (`connect`/`close`/`disconnect`/`error`) y probar
// `onEstadoCambio` (004-chofer-cloud-broker).
const clienteFake = Object.assign(new EventEmitter(), {
  publish: vi.fn((topic, payload, opts, cb) => cb(null)),
  end: vi.fn(),
});

vi.mock("mqtt", () => ({
  default: { connect: vi.fn(() => clienteFake) },
}));

import mqtt from "mqtt";
import { conectar, publicar, desconectar, onEstadoCambio } from "../../src/services/mqttClient.js";

describe("mqttClient (frontend)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clienteFake.publish.mockImplementation((topic, payload, opts, cb) => cb(null));
  });

  afterEach(() => {
    desconectar();
    clienteFake.removeAllListeners();
  });

  it("conecta una sola vez con la config recibida (url/username/password/clientId)", () => {
    const config = { url: "wss://broker.test:8084/mqtt", username: "tok-1", password: "secreto", clientId: "dev-abc" };
    conectar(config);
    conectar(config);

    expect(mqtt.connect).toHaveBeenCalledTimes(1);
    expect(mqtt.connect).toHaveBeenCalledWith(
      "wss://broker.test:8084/mqtt",
      expect.objectContaining({
        username: "tok-1",
        password: "secreto",
        clientId: "dev-abc",
        reconnectPeriod: expect.any(Number),
      }),
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

  describe("onEstadoCambio (004-chofer-cloud-broker, FR-008/FR-005a)", () => {
    it("emite 'conectando' al llamar conectar() y 'conectado' cuando el cliente dispara 'connect'", () => {
      const eventos = [];
      const desuscribir = onEstadoCambio((e) => eventos.push(e));

      conectar({ url: "wss://broker.test:8084/mqtt", username: "tok-1", password: "secreto" });
      clienteFake.emit("connect");

      expect(eventos).toEqual([{ estado: "conectando" }, { estado: "conectado" }]);
      desuscribir();
    });

    it("emite 'desconectado' con motivo 'red' cuando el cliente dispara 'close'", () => {
      const eventos = [];
      const desuscribir = onEstadoCambio((e) => eventos.push(e));
      conectar({ url: "wss://broker.test:8084/mqtt", username: "tok-1", password: "secreto" });

      clienteFake.emit("close");

      expect(eventos.at(-1)).toEqual({ estado: "desconectado", motivo: "red" });
      desuscribir();
    });

    it("emite 'desconectado' con motivo 'expulsado' cuando el bróker manda un paquete DISCONNECT (posible vínculo a otro dispositivo, FR-005a)", () => {
      const eventos = [];
      const desuscribir = onEstadoCambio((e) => eventos.push(e));
      conectar({ url: "wss://broker.test:8084/mqtt", username: "tok-1", password: "secreto" });

      clienteFake.emit("disconnect", { reasonCode: 142 });

      expect(eventos.at(-1)).toEqual({ estado: "desconectado", motivo: "expulsado", reasonCode: 142 });
      desuscribir();
    });

    it("un listener desuscripto no vuelve a recibir eventos", () => {
      const eventos = [];
      const desuscribir = onEstadoCambio((e) => eventos.push(e));
      desuscribir();

      conectar({ url: "wss://broker.test:8084/mqtt", username: "tok-1", password: "secreto" });
      clienteFake.emit("connect");

      expect(eventos).toEqual([]);
    });
  });
});
