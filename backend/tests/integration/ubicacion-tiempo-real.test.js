import { test } from "node:test";
import assert from "node:assert/strict";
import { obtenerRespaldoDesdeEventos, resolverUbicacion } from "../../src/db/ubicacionResolver.js";

// Estos tests ejercitan la lógica de prioridad memoria -> respaldo Oracle ->
// sin datos que usa internamente `centralRepository.listarActivos()`
// (ubicacionResolver), sin depender de una conexión Oracle real (research.md
// §8 de 002-panel-control-central). 013-mqtt-a-backend-directo retiró el
// store `ubicacionEnMemoria` (huérfano, sin lectores en producción — ver
// research.md Decisión 2): `enMemoria` acá es directamente el objeto que
// hoy produce `integracionStore.actualizarUbicacionPorChofer`, no algo leído
// de un store en memoria propio de este test.

function puntosConEventoDeArribo(en, lat, lon) {
  return [{ arriboEn: en, arriboLat: lat, arriboLon: lon, descargaEn: null, descargaLat: null, descargaLon: null }];
}

test("US1 — usa la posición en memoria cuando el flete la reportó recientemente", () => {
  const enMemoria = { lat: -34.6, lon: -58.4, en: new Date().toISOString() };

  const puntos = puntosConEventoDeArribo("2026-08-03T10:00:00Z", -34.1, -58.1); // evento viejo, no debería usarse
  const respaldo = obtenerRespaldoDesdeEventos(puntos);
  const ultimaUbicacion = resolverUbicacion({
    enMemoria,
    respaldoOracle: respaldo,
    staleMs: 5 * 60 * 1000,
    ahora: Date.now(),
  });

  assert.equal(ultimaUbicacion.lat, -34.6);
  assert.equal(ultimaUbicacion.lon, -58.4);
  assert.equal(ultimaUbicacion.reciente, true);
});

test("US1 — cae al respaldo del último evento Oracle cuando no hay posición en memoria", () => {
  const en = new Date().toISOString();
  const puntos = puntosConEventoDeArribo(en, -34.2, -58.2);

  const ultimaUbicacion = resolverUbicacion({
    enMemoria: null, // nunca se reportó nada para este recorrido
    respaldoOracle: obtenerRespaldoDesdeEventos(puntos),
    staleMs: 5 * 60 * 1000,
    ahora: Date.now(),
  });

  assert.equal(ultimaUbicacion.lat, -34.2);
  assert.equal(ultimaUbicacion.lon, -58.2);
  assert.equal(ultimaUbicacion.reciente, true);
});

test("US1 — indica que no hay ubicación disponible sin memoria ni evento persistido", () => {
  const puntos = [{ arriboEn: null, arriboLat: null, arriboLon: null, descargaEn: null, descargaLat: null, descargaLon: null }];

  const ultimaUbicacion = resolverUbicacion({
    enMemoria: null,
    respaldoOracle: obtenerRespaldoDesdeEventos(puntos),
    staleMs: 5 * 60 * 1000,
    ahora: Date.now(),
  });

  assert.deepEqual(ultimaUbicacion, { lat: null, lon: null, en: null, reciente: false });
});

test("US1 — el respaldo también se marca como no reciente si el evento es viejo (FR-017)", () => {
  const haceUnaHora = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const puntos = puntosConEventoDeArribo(haceUnaHora, -34.3, -58.3);

  const ultimaUbicacion = resolverUbicacion({
    enMemoria: null,
    respaldoOracle: obtenerRespaldoDesdeEventos(puntos),
    staleMs: 5 * 60 * 1000,
    ahora: Date.now(),
  });

  assert.equal(ultimaUbicacion.reciente, false);
});
