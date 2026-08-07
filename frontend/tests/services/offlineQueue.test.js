import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { encolar, listar, quitar } from "../../src/services/offlineQueue.js";

const STORAGE_KEY = "vickytruck.chofer.colaOffline.v1";

beforeEach(() => {
  window.localStorage.removeItem(STORAGE_KEY);
});
afterEach(() => {
  window.localStorage.removeItem(STORAGE_KEY);
});

describe("offlineQueue — descartar una acción encolada (005-chofer-estados-viaje, FR-020a)", () => {
  it("quitar(id) descarta el ítem sin afectar a los demás", () => {
    const id1 = encolar({ tipo: "viaje-iniciar", token: "tok-1" });
    const id2 = encolar({ tipo: "viaje-llegue", token: "tok-1" });

    expect(listar()).toHaveLength(2);

    quitar(id1);

    const restantes = listar();
    expect(restantes).toHaveLength(1);
    expect(restantes[0].id).toBe(id2);
  });

  it("CANCELAR sobre la única acción encolada la vacía por completo, sin ningún envío de red", () => {
    const id = encolar({ tipo: "viaje-ir-primero", token: "tok-1", puntoId: "p3" });
    expect(listar()).toHaveLength(1);

    quitar(id);

    expect(listar()).toHaveLength(0);
  });
});
