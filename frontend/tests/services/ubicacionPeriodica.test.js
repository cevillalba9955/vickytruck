import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../src/services/geolocation.js", () => ({
  obtenerUbicacionBestEffort: vi.fn(),
}));

// Por defecto delega a la implementación real (mqttConfig null → publisher
// no-op cuyo publicar() resuelve `false`, igual que antes de este mock) —
// solo el test de fallback de abajo pisa el mock para simular un publish
// MQTT exitoso, sin conectar un cliente MQTT real en jsdom.
vi.mock("../../src/services/ubicacionMqtt.js", async (importOriginal) => {
  const real = await importOriginal();
  return { ...real, createPublisherUbicacionMqtt: vi.fn(real.createPublisherUbicacionMqtt) };
});

import { obtenerUbicacionBestEffort } from "../../src/services/geolocation.js";
import { createPublisherUbicacionMqtt } from "../../src/services/ubicacionMqtt.js";
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

    iniciar("tok-1", "chofer-1", null, 1000);
    await vi.advanceTimersByTimeAsync(1000);

    expect(global.fetch).toHaveBeenCalledWith(
      "/api/recorridos/tok-1/ubicacion",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ lat: -34.6, lon: -58.4 }),
      }),
    );
  });

  it("dispara un reporte inmediato al arrancar, sin esperar el primer tick del intervalo (012-ubicacion-por-chofer, FR-002)", async () => {
    obtenerUbicacionBestEffort.mockResolvedValue({ lat: -34.6, lon: -58.4 });

    iniciar("tok-1", "chofer-1", null, 60000);
    // Avanza 0ms: no hay tick de intervalo posible todavía, solo se resuelve
    // la promesa del disparo inmediato si existe.
    await vi.advanceTimersByTimeAsync(0);

    expect(global.fetch).toHaveBeenCalledWith(
      "/api/recorridos/tok-1/ubicacion",
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("no llama a la API si no hay ubicación disponible (best-effort)", async () => {
    obtenerUbicacionBestEffort.mockResolvedValue(null);

    iniciar("tok-1", "chofer-1", null, 1000);
    await vi.advanceTimersByTimeAsync(1000);

    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("la función de limpieza detiene el temporizador", async () => {
    obtenerUbicacionBestEffort.mockResolvedValue({ lat: -34.6, lon: -58.4 });

    const detener = iniciar("tok-1", "chofer-1", null, 1000);
    // Deja resolver el disparo inmediato al montar (012-ubicacion-por-chofer)
    // ANTES de detener — si no, esa llamada en vuelo competiría con el
    // detener() de abajo y el resultado dependería del timing.
    await vi.advanceTimersByTimeAsync(0);
    global.fetch.mockClear();

    detener();
    await vi.advanceTimersByTimeAsync(5000);

    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("dispara un reporte inmediato al volver a estar visible (iOS pausa timers en background, FR-014)", async () => {
    obtenerUbicacionBestEffort.mockResolvedValue({ lat: -34.6, lon: -58.4 });

    iniciar("tok-1", "chofer-1", null, 60000);
    document.dispatchEvent(new Event("visibilitychange"));
    await vi.advanceTimersByTimeAsync(0);

    expect(global.fetch).toHaveBeenCalledWith(
      "/api/recorridos/tok-1/ubicacion",
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("la función de limpieza deja de escuchar visibilitychange", async () => {
    obtenerUbicacionBestEffort.mockResolvedValue({ lat: -34.6, lon: -58.4 });

    const detener = iniciar("tok-1", "chofer-1", null, 60000);
    // Ídem test anterior: deja resolver el disparo inmediato al montar antes
    // de detener y de disparar visibilitychange.
    await vi.advanceTimersByTimeAsync(0);
    global.fetch.mockClear();

    detener();
    document.dispatchEvent(new Event("visibilitychange"));
    await vi.advanceTimersByTimeAsync(0);

    expect(global.fetch).not.toHaveBeenCalled();
  });

  // 2026-08-10 (spec.md FR-004 actualizado, tasks.md T063): MQTT pasa a ser
  // el canal primario — REST solo se invoca si la publicación MQTT del
  // ciclo falla, no en paralelo en cada ciclo.
  it("NO llama al fallback REST si la publicación MQTT del ciclo tuvo éxito", async () => {
    obtenerUbicacionBestEffort.mockResolvedValue({ lat: -34.6, lon: -58.4 });
    const publicar = vi.fn().mockResolvedValue(true);
    createPublisherUbicacionMqtt.mockReturnValueOnce({ publicar, cerrar: vi.fn() });

    iniciar("tok-1", "chofer-1", { url: "wss://broker-test", username: "u", password: "p" }, 1000);
    await vi.advanceTimersByTimeAsync(1000);

    expect(publicar).toHaveBeenCalledWith({ lat: -34.6, lon: -58.4, recorridoId: "tok-1" });
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("SÍ llama al fallback REST si la publicación MQTT del ciclo falla", async () => {
    obtenerUbicacionBestEffort.mockResolvedValue({ lat: -34.6, lon: -58.4 });
    const publicar = vi.fn().mockResolvedValue(false);
    createPublisherUbicacionMqtt.mockReturnValueOnce({ publicar, cerrar: vi.fn() });

    iniciar("tok-1", "chofer-1", { url: "wss://broker-test", username: "u", password: "p" }, 1000);
    await vi.advanceTimersByTimeAsync(1000);

    expect(publicar).toHaveBeenCalled();
    expect(global.fetch).toHaveBeenCalledWith(
      "/api/recorridos/tok-1/ubicacion",
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("SÍ llama al fallback REST si la publicación MQTT del ciclo rechaza (excepción)", async () => {
    obtenerUbicacionBestEffort.mockResolvedValue({ lat: -34.6, lon: -58.4 });
    const publicar = vi.fn().mockRejectedValue(new Error("mqtt caído"));
    createPublisherUbicacionMqtt.mockReturnValueOnce({ publicar, cerrar: vi.fn() });

    iniciar("tok-1", "chofer-1", { url: "wss://broker-test", username: "u", password: "p" }, 1000);
    await vi.advanceTimersByTimeAsync(1000);

    expect(global.fetch).toHaveBeenCalledWith(
      "/api/recorridos/tok-1/ubicacion",
      expect.objectContaining({ method: "POST" }),
    );
  });
});
