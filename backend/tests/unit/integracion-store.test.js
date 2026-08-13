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

// 008-registro-inicio-fin-recorrido: INICIAR registra hora + ubicación del
// punto que pasa a ser el activo (FR-001, FR-002).

test("iniciarViaje — registra fecha/hora y ubicación GPS como evento de inicio del punto activo", async () => {
  const store = createIntegracionStore();
  seedRecorrido(store);

  const resultado = await store.iniciarViaje("tok-1", { lat: -34.6, lon: -58.4 });
  assert.equal(resultado.outcome, "ok");

  const [recorrido] = store.listarEstado("R-1");
  const p1 = recorrido.puntos.find((p) => p.id === "p1");
  assert.ok(p1.inicioEn);
  assert.equal(p1.inicioLat, -34.6);
  assert.equal(p1.inicioLon, -58.4);
});

test("iniciarViaje — sin GPS (lat/lon ausentes) no rompe, solo no captura posición", async () => {
  const store = createIntegracionStore();
  seedRecorrido(store);

  const resultado = await store.iniciarViaje("tok-1");
  assert.equal(resultado.outcome, "ok");

  const [recorrido] = store.listarEstado("R-1");
  const p1 = recorrido.puntos.find((p) => p.id === "p1");
  assert.ok(p1.inicioEn, "el evento de inicio se registra igual, sin bloquear la transición");
  assert.equal(p1.inicioLat, null);
  assert.equal(p1.inicioLon, null);
});

test("iniciarViaje — el segundo ciclo registra su propio inicioEn sin tocar el del punto anterior", async () => {
  const store = createIntegracionStore();
  seedRecorrido(store);

  await store.iniciarViaje("tok-1", { lat: -34.6, lon: -58.4 }); // activa p1
  await store.registrarLlegue("tok-1");
  await store.registrarDescargaCompleta("tok-1"); // p1 completado

  await store.iniciarViaje("tok-1", { lat: -34.7, lon: -58.5 }); // activa p2

  const [recorrido] = store.listarEstado("R-1");
  const p1 = recorrido.puntos.find((p) => p.id === "p1");
  const p2 = recorrido.puntos.find((p) => p.id === "p2");
  assert.ok(p1.inicioEn);
  assert.equal(p1.inicioLat, -34.6);
  assert.ok(p2.inicioEn);
  assert.equal(p2.inicioLat, -34.7);
});

test("iniciarViaje — CANCELAR inmediato revierte inicioEn/inicioLat/inicioLon del punto", async () => {
  const store = createIntegracionStore();
  seedRecorrido(store);

  await store.iniciarViaje("tok-1", { lat: -34.6, lon: -58.4 });
  await store.cancelarUltimaOperacion("tok-1");

  const [recorrido] = store.listarEstado("R-1");
  const p1 = recorrido.puntos.find((p) => p.id === "p1");
  assert.equal(p1.inicioEn, null);
  assert.equal(p1.inicioLat, null);
  assert.equal(p1.inicioLon, null);
});

// 008-registro-inicio-fin-recorrido: el cierre automático de 2026-08-10 se
// retira (FR-004) — completar el último punto ya NO finaliza el recorrido;
// solo finalizarRecorrido() (más abajo) puede hacerlo.

test("marcarDescarga — completar el ÚLTIMO punto NO finaliza el recorrido (queda 'activo', esperando FINALIZAR)", async () => {
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
  assert.equal(recorrido.estado, "activo", "todos los puntos completado, pero sin FINALIZAR explícito el recorrido sigue activo");
  assert.ok(recorrido.puntos.every((p) => p.estado === "completado"));
});

test("finalizarRecorrido — un recorrido finalizado sale de listarActivos y aparece en listarHistorial", async () => {
  const store = createIntegracionStore();
  seedRecorrido(store);
  await store.marcarArribo("tok-1", "p1");
  await store.marcarDescarga("tok-1", "p1");
  await store.marcarArribo("tok-1", "p2");
  await store.marcarDescarga("tok-1", "p2");

  let activos = await store.listarActivos();
  assert.equal(activos.some((r) => r.id === "R-1"), true, "sigue activo hasta FINALIZAR");

  const resultado = await store.finalizarRecorrido("tok-1");
  assert.equal(resultado.outcome, "ok");
  assert.equal(resultado.estado, "finalizado");
  assert.ok(resultado.cierreEn);

  activos = await store.listarActivos();
  assert.equal(activos.some((r) => r.id === "R-1"), false);

  const historial = await store.listarHistorial();
  assert.equal(historial.some((r) => r.recorrido.id === "R-1"), true);
});

test("finalizarRecorrido — 409 conflict si quedan puntos sin completar", async () => {
  const store = createIntegracionStore();
  seedRecorrido(store);
  await store.marcarArribo("tok-1", "p1");
  await store.marcarDescarga("tok-1", "p1"); // p2 sigue pendiente

  const resultado = await store.finalizarRecorrido("tok-1");
  assert.equal(resultado.outcome, "conflict");

  const [recorrido] = store.listarEstado("R-1");
  assert.equal(recorrido.estado, "activo");
});

test("finalizarRecorrido — 409 conflict si viajeEstado no es 'detenido' (aunque todos los puntos estén completado)", async () => {
  const store = createIntegracionStore();
  seedRecorrido(store, { puntos: [{ id: "p1", orden: 1, estado: "pendiente" }] });
  await store.iniciarViaje("tok-1"); // viajeEstado: 'manejando', puntoActivoId: 'p1'

  // Completa p1 vía los endpoints directos de 001 (no tocan viajeEstado),
  // dejando el viaje guiado "colgado" en manejando — estado inconsistente
  // pero alcanzable (ver research.md, FINALIZAR solo válido en 'detenido').
  await store.marcarArribo("tok-1", "p1");
  await store.marcarDescarga("tok-1", "p1");

  const [recorrido] = store.listarEstado("R-1");
  assert.equal(recorrido.viajeEstado, "manejando", "los endpoints directos no mueven viajeEstado");
  assert.ok(recorrido.puntos.every((p) => p.estado === "completado"));

  const resultado = await store.finalizarRecorrido("tok-1");
  assert.equal(resultado.outcome, "conflict");
});

test("finalizarRecorrido — captura fecha/hora y ubicación GPS del chofer (dato para Central)", async () => {
  const store = createIntegracionStore();
  seedRecorrido(store, { puntos: [{ id: "p1", orden: 1, estado: "pendiente" }] });
  await store.marcarArribo("tok-1", "p1");
  await store.marcarDescarga("tok-1", "p1");

  const resultado = await store.finalizarRecorrido("tok-1", { lat: -34.6, lon: -58.4 });
  assert.equal(resultado.outcome, "ok");

  const [recorrido] = store.listarEstado("R-1");
  assert.ok(recorrido.cierreEn);
  assert.equal(recorrido.cierreLat, -34.6);
  assert.equal(recorrido.cierreLon, -58.4);
});

test("finalizarRecorrido — sin GPS (lat/lon ausentes) no rompe, solo no captura posición", async () => {
  const store = createIntegracionStore();
  seedRecorrido(store, { puntos: [{ id: "p1", orden: 1, estado: "pendiente" }] });
  await store.marcarArribo("tok-1", "p1");
  await store.marcarDescarga("tok-1", "p1");

  const resultado = await store.finalizarRecorrido("tok-1");
  assert.equal(resultado.outcome, "ok");

  const [recorrido] = store.listarEstado("R-1");
  assert.ok(recorrido.cierreEn);
  assert.equal(recorrido.cierreLat, null);
  assert.equal(recorrido.cierreLon, null);
});

test("finalizarRecorrido — reintento sobre un recorrido ya finalizado es idempotente (no pisa cierreEn original)", async () => {
  const store = createIntegracionStore();
  seedRecorrido(store, { puntos: [{ id: "p1", orden: 1, estado: "pendiente" }] });
  await store.marcarArribo("tok-1", "p1");
  await store.marcarDescarga("tok-1", "p1");

  const primero = await store.finalizarRecorrido("tok-1", { lat: -34.6, lon: -58.4 });
  const segundo = await store.finalizarRecorrido("tok-1", { lat: -34.9, lon: -58.9 });

  assert.equal(segundo.outcome, "ok");
  assert.equal(segundo.cierreEn, primero.cierreEn, "el reintento offline no debe pisar la hora de cierre real");

  const [recorrido] = store.listarEstado("R-1");
  assert.equal(recorrido.cierreLat, -34.6, "tampoco pisa la ubicación original");
});

test("upsert — un re-push con estado 'activo' no revierte un recorrido ya finalizado", async () => {
  const store = createIntegracionStore();
  seedRecorrido(store);
  await store.marcarArribo("tok-1", "p1");
  await store.marcarDescarga("tok-1", "p1");
  await store.marcarArribo("tok-1", "p2");
  await store.marcarDescarga("tok-1", "p2");
  await store.finalizarRecorrido("tok-1");

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
