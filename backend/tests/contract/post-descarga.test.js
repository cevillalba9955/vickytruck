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
        { id: "p2", orden: 2, latitud: 0, longitud: 0, estado: "arribado" },
        { id: "p3", orden: 3, latitud: 0, longitud: 0, estado: "completado" },
      ],
    },
  ]);
}

test("POST descarga — 200 aplica la transición arribado -> completado", async () => {
  const server = await iniciarServidorDePrueba(seed());
  try {
    const res = await fetch(`${server.baseUrl}/tok-1/puntos/p2/descarga`, { method: "POST" });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.estado, "completado");
    assert.ok(body.descargaEn);
  } finally {
    await server.cerrar();
  }
});

test("POST descarga — 409 si el punto sigue pendiente (falta arribo, FR-007)", async () => {
  const server = await iniciarServidorDePrueba(seed());
  try {
    const res = await fetch(`${server.baseUrl}/tok-1/puntos/p1/descarga`, { method: "POST" });
    assert.equal(res.status, 409);
    const body = await res.json();
    assert.equal(body.error, "transicion_invalida");
    assert.equal(body.estado, "pendiente");
  } finally {
    await server.cerrar();
  }
});

test("POST descarga — 200 idempotente si ya estaba completado", async () => {
  const server = await iniciarServidorDePrueba(seed());
  try {
    const res = await fetch(`${server.baseUrl}/tok-1/puntos/p3/descarga`, { method: "POST" });
    assert.equal(res.status, 200);
    assert.equal((await res.json()).estado, "completado");
  } finally {
    await server.cerrar();
  }
});
