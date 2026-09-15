import { describe, expect, it } from "vitest";
import { parsearPayloadUbicacion } from "../../src/services/mqttClient.js";

describe("parsearPayloadUbicacion (013-mqtt-a-backend-directo)", () => {
  it("parsea choferId (no fleteId) desde el payload MQTT", () => {
    const payload = JSON.stringify({
      eventId: "evt-1",
      choferId: "CH-1",
      lat: -34.6,
      lon: -58.4,
      en: "2026-09-15T10:00:00-03:00",
    });

    const evento = parsearPayloadUbicacion("chofer/CH-1/ubicacion", payload);

    expect(evento).toEqual({
      topic: "chofer/CH-1/ubicacion",
      choferId: "CH-1",
      lat: -34.6,
      lon: -58.4,
      en: "2026-09-15T10:00:00-03:00",
      eventId: "evt-1",
    });
  });

  it("ignora un fleteId presente en el payload — choferId es la única clave de ruteo", () => {
    const payload = JSON.stringify({ fleteId: "7", choferId: "CH-1", lat: -1, lon: -2 });
    const evento = parsearPayloadUbicacion("chofer/CH-1/ubicacion", payload);

    expect(evento.choferId).toBe("CH-1");
    expect(evento).not.toHaveProperty("fleteId");
  });

  it("usa un timestamp propio si el payload no trae `en`", () => {
    const payload = JSON.stringify({ choferId: "CH-1", lat: -1, lon: -2 });
    const evento = parsearPayloadUbicacion("chofer/CH-1/ubicacion", payload);

    expect(evento.en).toMatch(/-03:00$/);
  });

  it("eventId es null si el payload no lo incluye", () => {
    const payload = JSON.stringify({ choferId: "CH-1", lat: -1, lon: -2, en: "z" });
    const evento = parsearPayloadUbicacion("chofer/CH-1/ubicacion", payload);

    expect(evento.eventId).toBeNull();
  });

  it("lanza si el payload no es JSON válido (el caller lo captura como payload_error)", () => {
    expect(() => parsearPayloadUbicacion("chofer/CH-1/ubicacion", "esto no es json")).toThrow();
  });
});
