import { describe, expect, it } from "vitest";
import { calcularIntervaloPolling } from "../../src/services/polling.js";

describe("calcularIntervaloPolling", () => {
  it("broker conectado pero sin eventos llegando (canal directo): polling rápido", () => {
    expect(calcularIntervaloPolling({ mqttEstado: "connected", recibiendoEventosMqtt: false })).toBe(5000);
  });

  it("broker conectado y eventos llegando: respaldo lento", () => {
    expect(calcularIntervaloPolling({ mqttEstado: "connected", recibiendoEventosMqtt: true })).toBe(30000);
  });

  it("broker no conectado: polling rápido aunque hubiera eventos recientes", () => {
    expect(calcularIntervaloPolling({ mqttEstado: "reconnecting", recibiendoEventosMqtt: true })).toBe(5000);
  });
});
