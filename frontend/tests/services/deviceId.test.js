import { afterEach, describe, expect, it, vi } from "vitest";
import { obtenerDeviceId } from "../../src/services/deviceId.js";

const STORAGE_KEY = "vickytruck.chofer.deviceId.v1";

describe("deviceId — obtenerDeviceId (004-chofer-cloud-broker, FR-005a)", () => {
  afterEach(() => {
    window.localStorage.clear();
    vi.restoreAllMocks();
  });

  it("genera un id la primera vez y lo persiste en localStorage", () => {
    expect(window.localStorage.getItem(STORAGE_KEY)).toBeNull();

    const id = obtenerDeviceId();

    expect(id).toBeTruthy();
    expect(window.localStorage.getItem(STORAGE_KEY)).toBe(id);
  });

  it("devuelve el mismo id en llamadas subsiguientes (mismo dispositivo)", () => {
    const primero = obtenerDeviceId();
    const segundo = obtenerDeviceId();
    expect(segundo).toBe(primero);
  });

  it("reutiliza el id ya guardado en localStorage aunque sea la primera llamada del módulo", () => {
    window.localStorage.setItem(STORAGE_KEY, "id-preexistente");
    expect(obtenerDeviceId()).toBe("id-preexistente");
  });

  it("si localStorage no está disponible, no lanza y sigue devolviendo un id", () => {
    const getItemSpy = vi.spyOn(window.localStorage.__proto__, "getItem").mockImplementation(() => {
      throw new Error("localStorage deshabilitado");
    });

    expect(() => obtenerDeviceId()).not.toThrow();
    expect(obtenerDeviceId()).toBeTruthy();

    getItemSpy.mockRestore();
  });
});
