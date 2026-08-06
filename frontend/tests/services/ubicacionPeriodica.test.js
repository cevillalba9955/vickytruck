import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../src/services/geolocation.js", () => ({
  obtenerUbicacionBestEffort: vi.fn(),
}));

import { obtenerUbicacionBestEffort } from "../../src/services/geolocation.js";
import { iniciarReportePeriodico } from "../../src/services/ubicacionPeriodica.js";

describe("ubicacionPeriodica", () => {
  let limpiadores;

  beforeEach(() => {
    vi.useFakeTimers();
    global.fetch = vi.fn().mockResolvedValue({ ok: true });
    limpiadores = [];
  });

  afterEach(() => {
    // Cada test deja su listener de visibilitychange registrado en el mismo
    // `document` (jsdom persiste entre tests del archivo) si no se limpia acá
    // — sin esto, tests posteriores disparan fetch de tests anteriores.
    limpiadores.forEach((detener) => detener());
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  function iniciar(...args) {
    const detener = iniciarReportePeriodico(...args);
    limpiadores.push(detener);
    return detener;
  }

  it("reporta la ubicación al intervalo indicado (FR-014)", async () => {
    obtenerUbicacionBestEffort.mockResolvedValue({ lat: -34.6, lon: -58.4 });

    iniciar("tok-1", "flete-1", null, 1000);
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

    iniciar("tok-1", "flete-1", null, 1000);
    await vi.advanceTimersByTimeAsync(1000);

    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("la función de limpieza detiene el temporizador", async () => {
    obtenerUbicacionBestEffort.mockResolvedValue({ lat: -34.6, lon: -58.4 });

    const detener = iniciar("tok-1", "flete-1", null, 1000);
    detener();
    await vi.advanceTimersByTimeAsync(5000);

    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("dispara un reporte inmediato al volver a estar visible (iOS pausa timers en background, FR-014)", async () => {
    obtenerUbicacionBestEffort.mockResolvedValue({ lat: -34.6, lon: -58.4 });

    iniciar("tok-1", "flete-1", null, 60000);
    document.dispatchEvent(new Event("visibilitychange"));
    await vi.advanceTimersByTimeAsync(0);

    expect(global.fetch).toHaveBeenCalledWith(
      "/api/recorridos/tok-1/ubicacion",
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("la función de limpieza deja de escuchar visibilitychange", async () => {
    obtenerUbicacionBestEffort.mockResolvedValue({ lat: -34.6, lon: -58.4 });

    const detener = iniciar("tok-1", "flete-1", null, 60000);
    detener();
    document.dispatchEvent(new Event("visibilitychange"));
    await vi.advanceTimersByTimeAsync(0);

    expect(global.fetch).not.toHaveBeenCalled();
  });
});
