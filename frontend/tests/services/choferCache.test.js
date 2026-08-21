import { beforeEach, describe, expect, it, vi } from "vitest";
import { guardarCacheChofer, leerCacheChofer } from "../../src/services/choferCache.js";

describe("choferCache", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("guarda y relee el choferId/mqtt tal cual se pasaron", () => {
    const mqtt = { url: "wss://broker-test", username: "chofer-CH-1", password: "x", topic: "chofer/CH-1/ubicacion" };
    guardarCacheChofer({ choferId: "CH-1", mqtt });

    expect(leerCacheChofer()).toEqual({ choferId: "CH-1", mqtt });
  });

  it("devuelve null si nunca se guardó nada", () => {
    expect(leerCacheChofer()).toBeNull();
  });

  it("un guardado nuevo sobrescribe al chofer anterior (dispositivo 1:1 con el último chofer)", () => {
    guardarCacheChofer({ choferId: "CH-1", mqtt: { url: "a" } });
    guardarCacheChofer({ choferId: "CH-2", mqtt: { url: "b" } });

    expect(leerCacheChofer()).toEqual({ choferId: "CH-2", mqtt: { url: "b" } });
  });

  it("no lanza si localStorage.getItem tira (ej. modo privado) — leerCacheChofer devuelve null", () => {
    const spy = vi.spyOn(window.localStorage, "getItem").mockImplementation(() => {
      throw new Error("no disponible");
    });

    expect(() => leerCacheChofer()).not.toThrow();
    expect(leerCacheChofer()).toBeNull();

    spy.mockRestore();
  });

  it("no lanza si localStorage.setItem tira (ej. cuota excedida) — guardarCacheChofer no rompe el flujo normal", () => {
    const spy = vi.spyOn(window.localStorage, "setItem").mockImplementation(() => {
      throw new Error("cuota excedida");
    });

    expect(() => guardarCacheChofer({ choferId: "CH-1", mqtt: { url: "a" } })).not.toThrow();

    spy.mockRestore();
  });
});
