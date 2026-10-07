import { beforeEach, describe, expect, it, vi } from "vitest";
import { guardarCacheChofer, leerCacheChofer, resolverMqttConfig } from "../../src/services/choferCache.js";

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

describe("resolverMqttConfig", () => {
  const cache = { choferId: "CH-1", mqtt: { url: "wss://viejo" } };

  it("con el backend respondiendo mqtt: null (canal directo), no resucita la credencial cacheada", () => {
    expect(resolverMqttConfig({ recorrido: { mqtt: null } }, cache)).toBeNull();
  });

  it("con el backend respondiendo una credencial, usa esa y no la cacheada", () => {
    const mqtt = { url: "wss://nuevo" };
    expect(resolverMqttConfig({ recorrido: { mqtt } }, cache)).toBe(mqtt);
  });

  it("sin recorrido cargado (404 o sin red), cae a la credencial cacheada", () => {
    expect(resolverMqttConfig(null, cache)).toBe(cache.mqtt);
  });

  it("sin recorrido ni caché, null", () => {
    expect(resolverMqttConfig(null, null)).toBeNull();
  });
});
