import { test } from "node:test";
import assert from "node:assert/strict";
import { createUbicacionEnMemoria } from "../../src/state/ubicacionEnMemoria.js";
import { obtenerRespaldoDesdeEventos, resolverUbicacion } from "../../src/db/ubicacionResolver.js";

// Estos tests componen las mismas piezas que usa internamente
// `centralRepository.listarActivos()` (ubicacionEnMemoria + ubicacionResolver)
// para validar la prioridad memoria -> respaldo Oracle -> sin datos sin
// depender de una conexión Oracle real (research.md §8 de
// 002-panel-control-central).

function puntosConEventoDeArribo(en, lat, lon) {
  return [{ arriboEn: en, arriboLat: lat, arriboLon: lon, descargaEn: null, descargaLat: null, descargaLon: null }];
}

test("US1 — usa la posición en memoria cuando el flete la reportó recientemente", () => {
  const ubicacionStore = createUbicacionEnMemoria();
  ubicacionStore.registrar("50", { lat: -34.6, lon: -58.4, en: new Date().toISOString() });

  const puntos = puntosConEventoDeArribo("2026-08-03T10:00:00Z", -34.1, -58.1); // evento viejo, no debería usarse
  const respaldo = obtenerRespaldoDesdeEventos(puntos);
  const ultimaUbicacion = resolverUbicacion({
    enMemoria: ubicacionStore.obtener("50"),
    respaldoOracle: respaldo,
    staleMs: 5 * 60 * 1000,
    ahora: Date.now(),
  });

  assert.equal(ultimaUbicacion.lat, -34.6);
  assert.equal(ultimaUbicacion.lon, -58.4);
  assert.equal(ultimaUbicacion.reciente, true);
});

test("US1 — cae al respaldo del último evento Oracle cuando no hay posición en memoria", () => {
  const ubicacionStore = createUbicacionEnMemoria(); // nunca se reportó nada para este recorrido
  const en = new Date().toISOString();
  const puntos = puntosConEventoDeArribo(en, -34.2, -58.2);

  const ultimaUbicacion = resolverUbicacion({
    enMemoria: ubicacionStore.obtener("51"),
    respaldoOracle: obtenerRespaldoDesdeEventos(puntos),
    staleMs: 5 * 60 * 1000,
    ahora: Date.now(),
  });

  assert.equal(ultimaUbicacion.lat, -34.2);
  assert.equal(ultimaUbicacion.lon, -58.2);
  assert.equal(ultimaUbicacion.reciente, true);
});

test("US1 — indica que no hay ubicación disponible sin memoria ni evento persistido", () => {
  const ubicacionStore = createUbicacionEnMemoria();
  const puntos = [{ arriboEn: null, arriboLat: null, arriboLon: null, descargaEn: null, descargaLat: null, descargaLon: null }];

  const ultimaUbicacion = resolverUbicacion({
    enMemoria: ubicacionStore.obtener("52"),
    respaldoOracle: obtenerRespaldoDesdeEventos(puntos),
    staleMs: 5 * 60 * 1000,
    ahora: Date.now(),
  });

  assert.deepEqual(ultimaUbicacion, { lat: null, lon: null, en: null, reciente: false });
});

test("US1 — el respaldo también se marca como no reciente si el evento es viejo (FR-017)", () => {
  const ubicacionStore = createUbicacionEnMemoria();
  const haceUnaHora = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const puntos = puntosConEventoDeArribo(haceUnaHora, -34.3, -58.3);

  const ultimaUbicacion = resolverUbicacion({
    enMemoria: ubicacionStore.obtener("53"),
    respaldoOracle: obtenerRespaldoDesdeEventos(puntos),
    staleMs: 5 * 60 * 1000,
    ahora: Date.now(),
  });

  assert.equal(ultimaUbicacion.reciente, false);
});
