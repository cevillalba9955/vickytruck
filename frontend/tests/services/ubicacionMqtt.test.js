import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const publish = vi.fn();
vi.mock("mqtt", () => ({ default: { connect: vi.fn(() => ({ publish, end: vi.fn() })) } }));

import { createPublisherUbicacionMqtt } from "../../src/services/ubicacionMqtt.js";

describe("createPublisherUbicacionMqtt — publish sin confirmación", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    publish.mockReset();
  });
  afterEach(() => vi.useRealTimers());

  const config = { url: "wss://broker", username: "u", password: "p" };

  it("resuelve false tras el timeout si el broker nunca confirma, para que el caller caiga al POST", async () => {
    publish.mockImplementation(() => {}); // nunca invoca el callback (conexión sin establecer)
    const publisher = createPublisherUbicacionMqtt("4", config);
    const resultado = publisher.publicar({ lat: 1, lon: 2 });
    await vi.advanceTimersByTimeAsync(4000);
    expect(await resultado).toBe(false);
  });

  it("resuelve true cuando el broker confirma", async () => {
    publish.mockImplementation((_t, _p, _o, cb) => cb(null));
    const publisher = createPublisherUbicacionMqtt("4", config);
    expect(await publisher.publicar({ lat: 1, lon: 2 })).toBe(true);
  });
});
