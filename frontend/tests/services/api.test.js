import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../src/services/geolocation.js", () => ({
  obtenerUbicacionBestEffort: vi.fn().mockResolvedValue(null),
}));

vi.mock("../../src/services/mqttClient.js", () => ({
  publicar: vi.fn(),
}));

import { publicar } from "../../src/services/mqttClient.js";
import { marcarArribo, iniciarSincronizacionOffline } from "../../src/services/api.js";
import { listar } from "../../src/services/offlineQueue.js";

const EVENTOS_TOPIC = "vickytruck/fletes/tok-1/eventos";

describe("api — marcarArribo/marcarDescarga vía MQTT (003-mqtt-broker-fletes)", () => {
  beforeEach(() => {
    window.localStorage.clear();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("publica el evento con QoS 1 en el tópico del token (FR-002)", async () => {
    publicar.mockResolvedValue(undefined);

    const resultado = await marcarArribo("tok-1", "p1");

    expect(publicar).toHaveBeenCalledWith(EVENTOS_TOPIC, expect.objectContaining({ tipo: "arribo", puntoId: "p1" }), {
      qos: 1,
    });
    expect(resultado.queued).toBe(false);
  });

  it("encola la acción si la publicación falla (sin conexión, FR-010)", async () => {
    publicar.mockRejectedValue(new Error("mqtt_no_conectado"));

    const resultado = await marcarArribo("tok-1", "p1");

    expect(resultado.queued).toBe(true);
    expect(listar()).toHaveLength(1);
    expect(listar()[0]).toMatchObject({ tipo: "arribo", token: "tok-1", puntoId: "p1" });
  });

  it("iniciarSincronizacionOffline reintenta lo encolado publicando por MQTT al reconectar", async () => {
    publicar.mockRejectedValueOnce(new Error("mqtt_no_conectado"));
    await marcarArribo("tok-1", "p1");
    expect(listar()).toHaveLength(1);

    publicar.mockResolvedValue(undefined);
    const detener = iniciarSincronizacionOffline();
    window.dispatchEvent(new Event("online"));
    await Promise.resolve();
    await Promise.resolve();

    expect(listar()).toHaveLength(0);
    detener();
  });
});
