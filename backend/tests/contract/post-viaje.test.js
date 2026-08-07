import { test } from "node:test";
import assert from "node:assert/strict";
import { iniciarServidorDePrueba } from "../helpers/testServer.js";
import { createIntegracionStore } from "../../src/state/integracionStore.js";

// Los endpoints /viaje/* gatean server-side sobre viajeEstado/puntoActivoId
// (research.md, Decisión 7), que solo vive en el store real (no en el fake
// inMemoryRecorridoRepository, pensado para el contrato más simple de
// arribo/descarga libre de 001-chofer-recorrido) — igual que hace
// chofer-cloud-integracion.test.js para el loop completo.
async function servidorConRecorrido(puntos) {
  const store = createIntegracionStore();
  store.upsertRecorridos([{ id: "R-1", token: "tok-1", fleteId: "F-1", estado: "activo", puntos }]);
  const server = await iniciarServidorDePrueba(store, undefined, undefined, store);
  return { store, server };
}

test("POST /viaje/iniciar — Detenido -> Manejando sobre el primer punto pendiente (FR-007)", async () => {
  const { server } = await servidorConRecorrido([
    { id: "p1", orden: 1, estado: "pendiente" },
    { id: "p2", orden: 2, estado: "pendiente" },
  ]);
  try {
    const res = await fetch(`${server.baseUrl}/tok-1/viaje/iniciar`, { method: "POST" });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.viajeEstado, "manejando");
    assert.equal(body.puntoActivoId, "p1");
  } finally {
    await server.cerrar();
  }
});

test("POST /viaje/iniciar — 409 si ya no está Detenido", async () => {
  const { server } = await servidorConRecorrido([{ id: "p1", orden: 1, estado: "pendiente" }]);
  try {
    await fetch(`${server.baseUrl}/tok-1/viaje/iniciar`, { method: "POST" });
    const res = await fetch(`${server.baseUrl}/tok-1/viaje/iniciar`, { method: "POST" });
    assert.equal(res.status, 409);
    const body = await res.json();
    assert.equal(body.error, "transicion_invalida");
    assert.equal(body.viajeEstado, "manejando");
  } finally {
    await server.cerrar();
  }
});

test("POST /viaje/iniciar — 409 si no hay puntos pendientes", async () => {
  const { server } = await servidorConRecorrido([{ id: "p1", orden: 1, estado: "completado" }]);
  try {
    const res = await fetch(`${server.baseUrl}/tok-1/viaje/iniciar`, { method: "POST" });
    assert.equal(res.status, 409);
  } finally {
    await server.cerrar();
  }
});

test("POST /viaje/iniciar — 404 con token inexistente", async () => {
  const { server } = await servidorConRecorrido([{ id: "p1", orden: 1, estado: "pendiente" }]);
  try {
    const res = await fetch(`${server.baseUrl}/no-existe/viaje/iniciar`, { method: "POST" });
    assert.equal(res.status, 404);
    assert.equal((await res.json()).error, "enlace_invalido");
  } finally {
    await server.cerrar();
  }
});

test("POST /viaje/llegue — Manejando -> Descargando, marca arribo sobre el punto activo (FR-008, FR-009)", async () => {
  const { server } = await servidorConRecorrido([{ id: "p1", orden: 1, estado: "pendiente" }]);
  try {
    await fetch(`${server.baseUrl}/tok-1/viaje/iniciar`, { method: "POST" });
    const res = await fetch(`${server.baseUrl}/tok-1/viaje/llegue`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ lat: -34.6, lon: -58.4 }),
    });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.viajeEstado, "descargando");
    assert.equal(body.puntoActivoId, "p1");
    assert.equal(body.puntoEstado, "arribado");
    assert.ok(body.arriboEn);
  } finally {
    await server.cerrar();
  }
});

test("POST /viaje/llegue — 409 si el viaje no está Manejando", async () => {
  const { server } = await servidorConRecorrido([{ id: "p1", orden: 1, estado: "pendiente" }]);
  try {
    const res = await fetch(`${server.baseUrl}/tok-1/viaje/llegue`, { method: "POST" });
    assert.equal(res.status, 409);
    assert.equal((await res.json()).viajeEstado, "detenido");
  } finally {
    await server.cerrar();
  }
});

test("POST /viaje/descarga-completa — Descargando -> Detenido, marca descarga y libera el punto activo (FR-010, FR-011)", async () => {
  const { server } = await servidorConRecorrido([{ id: "p1", orden: 1, estado: "pendiente" }]);
  try {
    await fetch(`${server.baseUrl}/tok-1/viaje/iniciar`, { method: "POST" });
    await fetch(`${server.baseUrl}/tok-1/viaje/llegue`, { method: "POST" });
    const res = await fetch(`${server.baseUrl}/tok-1/viaje/descarga-completa`, { method: "POST" });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.viajeEstado, "detenido");
    assert.equal(body.puntoActivoId, null);
    assert.equal(body.puntoEstado, "completado");
    assert.ok(body.descargaEn);
  } finally {
    await server.cerrar();
  }
});

test("POST /viaje/descarga-completa — 409 si el viaje no está Descargando", async () => {
  const { server } = await servidorConRecorrido([{ id: "p1", orden: 1, estado: "pendiente" }]);
  try {
    await fetch(`${server.baseUrl}/tok-1/viaje/iniciar`, { method: "POST" }); // manejando, no descargando
    const res = await fetch(`${server.baseUrl}/tok-1/viaje/descarga-completa`, { method: "POST" });
    assert.equal(res.status, 409);
    assert.equal((await res.json()).viajeEstado, "manejando");
  } finally {
    await server.cerrar();
  }
});
