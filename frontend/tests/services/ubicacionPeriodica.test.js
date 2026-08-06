import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../src/services/geolocation.js", () => ({
  obtenerUbicacionBestEffort: vi.fn(),
}));

import { obtenerUbicacionBestEffort } from "../../src/services/geolocation.js";
import { iniciarReportePeriodico } from "../../src/services/ubicacionPeriodica.js";

describe("ubicacionPeriodica", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    global.fetch = vi.fn().mockResolvedValue({ ok: true });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("reporta la ubicación al intervalo indicado (FR-014)", async () => {
    obtenerUbicacionBestEffort.mockResolvedValue({ lat: -34.6, lon: -58.4 });

    iniciarReportePeriodico("tok-1", "flete-1", null, 1000);
    await vi.advanceTimersByTimeAsync(1000);

    expect(global.fetch).toHaveBeenCalledWith(
      "/api/recorridos/tok-1/ubicacion",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ lat: -34.6, lon: -58.4 }),
      }),
    );
  });

  it("no llama a la API si no hay ubicación disponible (best-effort)", async () => {
    obtenerUbicacionBestEffort.mockResolvedValue(null);

    iniciarReportePeriodico("tok-1", "flete-1", null, 1000);
    await vi.advanceTimersByTimeAsync(1000);

    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("la función de limpieza detiene el temporizador", async () => {
    obtenerUbicacionBestEffort.mockResolvedValue({ lat: -34.6, lon: -58.4 });

    const detener = iniciarReportePeriodico("tok-1", "flete-1", 1000);
    detener();
    await vi.advanceTimersByTimeAsync(5000);

    expect(global.fetch).not.toHaveBeenCalled();
  });
});
