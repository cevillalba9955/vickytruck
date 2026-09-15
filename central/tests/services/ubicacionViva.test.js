import { describe, expect, it } from "vitest";
import { aplicarUbicacionViva } from "../../src/services/ubicacionViva.js";

describe("aplicarUbicacionViva (013-mqtt-a-backend-directo)", () => {
  it("actualiza ultimaUbicacion del recorrido cuyo chofer.id matchea evento.choferId", () => {
    const activos = [
      { id: "50", chofer: { id: "CH-1", nombre: "Juan Pérez" }, ultimaUbicacion: null },
    ];

    const resultado = aplicarUbicacionViva(activos, {
      choferId: "CH-1",
      lat: -34.6,
      lon: -58.4,
      en: "2026-09-15T10:00:00-03:00",
    });

    expect(resultado[0].ultimaUbicacion).toEqual({
      lat: -34.6,
      lon: -58.4,
      en: "2026-09-15T10:00:00-03:00",
      reciente: true,
    });
  });

  it("no toca recorridos cuyo chofer.id no matchea", () => {
    const original = { id: "51", chofer: { id: "CH-2" }, ultimaUbicacion: { lat: 1, lon: 2, en: "x", reciente: false } };
    const resultado = aplicarUbicacionViva([original], { choferId: "CH-1", lat: -34.6, lon: -58.4, en: "y" });

    expect(resultado[0]).toBe(original);
  });

  it("solo actualiza el recorrido del chofer correcto entre varios activos", () => {
    const activos = [
      { id: "50", chofer: { id: "CH-1" }, ultimaUbicacion: null },
      { id: "51", chofer: { id: "CH-2" }, ultimaUbicacion: null },
    ];

    const resultado = aplicarUbicacionViva(activos, { choferId: "CH-2", lat: -1, lon: -2, en: "z" });

    expect(resultado[0].ultimaUbicacion).toBeNull();
    expect(resultado[1].ultimaUbicacion).toMatchObject({ lat: -1, lon: -2 });
  });

  it("no rompe si un recorrido no tiene chofer asignado (chofer: null)", () => {
    const activos = [{ id: "52", chofer: null, ultimaUbicacion: null }];
    const resultado = aplicarUbicacionViva(activos, { choferId: "CH-1", lat: -1, lon: -2, en: "z" });

    expect(resultado[0].ultimaUbicacion).toBeNull();
  });

  it("marca reciente:true sin importar el valor previo de ultimaUbicacion", () => {
    const activos = [{ id: "50", chofer: { id: "CH-1" }, ultimaUbicacion: { lat: 0, lon: 0, en: "viejo", reciente: false } }];
    const resultado = aplicarUbicacionViva(activos, { choferId: "CH-1", lat: -34.6, lon: -58.4, en: "nuevo" });

    expect(resultado[0].ultimaUbicacion.reciente).toBe(true);
    expect(resultado[0].ultimaUbicacion.en).toBe("nuevo");
  });

  it("ya no matchea por flete.id/fleteId (bug preexistente corregido: el payload MQTT no incluye fleteId desde 012-ubicacion-por-chofer)", () => {
    const activos = [{ id: "50", flete: { id: "7" }, chofer: { id: "CH-1" }, ultimaUbicacion: null }];
    // Un evento sin choferId (o con choferId undefined, como devolvía el
    // parseo viejo de fleteId) no debe matchear por flete.id.
    const resultado = aplicarUbicacionViva(activos, { fleteId: "7", lat: -1, lon: -2, en: "z" });

    expect(resultado[0].ultimaUbicacion).toBeNull();
  });
});
