import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../src/services/geolocation.js", () => ({
  obtenerUbicacionBestEffort: vi.fn(),
}));

vi.mock("../../src/services/mqttClient.js", () => ({
  publicar: vi.fn().mockResolvedValue(undefined),
}));

import { obtenerUbicacionBestEffort } from "../../src/services/geolocation.js";
import { publicar } from "../../src/services/mqttClient.js";
import { iniciarReportePeriodico } from "../../src/services/ubicacionPeriodica.js";

const UBICACION_TOPIC = "vickytruck/fletes/tok-1/ubicacion";

describe("ubicacionPeriodica", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("publica la ubicación (retained) al intervalo indicado (FR-001, FR-014)", async () => {
    obtenerUbicacionBestEffort.mockResolvedValue({ lat: -34.6, lon: -58.4 });

    iniciarReportePeriodico(UBICACION_TOPIC, 1000);
    await vi.advanceTimersByTimeAsync(1000);

    expect(publicar).toHaveBeenCalledWith(
      UBICACION_TOPIC,
      expect.objectContaining({ lat: -34.6, lon: -58.4 }),
      { qos: 0, retain: true },
    );
  });

  it("no publica si no hay ubicación disponible (best-effort)", async () => {
    obtenerUbicacionBestEffort.mockResolvedValue(null);

    iniciarReportePeriodico(UBICACION_TOPIC, 1000);
    await vi.advanceTimersByTimeAsync(1000);

    expect(publicar).not.toHaveBeenCalled();
  });

  it("la función de limpieza detiene el temporizador", async () => {
    obtenerUbicacionBestEffort.mockResolvedValue({ lat: -34.6, lon: -58.4 });

    const detener = iniciarReportePeriodico(UBICACION_TOPIC, 1000);
    detener();
    await vi.advanceTimersByTimeAsync(5000);

    expect(publicar).not.toHaveBeenCalled();
  });
});
