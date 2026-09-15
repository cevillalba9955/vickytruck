import { test } from "node:test";
import assert from "node:assert/strict";
import { createIntegracionStore } from "../../src/state/integracionStore.js";
import { iniciarServidorDePrueba } from "../helpers/testServer.js";

// 013-mqtt-a-backend-directo: el POST directo ahora alimenta el MISMO store
// que lee Central (antes escribía en el store huérfano `ubicacionEnMemoria`,
// retirado — ver research.md Decisión 2). Se usa una única instancia de
// `createIntegracionStore()` como `repository` Y `ubicacionStore`, igual que
// hace `server.js` en producción — así el test ejercita el mismo camino real
// (`actualizarUbicacionPorChofer`), no un doble en memoria aislado.
function seed(store, overrides = {}) {
  store.upsertRecorridos([
    {
      id: "50",
      token: "tok-1",
      choferId: "CH-1",
      estado: "activo",
      puntos: [{ id: "p1", orden: 1, estado: "pendiente", lat: 0, lon: 0 }],
      ...overrides,
    },
  ]);
}

test("POST /api/recorridos/:token/ubicacion — 200 y refleja la posición en el store que lee Central (choferId)", async () => {
  const store = createIntegracionStore();
  seed(store);
  const server = await iniciarServidorDePrueba(store, undefined, store);

  try {
    const res = await fetch(`${server.baseUrl}/tok-1/ubicacion`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ lat: -34.6, lon: -58.4 }),
    });
    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), { ok: true });

    const recorrido = store.listarEstado("50")[0];
    assert.equal(recorrido.ultimaUbicacion.lat, -34.6);
    assert.equal(recorrido.ultimaUbicacion.lon, -58.4);
    assert.ok(recorrido.ultimaUbicacion.en);
    // 006-normalizar-formato-horario: contrato interno en hora local de
    // Argentina con offset explícito, nunca UTC ('Z').
    assert.match(recorrido.ultimaUbicacion.en, /-03:00$/);
  } finally {
    await server.cerrar();
  }
});

test("POST /api/recorridos/:token/ubicacion — 200 pero no toca ningún store si el recorrido todavía no tiene choferId", async () => {
  const store = createIntegracionStore();
  seed(store, { choferId: null });
  const server = await iniciarServidorDePrueba(store, undefined, store);

  try {
    const res = await fetch(`${server.baseUrl}/tok-1/ubicacion`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ lat: -34.6, lon: -58.4 }),
    });
    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), { ok: true });
    assert.equal(store.listarEstado("50")[0].ultimaUbicacion, null);
  } finally {
    await server.cerrar();
  }
});

test("POST /api/recorridos/:token/ubicacion — 404 con token inválido", async () => {
  const store = createIntegracionStore();
  seed(store);
  const server = await iniciarServidorDePrueba(store, undefined, store);

  try {
    const res = await fetch(`${server.baseUrl}/tok-no-existe/ubicacion`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ lat: -34.6, lon: -58.4 }),
    });
    assert.equal(res.status, 404);
    assert.equal((await res.json()).error, "enlace_invalido");
    assert.equal(store.listarEstado("50")[0].ultimaUbicacion, null);
  } finally {
    await server.cerrar();
  }
});

test("POST /api/recorridos/:token/ubicacion — 400 sin lat/lon", async () => {
  const store = createIntegracionStore();
  seed(store);
  const server = await iniciarServidorDePrueba(store, undefined, store);

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
