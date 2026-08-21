import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, waitFor } from "@testing-library/react";

// El reporte de ubicación no es el foco de este test (ya cubierto por
// ubicacionPeriodica.test.js) — acá solo interesa CON QUÉ argumentos
// main.jsx lo arranca, así que se reemplaza por un espía que no conecta
// nada real.
vi.mock("../src/services/ubicacionPeriodica.js", () => ({
  iniciarReportePeriodico: vi.fn(() => () => {}),
}));

// `obtenerRecorrido` se controla por test (éxito / 404); el resto de
// api.js se deja real (ApiError real para que `instanceof` funcione en
// main.jsx, iniciarSincronizacionOffline real y sin efectos porque la cola
// offline está vacía).
vi.mock("../src/services/api.js", async (importOriginal) => {
  const real = await importOriginal();
  return { ...real, obtenerRecorrido: vi.fn() };
});

import { obtenerRecorrido, ApiError } from "../src/services/api.js";
import { iniciarReportePeriodico } from "../src/services/ubicacionPeriodica.js";
import { guardarCacheChofer } from "../src/services/choferCache.js";
import { App } from "../src/main.jsx";

function irA(token) {
  window.history.pushState({}, "", `?token=${token}`);
}

describe("main.jsx — resiliencia del reporte de ubicación ante un backend sin el recorrido (012-ubicacion-por-chofer, US2)", () => {
  beforeEach(() => {
    window.localStorage.clear();
    iniciarReportePeriodico.mockClear();
  });

  afterEach(() => {
    cleanup();
  });

  it("arranca el reporte de ubicación con choferId/mqtt de la respuesta cuando GET /:token resuelve con éxito", async () => {
    irA("tok-1");
    obtenerRecorrido.mockResolvedValue({
      recorrido: {
        estado: "activo",
        fleteId: "13",
        choferId: "CH-1",
        intervaloUbicacionMs: 60000,
        mqtt: { url: "wss://broker-test", username: "chofer-CH-1", password: "x", topic: "chofer/CH-1/ubicacion" },
        viajeEstado: "detenido",
        puntoActivoId: null,
        puedeCancelar: false,
      },
      progreso: { pendientes: 0, arribados: 0, completados: 0 },
      puntos: [],
    });

    render(<App />);

    await waitFor(() => expect(iniciarReportePeriodico).toHaveBeenCalled());
    expect(iniciarReportePeriodico).toHaveBeenCalledWith(
      "tok-1",
      "CH-1",
      expect.objectContaining({ url: "wss://broker-test" }),
      60000,
    );
  });

  it("sigue arrancando el reporte de ubicación con la identidad cacheada aunque GET /:token devuelva enlace_invalido (backend sin el recorrido)", async () => {
    // Carga previa exitosa en este mismo dispositivo (pobló la caché).
    guardarCacheChofer({
      choferId: "CH-1",
      mqtt: { url: "wss://broker-test", username: "chofer-CH-1", password: "x", topic: "chofer/CH-1/ubicacion" },
    });

    irA("tok-1");
    // El backend ya no reconoce el token (store en memoria vaciado, ver
    // Constitución v5.0.0 Principio VII / research.md Decisión 3).
    obtenerRecorrido.mockRejectedValue(new ApiError("enlace_invalido", 404));

    render(<App />);

    await waitFor(() => expect(iniciarReportePeriodico).toHaveBeenCalled());
    expect(iniciarReportePeriodico).toHaveBeenCalledWith(
      "tok-1",
      "CH-1",
      expect.objectContaining({ url: "wss://broker-test" }),
      expect.any(Number),
    );
  });

  it("arranca el reporte de ubicación aunque mqtt sea null (EMQX no configurado) — cae al fallback REST, no debe dejar de arrancar", async () => {
    irA("tok-1");
    obtenerRecorrido.mockResolvedValue({
      recorrido: {
        estado: "activo",
        fleteId: "13",
        choferId: "CH-1",
        intervaloUbicacionMs: 60000,
        mqtt: null,
        viajeEstado: "detenido",
        puntoActivoId: null,
        puedeCancelar: false,
      },
      progreso: { pendientes: 0, arribados: 0, completados: 0 },
      puntos: [],
    });

    render(<App />);

    await waitFor(() => expect(iniciarReportePeriodico).toHaveBeenCalled());
    expect(iniciarReportePeriodico).toHaveBeenCalledWith("tok-1", "CH-1", null, 60000);
  });

  it("no arranca el reporte de ubicación si el 404 ocurre sin ninguna identidad de chofer cacheada previamente (nada que inventar)", async () => {
    irA("tok-nuevo");
    obtenerRecorrido.mockRejectedValue(new ApiError("enlace_invalido", 404));

    render(<App />);

    await waitFor(() => expect(obtenerRecorrido).toHaveBeenCalled());
    expect(iniciarReportePeriodico).not.toHaveBeenCalled();
  });
});
