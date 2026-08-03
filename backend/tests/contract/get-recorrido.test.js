import { test } from "node:test";
import assert from "node:assert/strict";
import { createInMemoryRecorridoRepository } from "../helpers/inMemoryRecorridoRepository.js";
import { iniciarServidorDePrueba } from "../helpers/testServer.js";

test("GET /api/recorridos/:token — 200 con puntos ordenados y progreso", async () => {
  const repository = createInMemoryRecorridoRepository([
    {
      token: "tok-valido",
      estado: "activo",
      puntos: [
        { id: "p2", orden: 2, latitud: -34.6, longitud: -58.4, estado: "pendiente" },
        { id: "p1", orden: 1, latitud: -34.5, longitud: -58.3, estado: "completado" },
      ],
    },
  ]);
  const server = await iniciarServidorDePrueba(repository);

  try {
    const res = await fetch(`${server.baseUrl}/tok-valido`);
    assert.equal(res.status, 200);
    const body = await res.json();

    assert.equal(body.recorrido.estado, "activo");
    assert.equal(body.puntos.length, 2);
    // Orden por `orden`, no por orden de inserción (FR-003)
    assert.deepEqual(
      body.puntos.map((p) => p.orden),
      [1, 2],
    );
    assert.equal(body.puntos[0].totalPuntos, 2);
    assert.deepEqual(body.progreso, { pendientes: 1, arribados: 0, completados: 1 });
  } finally {
    await server.cerrar();
  }
});

test("GET /api/recorridos/:token — 404 con token inválido", async () => {
  const repository = createInMemoryRecorridoRepository([
    { token: "tok-valido", puntos: [{ id: "p1", orden: 1, latitud: 0, longitud: 0, estado: "pendiente" }] },
  ]);
  const server = await iniciarServidorDePrueba(repository);

  try {
    const res = await fetch(`${server.baseUrl}/tok-inexistente`);
    assert.equal(res.status, 404);
    const body = await res.json();
    assert.equal(body.error, "enlace_invalido");
  } finally {
    await server.cerrar();
  }
});
