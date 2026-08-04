import { test } from "node:test";
import assert from "node:assert/strict";
import { createInMemoryCentralRepository } from "../helpers/inMemoryCentralRepository.js";
import { iniciarServidorDePrueba } from "../helpers/testServer.js";

test("GET /api/central/recorridos/:id — 200 con puntos ordenados y eventos (FR-008)", async () => {
  const repository = createInMemoryCentralRepository({
    recorridos: [
      {
        id: "50",
        estado: "activo",
        fleteId: "7",
        puntos: [
          { id: "p2", orden: 2, estado: "arribado", arriboEn: "2026-08-03T12:01:00Z" },
          { id: "p1", orden: 1, estado: "completado", arriboEn: "2026-08-03T11:00:00Z", descargaEn: "2026-08-03T11:15:00Z" },
        ],
      },
    ],
    fletes: [{ id: "7", nombre: "Juan Pérez" }],
  });
  const server = await iniciarServidorDePrueba(undefined, repository);

  try {
    const res = await fetch(`${server.centralBaseUrl}/recorridos/50`);
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.recorrido.id, "50");
    assert.equal(body.recorrido.fleteId, "7");
    assert.deepEqual(
      body.puntos.map((p) => p.orden),
      [1, 2],
    );
    assert.equal(body.puntos[0].descargaEn, "2026-08-03T11:15:00Z");
  } finally {
    await server.cerrar();
  }
});

test("GET /api/central/recorridos/:id — 404 si no existe", async () => {
  const repository = createInMemoryCentralRepository({ recorridos: [], fletes: [] });
  const server = await iniciarServidorDePrueba(undefined, repository);

  try {
    const res = await fetch(`${server.centralBaseUrl}/recorridos/999`);
    assert.equal(res.status, 404);
    assert.equal((await res.json()).error, "recorrido_no_encontrado");
  } finally {
    await server.cerrar();
  }
});
