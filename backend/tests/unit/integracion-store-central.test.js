import { test } from "node:test";
import assert from "node:assert/strict";
import { createIntegracionStore } from "../../src/state/integracionStore.js";

function seedActivo(store, overrides = {}) {
  store.upsertRecorridos([
    {
      id: "R-1",
      fleteId: "F-1",
      fleteNombre: "Juan Pérez",
      estado: "activo",
      puntos: [
        { id: "p1", orden: 1, estado: "pendiente" },
        { id: "p2", orden: 2, estado: "pendiente" },
      ],
      ...overrides,
    },
  ]);
}

test("listarActivos — solo incluye recorridos activos con flete asignado", async () => {
  const store = createIntegracionStore();
  seedActivo(store);
  store.upsertRecorridos([{ id: "R-2", estado: "activo", fleteId: null, puntos: [] }]);
  store.upsertRecorridos([{ id: "R-3", estado: "finalizado", fleteId: "F-3", puntos: [] }]);

  const activos = await store.listarActivos();
  assert.equal(activos.length, 1);
  assert.equal(activos[0].id, "R-1");
});

test("listarActivos — expone flete.nombre desde fleteNombre y progreso calculado", async () => {
  const store = createIntegracionStore();
  seedActivo(store);

  const [r] = await store.listarActivos();
  assert.deepEqual(r.flete, { id: "F-1", nombre: "Juan Pérez" });
  assert.deepEqual(r.progreso, { pendientes: 2, arribados: 0, completados: 0 });
});

test("listarActivos — ultimaUbicacion refleja lo que reportó el bridge MQTT y respeta el umbral de 'reciente'", async () => {
  const prev = process.env.UBICACION_STALE_MS;
  process.env.UBICACION_STALE_MS = String(5 * 60 * 1000);
  try {
    const store = createIntegracionStore();
    seedActivo(store);

    const sinUbicacion = (await store.listarActivos())[0];
    assert.equal(sinUbicacion.ultimaUbicacion.reciente, false);
    assert.equal(sinUbicacion.ultimaUbicacion.lat, null);

    store.actualizarUbicacionPorFlete("F-1", { lat: -34.6, lon: -58.4, en: new Date().toISOString() });
    const conUbicacion = (await store.listarActivos())[0];
    assert.equal(conUbicacion.ultimaUbicacion.reciente, true);
    assert.equal(conUbicacion.ultimaUbicacion.lat, -34.6);

    const haceDiezMinutos = new Date(Date.now() - 10 * 60 * 1000).toISOString();
    store.actualizarUbicacionPorFlete("F-1", { lat: -34.6, lon: -58.4, en: haceDiezMinutos });
    const vieja = (await store.listarActivos())[0];
    assert.equal(vieja.ultimaUbicacion.reciente, false);
  } finally {
    process.env.UBICACION_STALE_MS = prev;
  }
});

test("obtenerDetalle — recorrido inexistente devuelve null", async () => {
  const store = createIntegracionStore();
  assert.equal(await store.obtenerDetalle("no-existe"), null);
});

test("obtenerDetalle — devuelve puntos ordenados con estado/arriboEn/descargaEn", async () => {
  const store = createIntegracionStore();
  seedActivo(store);

  const detalle = await store.obtenerDetalle("R-1");
  assert.equal(detalle.recorrido.id, "R-1");
  assert.equal(detalle.recorrido.fleteId, "F-1");
  assert.deepEqual(
    detalle.puntos.map((p) => p.id),
    ["p1", "p2"],
  );
});

test("listarHistorial — solo incluye recorridos finalizados", async () => {
  const store = createIntegracionStore();
  seedActivo(store);
  store.upsertRecorridos([
    {
      id: "R-9",
      fleteId: "F-9",
      estado: "finalizado",
      puntos: [{ id: "p1", orden: 1, estado: "completado", descargaEn: "2026-08-05T10:00:00Z" }],
    },
  ]);

  const historial = await store.listarHistorial();
  assert.equal(historial.length, 1);
  assert.equal(historial[0].recorrido.id, "R-9");
  assert.equal(historial[0].puntos[0].descargaEn, "2026-08-05T10:00:00Z");
});
