import { test } from "node:test";
import assert from "node:assert/strict";
import { obtenerRespaldoDesdeEventos, resolverUbicacion } from "../../src/db/ubicacionResolver.js";

const AHORA = new Date("2026-08-03T14:10:00Z").getTime();
const STALE_MS = 5 * 60 * 1000; // 5 minutos

test("resolverUbicacion — prioriza la posición en memoria sobre el respaldo (FR-016)", () => {
  const resultado = resolverUbicacion({
    enMemoria: { lat: -34.6, lon: -58.4, en: "2026-08-03T14:09:30Z" },
    respaldoOracle: { lat: -34.5, lon: -58.3, en: "2026-08-03T12:00:00Z" },
    staleMs: STALE_MS,
    ahora: AHORA,
  });

  assert.equal(resultado.lat, -34.6);
  assert.equal(resultado.lon, -58.4);
  assert.equal(resultado.reciente, true);
});

test("resolverUbicacion — usa el respaldo cuando no hay posición en memoria", () => {
  const resultado = resolverUbicacion({
    enMemoria: null,
    respaldoOracle: { lat: -34.5, lon: -58.3, en: "2026-08-03T14:08:00Z" },
    staleMs: STALE_MS,
    ahora: AHORA,
  });

  assert.equal(resultado.lat, -34.5);
  assert.equal(resultado.lon, -58.3);
  assert.equal(resultado.reciente, true);
});

test("resolverUbicacion — sin memoria ni respaldo, indica que no hay datos", () => {
  const resultado = resolverUbicacion({
    enMemoria: null,
    respaldoOracle: null,
    staleMs: STALE_MS,
    ahora: AHORA,
  });

  assert.deepEqual(resultado, { lat: null, lon: null, en: null, reciente: false });
});

test("resolverUbicacion — aplica el mismo umbral sin importar la fuente (FR-017)", () => {
  const viejaEnMemoria = resolverUbicacion({
    enMemoria: { lat: -34.6, lon: -58.4, en: "2026-08-03T14:00:00Z" }, // hace 10 min
    respaldoOracle: null,
    staleMs: STALE_MS,
    ahora: AHORA,
  });
  const viejaDeRespaldo = resolverUbicacion({
    enMemoria: null,
    respaldoOracle: { lat: -34.6, lon: -58.4, en: "2026-08-03T14:00:00Z" }, // hace 10 min
    staleMs: STALE_MS,
    ahora: AHORA,
  });

  assert.equal(viejaEnMemoria.reciente, false);
  assert.equal(viejaDeRespaldo.reciente, false);
});

test("obtenerRespaldoDesdeEventos — elige el evento más reciente con ubicación entre varios puntos", () => {
  const puntos = [
    { arriboEn: "2026-08-03T11:00:00Z", arriboLat: -34.1, arriboLon: -58.1, descargaEn: null, descargaLat: null, descargaLon: null },
    { arriboEn: "2026-08-03T12:00:00Z", arriboLat: -34.2, arriboLon: -58.2, descargaEn: "2026-08-03T12:15:00Z", descargaLat: -34.25, descargaLon: -58.25 },
  ];

  const respaldo = obtenerRespaldoDesdeEventos(puntos);
  assert.deepEqual(respaldo, { lat: -34.25, lon: -58.25, en: "2026-08-03T12:15:00Z" });
});

test("obtenerRespaldoDesdeEventos — devuelve null si ningún punto tiene ubicación de evento", () => {
  const puntos = [
    { arriboEn: null, arriboLat: null, arriboLon: null, descargaEn: null, descargaLat: null, descargaLon: null },
  ];

  assert.equal(obtenerRespaldoDesdeEventos(puntos), null);
});
