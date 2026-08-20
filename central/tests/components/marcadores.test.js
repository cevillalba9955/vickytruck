import { describe, expect, it } from "vitest";
import {
  construirMarcadoresFlete,
  construirPuntosEnMapa,
  distanciaMetros,
  asignarColorPorFlete,
  construirMarcadoresMapaUnificado,
} from "../../src/services/marcadores.js";

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

describe("asignarColorPorFlete (010-mapa-central-unificado)", () => {
  it("asigna un color distinto a cada flete, por posición en la lista", () => {
    const colores = asignarColorPorFlete([
      { id: "50", flete: { id: "7" } },
      { id: "51", flete: { id: "8" } },
    ]);
    expect(colores.get("7")).toBeTruthy();
    expect(colores.get("8")).toBeTruthy();
    expect(colores.get("7")).not.toBe(colores.get("8"));
  });

  it("usa recorrido.color tal cual cuando está presente, con prioridad absoluta (FR-002a)", () => {
    const colores = asignarColorPorFlete([{ id: "50", flete: { id: "7" }, color: "#8e44ad" }]);
    expect(colores.get("7")).toBe("#8e44ad");
  });

  it("recicla la paleta si hay más fletes activos que colores", () => {
    const recorridos = Array.from({ length: 12 }, (_, i) => ({ id: `R-${i}`, flete: { id: `F-${i}` } }));
    const colores = asignarColorPorFlete(recorridos);
    // El color 10 (índice 0 tras reciclar) debe repetir al primero.
    expect(colores.get("F-10")).toBe(colores.get("F-0"));
  });
});

describe("construirMarcadoresMapaUnificado (010-mapa-central-unificado, US1)", () => {
  it("genera un marcador de flete y uno por cada punto con coordenadas, con el mismo color", () => {
    const marcadores = construirMarcadoresMapaUnificado([
      {
        id: "50",
        flete: { id: "7", nombre: "Camión 7" },
        ultimaUbicacion: { lat: -34.6, lon: -58.4, en: "2026-08-20T10:00:00Z", reciente: true },
        puntos: [
          { id: "p1", orden: 1, lat: -34.61, lon: -58.41, estado: "pendiente", cliente: "Almacén Centro" },
          { id: "p2", orden: 2, lat: null, lon: null, estado: "pendiente", cliente: null },
        ],
      },
    ]);

    expect(marcadores).toHaveLength(2);
    const [flete, punto] = marcadores;
    expect(flete).toMatchObject({ tipo: "flete", recorridoId: "50", fleteNombre: "Camión 7", reciente: true });
    expect(punto).toMatchObject({ tipo: "punto", id: "p1", recorridoId: "50", cliente: "Almacén Centro" });
    expect(flete.color).toBe(punto.color);
  });

  it("un recorrido sin ultimaUbicacion no genera marcador de flete, pero sí sus puntos (FR-007/004)", () => {
    const marcadores = construirMarcadoresMapaUnificado([
      {
        id: "51",
        flete: { id: "8", nombre: "Camión 8" },
        ultimaUbicacion: { lat: null, lon: null, en: null, reciente: false },
        puntos: [{ id: "p3", orden: 1, lat: -34.6, lon: -58.4, estado: "pendiente", cliente: null }],
      },
    ]);

    expect(marcadores).toHaveLength(1);
    expect(marcadores[0]).toMatchObject({ tipo: "punto", id: "p3" });
  });

  it("dos recorridos de fletes distintos reciben colores distintos en todos sus marcadores", () => {
    const marcadores = construirMarcadoresMapaUnificado([
      {
        id: "50",
        flete: { id: "7", nombre: "Camión 7" },
        ultimaUbicacion: { lat: -34.6, lon: -58.4, en: "2026-08-20T10:00:00Z", reciente: true },
        puntos: [],
      },
      {
        id: "51",
        flete: { id: "8", nombre: "Camión 8" },
        ultimaUbicacion: { lat: -34.65, lon: -58.45, en: "2026-08-20T10:00:00Z", reciente: true },
        puntos: [],
      },
    ]);

    expect(marcadores[0].color).not.toBe(marcadores[1].color);
  });

  describe("punto de salida (010-mapa-central-unificado, US4)", () => {
    const puntoSalidaDefault = { lat: -34.8097527, lon: -58.4574414 };

    it("agrega un único marcador salidaDefault, sin color, aunque varios recorridos activos lo compartan", () => {
      const recorridos = [
        { id: "50", flete: { id: "7" }, ultimaUbicacion: { lat: null, lon: null }, puntos: [] },
        { id: "51", flete: { id: "8" }, ultimaUbicacion: { lat: null, lon: null }, puntos: [] },
      ];
      const marcadores = construirMarcadoresMapaUnificado(recorridos, puntoSalidaDefault);

      const salidas = marcadores.filter((m) => m.tipo === "salidaDefault");
      expect(salidas).toHaveLength(1);
      expect(salidas[0]).toMatchObject({ lat: -34.8097527, lon: -58.4574414, color: null });
    });

    it("agrega el marcador salidaDefault incluso sin ningún recorrido activo", () => {
      const marcadores = construirMarcadoresMapaUnificado([], puntoSalidaDefault);
      expect(marcadores).toEqual([{ tipo: "salidaDefault", lat: -34.8097527, lon: -58.4574414, color: null }]);
    });

    it("un recorrido con puntoSalida propio agrega un marcador salidaRecorrido con el color de su flete", () => {
      const recorridos = [
        {
          id: "50",
          flete: { id: "7" },
          ultimaUbicacion: { lat: null, lon: null },
          puntoSalida: { lat: -34.55, lon: -58.35 },
          puntos: [],
        },
      ];
      const marcadores = construirMarcadoresMapaUnificado(recorridos, puntoSalidaDefault);

      const propio = marcadores.find((m) => m.tipo === "salidaRecorrido");
      expect(propio).toMatchObject({ recorridoId: "50", lat: -34.55, lon: -58.35 });
      expect(propio.color).toBeTruthy();
      // El default sigue apareciendo además del propio.
      expect(marcadores.some((m) => m.tipo === "salidaDefault")).toBe(true);
    });
  });
});

describe("distanciaMetros (009-central-mejora-visual)", () => {
  it("da 0 para el mismo punto", () => {
    expect(distanciaMetros(-34.6, -58.4, -34.6, -58.4)).toBeCloseTo(0, 3);
  });

  it("calcula ~11 m para una diferencia de 0.0001° (radio de proximidad, dentro de 500 m)", () => {
    const d = distanciaMetros(-34.6, -58.4, -34.6001, -58.4001);
    expect(d).toBeGreaterThan(5);
    expect(d).toBeLessThan(20);
  });

  it("calcula ~1.1 km para una diferencia de 0.01° de latitud (fuera de 500 m)", () => {
    const d = distanciaMetros(-34.6, -58.4, -34.61, -58.4);
    expect(d).toBeGreaterThan(1000);
    expect(d).toBeLessThan(1200);
  });
});
