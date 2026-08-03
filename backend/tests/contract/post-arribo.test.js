import { test } from "node:test";
import assert from "node:assert/strict";
import { createInMemoryRecorridoRepository } from "../helpers/inMemoryRecorridoRepository.js";
import { iniciarServidorDePrueba } from "../helpers/testServer.js";

function seed() {
  return createInMemoryRecorridoRepository([
    {
      token: "tok-1",
      puntos: [
        { id: "p1", orden: 1, latitud: 0, longitud: 0, estado: "pendiente" },
        { id: "p2", orden: 2, latitud: 0, longitud: 0, estado: "completado" },
      ],
    },
  ]);
}

test("POST arribo — 200 aplica la transición pendiente -> arribado", async () => {
  const server = await iniciarServidorDePrueba(seed());
  try {
    const res = await fetch(`${server.baseUrl}/tok-1/puntos/p1/arribo`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ lat: -34.6, lon: -58.4 }),
    });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.puntoId, "p1");
    assert.equal(body.estado, "arribado");
    assert.ok(body.arriboEn);
  } finally {
    await server.cerrar();
  }
});

test("POST arribo — 200 idempotente si ya estaba arribado", async () => {
  const repository = seed();
  const server = await iniciarServidorDePrueba(repository);
  try {
    await fetch(`${server.baseUrl}/tok-1/puntos/p1/arribo`, { method: "POST" });
    const segundaVez = await fetch(`${server.baseUrl}/tok-1/puntos/p1/arribo`, { method: "POST" });
    assert.equal(segundaVez.status, 200);
    const body = await segundaVez.json();
    assert.equal(body.estado, "arribado");
  } finally {
    await server.cerrar();
  }
});

test("POST arribo — 409 si el punto ya está completado", async () => {
  const server = await iniciarServidorDePrueba(seed());
  try {
    const res = await fetch(`${server.baseUrl}/tok-1/puntos/p2/arribo`, { method: "POST" });
    assert.equal(res.status, 409);
    const body = await res.json();
    assert.equal(body.error, "transicion_invalida");
    assert.equal(body.estado, "completado");
  } finally {
    await server.cerrar();
  }
});

test("POST arribo — 404 con token inválido", async () => {
  const server = await iniciarServidorDePrueba(seed());
  try {
    const res = await fetch(`${server.baseUrl}/tok-no-existe/puntos/p1/arribo`, { method: "POST" });
    assert.equal(res.status, 404);
    assert.equal((await res.json()).error, "enlace_invalido");
  } finally {
    await server.cerrar();
  }
});
