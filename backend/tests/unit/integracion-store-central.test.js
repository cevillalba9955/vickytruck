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

test("listarActivos — expone chofer.nombre desde choferId/choferNombre, distinto del flete (009-central-mejora-visual)", async () => {
  const store = createIntegracionStore();
  seedActivo(store, { choferId: "CH-1", choferNombre: "Marta Sosa" });

  const [r] = await store.listarActivos();
  assert.deepEqual(r.chofer, { id: "CH-1", nombre: "Marta Sosa" });
});

test("listarActivos — chofer es null si Oracle todavía no lo informó", async () => {
  const store = createIntegracionStore();
  seedActivo(store);

  const [r] = await store.listarActivos();
  assert.equal(r.chofer, null);
});

test("listarActivos — ultimaUbicacion refleja lo que reportó el bridge MQTT y respeta el umbral de 'reciente'", async () => {
  const prev = process.env.UBICACION_STALE_MS;
  process.env.UBICACION_STALE_MS = String(5 * 60 * 1000);
  try {
    const store = createIntegracionStore();
    seedActivo(store, { choferId: "CH-1" });

    const sinUbicacion = (await store.listarActivos())[0];
    assert.equal(sinUbicacion.ultimaUbicacion.reciente, false);
    assert.equal(sinUbicacion.ultimaUbicacion.lat, null);

    store.actualizarUbicacionPorChofer("CH-1", { lat: -34.6, lon: -58.4, en: new Date().toISOString() });
    const conUbicacion = (await store.listarActivos())[0];
    assert.equal(conUbicacion.ultimaUbicacion.reciente, true);
    assert.equal(conUbicacion.ultimaUbicacion.lat, -34.6);

    const haceDiezMinutos = new Date(Date.now() - 10 * 60 * 1000).toISOString();
    store.actualizarUbicacionPorChofer("CH-1", { lat: -34.6, lon: -58.4, en: haceDiezMinutos });
    const vieja = (await store.listarActivos())[0];
    assert.equal(vieja.ultimaUbicacion.reciente, false);
  } finally {
    process.env.UBICACION_STALE_MS = prev;
  }
});

test("actualizarUbicacionPorChofer — retiene la última ubicación de un chofer sin recorrido activo asociado", async () => {
  const store = createIntegracionStore();
  const aplicado = store.actualizarUbicacionPorChofer("CH-huerfano", {
    lat: -34.6,
    lon: -58.4,
    en: new Date().toISOString(),
  });
  // No hay ningún recorrido activo para "CH-huerfano": no debe haber nada
  // que actualizar en Central, pero tampoco debe lanzar ni perder el dato
  // (queda retenido en memoria — FR-006, Constitución v5.0.0 Principio VII).
  assert.equal(aplicado, false);
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

test("obtenerDetalle — expone flete/chofer del recorrido (009-central-mejora-visual)", async () => {
  const store = createIntegracionStore();
  seedActivo(store, { choferId: "CH-2", choferNombre: "Diego Fernández" });

  const detalle = await store.obtenerDetalle("R-1");
  assert.deepEqual(detalle.recorrido.flete, { id: "F-1", nombre: "Juan Pérez" });
  assert.deepEqual(detalle.recorrido.chofer, { id: "CH-2", nombre: "Diego Fernández" });
});

test("obtenerDetalle — expone cliente por punto, y arriboLat/descargaLat en null si todavía no se marcaron (009-central-mejora-visual)", async () => {
  const store = createIntegracionStore();
  seedActivo(store, {
    puntos: [{ id: "p1", orden: 1, estado: "pendiente", lat: -34.6, lon: -58.4, cliente: "Almacén Centro" }],
  });

  const { puntos } = await store.obtenerDetalle("R-1");
  const [p] = puntos;
  assert.equal(p.cliente, "Almacén Centro");
  assert.equal(p.arriboLat, null);
  assert.equal(p.descargaLon, null);
});

test("obtenerDetalle — arriboLat/arriboLon reflejan el GPS capturado al marcar arribo (009-central-mejora-visual)", async () => {
  const store = createIntegracionStore();
  seedActivo(store, { token: "tok-gps", puntos: [{ id: "p1", orden: 1, estado: "pendiente", lat: -34.6, lon: -58.4 }] });

  await store.marcarArribo("tok-gps", "p1", { lat: -34.6001, lon: -58.4001 }, null);

  const { puntos } = await store.obtenerDetalle("R-1");
  assert.equal(puntos[0].arriboLat, -34.6001);
  assert.equal(puntos[0].arriboLon, -58.4001);
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

test("listarActivos — expone puntos, puntoSalida y color (010-mapa-central-unificado)", async () => {
  const store = createIntegracionStore();
  seedActivo(store, {
    puntos: [{ id: "p1", orden: 1, estado: "pendiente", lat: -34.6, lon: -58.4, cliente: "Almacén Centro" }],
    puntoSalida: { lat: -34.55, lon: -58.35 },
    color: "#8e44ad",
  });

  const [r] = await store.listarActivos();
  assert.deepEqual(r.puntos[0], {
    id: "p1",
    orden: 1,
    lat: -34.6,
    lon: -58.4,
    estado: "pendiente",
    cliente: "Almacén Centro",
    inicioEn: null,
    inicioLat: null,
    inicioLon: null,
    arriboEn: null,
    arriboLat: null,
    arriboLon: null,
    descargaEn: null,
    descargaLat: null,
    descargaLon: null,
    remitoIds: [],
  });
  assert.deepEqual(r.puntoSalida, { lat: -34.55, lon: -58.35 });
  assert.equal(r.color, "#8e44ad");
});

test("listarActivos — puntoSalida y color son null si Oracle no los envió", async () => {
  const store = createIntegracionStore();
  seedActivo(store);

  const [r] = await store.listarActivos();
  assert.equal(r.puntoSalida, null);
  assert.equal(r.color, null);
});

test("upsertRecorridos — un re-push sin puntoSalida/color preserva el valor ya cargado (mismo criterio que fleteNombre)", async () => {
  const store = createIntegracionStore();
  seedActivo(store, { puntoSalida: { lat: -34.55, lon: -58.35 }, color: "#8e44ad" });

  // Re-push de topología sin puntoSalida/color (caso habitual de Oracle
  // re-enviando solo puntos/orden).
  store.upsertRecorridos([{ id: "R-1", fleteId: "F-1", estado: "activo", puntos: [{ id: "p1", orden: 1, estado: "pendiente" }] }]);

  const [r] = await store.listarActivos();
  assert.deepEqual(r.puntoSalida, { lat: -34.55, lon: -58.35 });
  assert.equal(r.color, "#8e44ad");
});

test("obtenerPuntoSalidaDefault — devuelve la constante fija del backend (010-mapa-central-unificado, FR-006)", async () => {
  const store = createIntegracionStore();
  assert.deepEqual(await store.obtenerPuntoSalidaDefault(), { lat: -34.8097527, lon: -58.4574414 });
});

test("listarHistorial — expone flete/chofer del recorrido finalizado (009-central-mejora-visual)", async () => {
  const store = createIntegracionStore();
  store.upsertRecorridos([
    {
      id: "R-10",
      fleteId: "F-10",
      fleteNombre: "Camión 10",
      choferId: "CH-10",
      choferNombre: "Nora Vidal",
      estado: "finalizado",
      puntos: [{ id: "p1", orden: 1, estado: "completado" }],
    },
  ]);

  const [h] = await store.listarHistorial();
  assert.deepEqual(h.recorrido.flete, { id: "F-10", nombre: "Camión 10" });
  assert.deepEqual(h.recorrido.chofer, { id: "CH-10", nombre: "Nora Vidal" });
});

// 008-registro-inicio-fin-recorrido, User Story 3 (2026-08-25): Central
// ahora ve inicioLat/inicioLon (por punto) y cierreLat/cierreLon (del
// recorrido) — research.md, Decisión 7, revierte la Decisión 4 original a
// la luz del precedente sentado por 009-central-mejora-visual para
// arriboLat/arriboLon/descargaLat/descargaLon.

test("obtenerDetalle — inicioLat/inicioLon y cierreLat/cierreLon reflejan el GPS capturado al tocar INICIAR/FINALIZAR", async () => {
  const store = createIntegracionStore();
  seedActivo(store, { token: "tok-us3", puntos: [{ id: "p1", orden: 1, estado: "pendiente", lat: -34.6, lon: -58.4 }] });

  await store.iniciarViaje("tok-us3", { lat: -34.601, lon: -58.401 });
  await store.registrarLlegue("tok-us3");
  await store.registrarDescargaCompleta("tok-us3");
  await store.finalizarRecorrido("tok-us3", { lat: -34.61, lon: -58.41 });

  const { recorrido, puntos } = await store.obtenerDetalle("R-1");
  assert.equal(puntos[0].inicioLat, -34.601);
  assert.equal(puntos[0].inicioLon, -58.401);
  assert.equal(recorrido.cierreLat, -34.61);
  assert.equal(recorrido.cierreLon, -58.41);
});

test("obtenerDetalle — inicioLat/inicioLon/cierreLat/cierreLon quedan en null (no undefined) cuando el dispositivo no proveyó GPS (FR-013)", async () => {
  const store = createIntegracionStore();
  seedActivo(store, { token: "tok-us3b", puntos: [{ id: "p1", orden: 1, estado: "pendiente" }] });

  await store.iniciarViaje("tok-us3b");
  await store.registrarLlegue("tok-us3b");
  await store.registrarDescargaCompleta("tok-us3b");
  await store.finalizarRecorrido("tok-us3b");

  const { recorrido, puntos } = await store.obtenerDetalle("R-1");
  assert.equal(puntos[0].inicioLat, null);
  assert.equal(puntos[0].inicioLon, null);
  assert.equal(recorrido.cierreLat, null);
  assert.equal(recorrido.cierreLon, null);
});

test("listarHistorial — cierreLat/cierreLon viajan en el listado, no solo en el detalle puntual", async () => {
  const store = createIntegracionStore();
  seedActivo(store, { token: "tok-us3c", puntos: [{ id: "p1", orden: 1, estado: "pendiente" }] });

  await store.iniciarViaje("tok-us3c", { lat: -34.6, lon: -58.4 });
  await store.registrarLlegue("tok-us3c");
  await store.registrarDescargaCompleta("tok-us3c");
  await store.finalizarRecorrido("tok-us3c", { lat: -34.62, lon: -58.42 });

  const [h] = await store.listarHistorial();
  assert.equal(h.recorrido.cierreLat, -34.62);
  assert.equal(h.recorrido.cierreLon, -58.42);
  assert.equal(h.puntos[0].inicioLat, -34.6);
  assert.equal(h.puntos[0].inicioLon, -58.4);
});
