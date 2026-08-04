import { test } from "node:test";
import assert from "node:assert/strict";
import { createUbicacionEnMemoria } from "../../src/state/ubicacionEnMemoria.js";

test("ubicacionEnMemoria — registra y obtiene una posición por recorridoId", () => {
  const store = createUbicacionEnMemoria();
  store.registrar("50", { lat: -34.6, lon: -58.4, en: "2026-08-03T14:00:00Z" });

  assert.deepEqual(store.obtener("50"), { lat: -34.6, lon: -58.4, en: "2026-08-03T14:00:00Z" });
});

test("ubicacionEnMemoria — devuelve null si nunca se registró una posición para ese recorrido", () => {
  const store = createUbicacionEnMemoria();
  assert.equal(store.obtener("999"), null);
});

test("ubicacionEnMemoria — un registro nuevo sobrescribe al anterior del mismo recorrido", () => {
  const store = createUbicacionEnMemoria();
  store.registrar("50", { lat: -34.6, lon: -58.4, en: "2026-08-03T14:00:00Z" });
  store.registrar("50", { lat: -34.61, lon: -58.41, en: "2026-08-03T14:00:30Z" });

  assert.deepEqual(store.obtener("50"), { lat: -34.61, lon: -58.41, en: "2026-08-03T14:00:30Z" });
});

test("ubicacionEnMemoria — normaliza recorridoId numérico y string como la misma clave", () => {
  const store = createUbicacionEnMemoria();
  store.registrar(50, { lat: -34.6, lon: -58.4, en: "2026-08-03T14:00:00Z" });

  assert.deepEqual(store.obtener("50"), { lat: -34.6, lon: -58.4, en: "2026-08-03T14:00:00Z" });
});
