import { test } from "node:test";
import assert from "node:assert/strict";
import { createIntegracionStore } from "../../src/state/integracionStore.js";

function seedRecorrido(store, overrides = {}) {
  store.upsertRecorridos([
    {
      id: "R-1",
      token: "tok-1",
      fleteId: "F-1",
      estado: "activo",
      puntos: [
        { id: "p1", orden: 1, estado: "pendiente", lat: -34.6, lon: -58.4 },
        { id: "p2", orden: 2, estado: "pendiente", lat: -34.7, lon: -58.5 },
      ],
      ...overrides,
    },
  ]);
}

test("obtenerPorToken — token inexistente devuelve null", async () => {
  const store = createIntegracionStore();
  assert.equal(await store.obtenerPorToken("no-existe"), null);
});

test("obtenerPorToken — devuelve puntos ordenados por orden, con latitud/longitud y progreso", async () => {
  const store = createIntegracionStore();
  seedRecorrido(store);

  const recorrido = await store.obtenerPorToken("tok-1");
  assert.equal(recorrido.id, "R-1");
  assert.equal(recorrido.estado, "activo");
  assert.deepEqual(
    recorrido.puntos.map((p) => p.id),
    ["p1", "p2"],
  );
  assert.equal(recorrido.puntos[0].latitud, -34.6);
  assert.equal(recorrido.puntos[0].longitud, -58.4);
  assert.deepEqual(recorrido.progreso, { pendientes: 2, arribados: 0, completados: 0 });
});

test("marcarArribo — transición pendiente -> arribado", async () => {
  const store = createIntegracionStore();
  seedRecorrido(store);

  const resultado = await store.marcarArribo("tok-1", "p1");
  assert.equal(resultado.outcome, "ok");
  assert.equal(resultado.punto.estado, "arribado");
  assert.ok(resultado.punto.arriboEn);

  const recorrido = await store.obtenerPorToken("tok-1");
  assert.deepEqual(recorrido.progreso, { pendientes: 1, arribados: 1, completados: 0 });
});

test("marcarArribo — repetirlo es idempotente (no cambia el timestamp a error)", async () => {
  const store = createIntegracionStore();
  seedRecorrido(store);

  const primero = await store.marcarArribo("tok-1", "p1");
  const segundo = await store.marcarArribo("tok-1", "p1");
  assert.equal(segundo.outcome, "ok");
  assert.equal(segundo.punto.arriboEn, primero.punto.arriboEn);
});

test("marcarArribo — conflict si el punto ya está completado", async () => {
  const store = createIntegracionStore();
  seedRecorrido(store);
  await store.marcarArribo("tok-1", "p1");
  await store.marcarDescarga("tok-1", "p1");

  const resultado = await store.marcarArribo("tok-1", "p1");
  assert.equal(resultado.outcome, "conflict");
});

test("marcarArribo — invalid_token con token inexistente", async () => {
  const store = createIntegracionStore();
  seedRecorrido(store);
  assert.equal((await store.marcarArribo("no-existe", "p1")).outcome, "invalid_token");
});

test("marcarArribo — not_found con puntoId inexistente", async () => {
  const store = createIntegracionStore();
  seedRecorrido(store);
  assert.equal((await store.marcarArribo("tok-1", "no-existe")).outcome, "not_found");
});

test("marcarDescarga — conflict si todavía no hubo arribo", async () => {
  const store = createIntegracionStore();
  seedRecorrido(store);
  assert.equal((await store.marcarDescarga("tok-1", "p1")).outcome, "conflict");
});

test("marcarDescarga — pendiente -> arribado -> completado, idempotente al repetir", async () => {
  const store = createIntegracionStore();
  seedRecorrido(store);
  await store.marcarArribo("tok-1", "p1");

  const primero = await store.marcarDescarga("tok-1", "p1");
  assert.equal(primero.outcome, "ok");
  assert.equal(primero.punto.estado, "completado");

  const segundo = await store.marcarDescarga("tok-1", "p1");
  assert.equal(segundo.outcome, "ok");
  assert.equal(segundo.punto.descargaEn, primero.punto.descargaEn);
});

test("upsert — un re-push con puntos 'pendiente' no pisa el progreso ya confirmado por el chofer", async () => {
  const store = createIntegracionStore();
  seedRecorrido(store);
  await store.marcarArribo("tok-1", "p1");

  // Oracle vuelve a pushear el mismo recorrido (resync periódico o retry),
  // con los puntos en su estado original "pendiente" y topología actualizada.
  seedRecorrido(store, {
    puntos: [
      { id: "p1", orden: 1, estado: "pendiente", lat: -34.61, lon: -58.41 },
      { id: "p2", orden: 2, estado: "pendiente", lat: -34.7, lon: -58.5 },
    ],
  });

  const recorrido = await store.obtenerPorToken("tok-1");
  const p1 = recorrido.puntos.find((p) => p.id === "p1");
  assert.equal(p1.estado, "arribado", "el arribo confirmado no debe resetearse a pendiente");
  assert.equal(p1.latitud, -34.61, "la topología (lat/lon) sí se refresca desde Oracle");

  const p2 = recorrido.puntos.find((p) => p.id === "p2");
  assert.equal(p2.estado, "pendiente");
});
