import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { encolar, listar, quitar, reintentarCola } from "../../src/services/offlineQueue.js";

describe("offlineQueue", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("encola una acción y la lista en orden", () => {
    encolar({ tipo: "arribo", token: "tok-1", puntoId: "p1" });
    encolar({ tipo: "descarga", token: "tok-1", puntoId: "p2" });

    const cola = listar();
    expect(cola).toHaveLength(2);
    expect(cola[0]).toMatchObject({ tipo: "arribo", puntoId: "p1" });
    expect(cola[1]).toMatchObject({ tipo: "descarga", puntoId: "p2" });
  });

  it("quitar elimina solo el item indicado", () => {
    const id1 = encolar({ tipo: "arribo", token: "tok-1", puntoId: "p1" });
    encolar({ tipo: "descarga", token: "tok-1", puntoId: "p2" });

    quitar(id1);

    expect(listar()).toHaveLength(1);
    expect(listar()[0]).toMatchObject({ puntoId: "p2" });
  });

  it("reintentarCola ejecuta cada item en orden y lo quita si tiene éxito (FR-010)", async () => {
    encolar({ tipo: "arribo", token: "tok-1", puntoId: "p1" });
    encolar({ tipo: "descarga", token: "tok-1", puntoId: "p2" });
    const ejecutarAccion = vi.fn().mockResolvedValue(undefined);

    await reintentarCola(ejecutarAccion);

    expect(ejecutarAccion).toHaveBeenCalledTimes(2);
    expect(listar()).toHaveLength(0);
  });

  it("reintentarCola se detiene en el primer fallo, sin perder ni duplicar (FR-010)", async () => {
    encolar({ tipo: "arribo", token: "tok-1", puntoId: "p1" });
    encolar({ tipo: "descarga", token: "tok-1", puntoId: "p2" });
    const ejecutarAccion = vi.fn().mockRejectedValueOnce(new Error("sin_conexion")).mockResolvedValue(undefined);

    await reintentarCola(ejecutarAccion);

    // El primer item falló y se conserva; el segundo nunca se intentó (se
    // mantiene el orden, no se reordena ni se pierde ninguno).
    expect(ejecutarAccion).toHaveBeenCalledTimes(1);
    expect(listar()).toHaveLength(2);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });
});
