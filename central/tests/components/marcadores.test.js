import { describe, expect, it } from "vitest";
import { construirMarcadoresFlete, construirPuntosEnMapa } from "../../src/services/marcadores.js";

describe("construirMarcadoresFlete", () => {
  it("genera un marcador por recorrido con ubicación conocida (FR-001)", () => {
    const marcadores = construirMarcadoresFlete([
      {
        id: "50",
        flete: { id: "7", nombre: "Juan Pérez" },
        ultimaUbicacion: { lat: -34.6, lon: -58.4, en: "2026-08-06T10:00:00Z", reciente: true },
      },
    ]);

    expect(marcadores).toEqual([
      { recorridoId: "50", fleteNombre: "Juan Pérez", lat: -34.6, lon: -58.4, en: "2026-08-06T10:00:00Z", reciente: true },
    ]);
  });

  it("omite el marcador de un flete sin ubicación conocida, sin inventar una posición (FR-007)", () => {
    const marcadores = construirMarcadoresFlete([
      {
        id: "51",
        flete: { id: "9", nombre: "Ana Gómez" },
        ultimaUbicacion: { lat: null, lon: null, en: null, reciente: false },
      },
    ]);

    expect(marcadores).toEqual([]);
  });

  it("distingue ubicación reciente de no reciente (FR-003)", () => {
    const marcadores = construirMarcadoresFlete([
      {
        id: "52",
        flete: { id: "10", nombre: "Mario Ruiz" },
        ultimaUbicacion: { lat: -34.61, lon: -58.39, en: "2026-08-06T09:00:00Z", reciente: false },
      },
    ]);

    expect(marcadores[0].reciente).toBe(false);
  });

  it("devuelve una lista vacía cuando no hay recorridos activos", () => {
    expect(construirMarcadoresFlete([])).toEqual([]);
  });
});

describe("construirPuntosEnMapa", () => {
  it("mapea cada punto con coordenadas a su representación en el mapa (FR-006)", () => {
    const puntos = construirPuntosEnMapa([
      { id: "P-1", orden: 1, lat: -34.6, lon: -58.4, estado: "arribado", arriboEn: "2026-08-06T10:00:00Z" },
    ]);

    expect(puntos).toEqual([{ id: "P-1", orden: 1, lat: -34.6, lon: -58.4, estado: "arribado" }]);
  });

  it("omite puntos sin coordenadas en vez de romper el mapa", () => {
    const puntos = construirPuntosEnMapa([{ id: "P-2", orden: 2, lat: null, lon: null, estado: "pendiente" }]);
    expect(puntos).toEqual([]);
  });
});
