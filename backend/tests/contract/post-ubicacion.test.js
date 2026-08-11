import { test } from "node:test";
import assert from "node:assert/strict";
import { createInMemoryRecorridoRepository } from "../helpers/inMemoryRecorridoRepository.js";
import { createUbicacionEnMemoria } from "../../src/state/ubicacionEnMemoria.js";
import { iniciarServidorDePrueba } from "../helpers/testServer.js";

function seed() {
  return createInMemoryRecorridoRepository([
    { token: "tok-1", id: "50", puntos: [{ id: "p1", orden: 1, latitud: 0, longitud: 0, estado: "pendiente" }] },
  ]);
}

test("POST /api/recorridos/:token/ubicacion — 200 registra la posición en memoria (FR-014)", async () => {
  const ubicacionStore = createUbicacionEnMemoria();
  const server = await iniciarServidorDePrueba(seed(), undefined, ubicacionStore);
  try {
    const res = await fetch(`${server.baseUrl}/tok-1/ubicacion`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ lat: -34.6, lon: -58.4 }),
    });
    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), { ok: true });

    const guardada = ubicacionStore.obtener("50");
    assert.equal(guardada.lat, -34.6);
    assert.equal(guardada.lon, -58.4);
    assert.ok(guardada.en);
    // 006-normalizar-formato-horario: contrato interno en hora local de
    // Argentina con offset explícito, nunca UTC ('Z').
    assert.match(guardada.en, /-03:00$/);
  } finally {
    await server.cerrar();
  }
});

test("POST /api/recorridos/:token/ubicacion — 404 con token inválido", async () => {
  const ubicacionStore = createUbicacionEnMemoria();
  const server = await iniciarServidorDePrueba(seed(), undefined, ubicacionStore);
  try {
    const res = await fetch(`${server.baseUrl}/tok-no-existe/ubicacion`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ lat: -34.6, lon: -58.4 }),
    });
    assert.equal(res.status, 404);
    assert.equal((await res.json()).error, "enlace_invalido");
    assert.equal(ubicacionStore.obtener("50"), null);
  } finally {
    await server.cerrar();
  }
});

test("POST /api/recorridos/:token/ubicacion — 400 sin lat/lon", async () => {
  const ubicacionStore = createUbicacionEnMemoria();
  const server = await iniciarServidorDePrueba(seed(), undefined, ubicacionStore);
  try {
    const res = await fetch(`${server.baseUrl}/tok-1/ubicacion`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    assert.equal(res.status, 400);
    assert.equal((await res.json()).error, "ubicacion_invalida");
  } finally {
    await server.cerrar();
  }
});
