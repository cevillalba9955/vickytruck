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

test("marcarArribo — captura el GPS del chofer al marcar (dato para Oracle/APEX)", async () => {
  const store = createIntegracionStore();
  seedRecorrido(store);

  await store.marcarArribo("tok-1", "p1", { lat: -34.61, lon: -58.41 });

  const [recorrido] = store.listarEstado("R-1");
  const p1 = recorrido.puntos.find((p) => p.id === "p1");
  assert.equal(p1.arriboLat, -34.61);
  assert.equal(p1.arriboLon, -58.41);
});

test("marcarArribo — sin GPS (lat/lon ausentes) no rompe, solo no captura posición", async () => {
  const store = createIntegracionStore();
  seedRecorrido(store);

  const resultado = await store.marcarArribo("tok-1", "p1", {});
  assert.equal(resultado.outcome, "ok");

  const [recorrido] = store.listarEstado("R-1");
  const p1 = recorrido.puntos.find((p) => p.id === "p1");
  assert.equal(p1.arriboLat, null);
  assert.equal(p1.arriboLon, null);
});

test("marcarArribo — repetirlo no pisa la posición GPS ya capturada", async () => {
  const store = createIntegracionStore();
  seedRecorrido(store);

  await store.marcarArribo("tok-1", "p1", { lat: -34.61, lon: -58.41 });
  await store.marcarArribo("tok-1", "p1", { lat: -34.99, lon: -58.99 });

  const [recorrido] = store.listarEstado("R-1");
  const p1 = recorrido.puntos.find((p) => p.id === "p1");
  assert.equal(p1.arriboLat, -34.61);
  assert.equal(p1.arriboLon, -58.41);
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

test("marcarDescarga — captura el GPS del chofer al marcar (dato para Oracle/APEX)", async () => {
  const store = createIntegracionStore();
  seedRecorrido(store);
  await store.marcarArribo("tok-1", "p1", { lat: -34.61, lon: -58.41 });

  await store.marcarDescarga("tok-1", "p1", { lat: -34.62, lon: -58.42 });

  const [recorrido] = store.listarEstado("R-1");
  const p1 = recorrido.puntos.find((p) => p.id === "p1");
  assert.equal(p1.arriboLat, -34.61, "el GPS de arribo no se pisa al marcar descarga");
  assert.equal(p1.descargaLat, -34.62);
  assert.equal(p1.descargaLon, -58.42);
});

// 2026-08-10: cierre automático del recorrido al completar el último punto.

test("marcarDescarga — el recorrido queda 'finalizado' cuando el ÚLTIMO punto pasa a completado", async () => {
  const store = createIntegracionStore();
  seedRecorrido(store);
  await store.marcarArribo("tok-1", "p1");
  await store.marcarDescarga("tok-1", "p1");

  // p1 completado, p2 todavía pendiente: el recorrido sigue activo.
  let [recorrido] = store.listarEstado("R-1");
  assert.equal(recorrido.estado, "activo");

  await store.marcarArribo("tok-1", "p2");
  await store.marcarDescarga("tok-1", "p2");

  [recorrido] = store.listarEstado("R-1");
  assert.equal(recorrido.estado, "finalizado");
});

test("marcarDescarga — un recorrido finalizado sale de listarActivos y aparece en listarHistorial", async () => {
  const store = createIntegracionStore();
  seedRecorrido(store);
  await store.marcarArribo("tok-1", "p1");
  await store.marcarDescarga("tok-1", "p1");
  await store.marcarArribo("tok-1", "p2");
  await store.marcarDescarga("tok-1", "p2");

  const activos = await store.listarActivos();
  assert.equal(activos.some((r) => r.id === "R-1"), false);

  const historial = await store.listarHistorial();
  assert.equal(historial.some((r) => r.recorrido.id === "R-1"), true);
});

test("upsert — un re-push con estado 'activo' no revierte un recorrido ya finalizado", async () => {
  const store = createIntegracionStore();
  seedRecorrido(store);
  await store.marcarArribo("tok-1", "p1");
  await store.marcarDescarga("tok-1", "p1");
  await store.marcarArribo("tok-1", "p2");
  await store.marcarDescarga("tok-1", "p2");

  let [recorrido] = store.listarEstado("R-1");
  assert.equal(recorrido.estado, "finalizado");

  // Oracle todavía no se enteró (leer_estado_puntos no corrió) y reenvía el
  // mismo recorrido como "activo" — no debe revertir el cierre local.
  seedRecorrido(store, { estado: "activo" });

  [recorrido] = store.listarEstado("R-1");
  assert.equal(recorrido.estado, "finalizado");
});

test("upsert — un recorrido nuevo arranca con viajeEstado 'detenido' y sin punto activo ni última operación", async () => {
  const store = createIntegracionStore();
  seedRecorrido(store);

  const [recorrido] = store.listarEstado("R-1");
  assert.equal(recorrido.viajeEstado, "detenido");
  assert.equal(recorrido.puntoActivoId, null);
  assert.equal(recorrido.ultimaOperacion, null);
});

test("upsert — un re-push preserva viajeEstado/puntoActivoId/ultimaOperacion ya vigentes", async () => {
  const store = createIntegracionStore();
  seedRecorrido(store);

  const [recorrido] = store.listarEstado("R-1");
  recorrido.viajeEstado = "manejando";
  recorrido.puntoActivoId = "p1";

  seedRecorrido(store, {
    puntos: [
      { id: "p1", orden: 1, estado: "pendiente", lat: -34.61, lon: -58.41 },
      { id: "p2", orden: 2, estado: "pendiente", lat: -34.7, lon: -58.5 },
    ],
  });

  const [tras] = store.listarEstado("R-1");
  assert.equal(tras.viajeEstado, "manejando");
  assert.equal(tras.puntoActivoId, "p1");
});

test("upsert — acepta y conserva cliente/dirección/rango horario/notas/remitoIds por punto", async () => {
  const store = createIntegracionStore();
  seedRecorrido(store, {
    puntos: [
      {
        id: "p1",
        orden: 1,
        estado: "pendiente",
        lat: -34.6,
        lon: -58.4,
        cliente: "Distribuidora Sur SRL",
        direccion: "Av. Rivadavia 1234",
        rangoHorario: "09:00–12:00",
        notasEntrega: "Tocar timbre de depósito",
        remitoIds: ["R-1", "R-2"],
      },
      { id: "p2", orden: 2, estado: "pendiente", lat: -34.7, lon: -58.5 },
    ],
  });

  const recorrido = await store.obtenerPorToken("tok-1");
  assert.equal(recorrido.puntos[0].cliente, "Distribuidora Sur SRL", "obtenerPorToken (contrato del chofer) sí expone los campos informativos");
  assert.equal(recorrido.puntos[0].remitoIds, undefined, "obtenerPorToken NUNCA expone remitoIds — es el contrato que consume el chofer (FR-003)");

  const [interno] = store.listarEstado("R-1");
  const p1 = interno.puntos.find((p) => p.id === "p1");
  assert.equal(p1.cliente, "Distribuidora Sur SRL");
  assert.equal(p1.direccion, "Av. Rivadavia 1234");
  assert.equal(p1.rangoHorario, "09:00–12:00");
  assert.equal(p1.notasEntrega, "Tocar timbre de depósito");
  assert.deepEqual(p1.remitoIds, ["R-1", "R-2"]);

  const p2 = interno.puntos.find((p) => p.id === "p2");
  assert.equal(p2.cliente, null);
  assert.deepEqual(p2.remitoIds, [], "un punto sin remitoIds queda con lista vacía, no undefined/null");
});

test("upsert — un re-push de un punto ya arribado/completado también refresca sus campos informativos", async () => {
  const store = createIntegracionStore();
  seedRecorrido(store);
  await store.marcarArribo("tok-1", "p1");

  seedRecorrido(store, {
    puntos: [
      { id: "p1", orden: 1, estado: "pendiente", lat: -34.6, lon: -58.4, cliente: "Cliente Actualizado", remitoIds: ["R-9"] },
      { id: "p2", orden: 2, estado: "pendiente", lat: -34.7, lon: -58.5 },
    ],
  });

  const [recorrido] = store.listarEstado("R-1");
  const p1 = recorrido.puntos.find((p) => p.id === "p1");
  assert.equal(p1.estado, "arribado", "el progreso no se pisa");
  assert.equal(p1.cliente, "Cliente Actualizado", "los campos informativos sí se refrescan, no son datos de progreso");
  assert.deepEqual(p1.remitoIds, ["R-9"]);
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
