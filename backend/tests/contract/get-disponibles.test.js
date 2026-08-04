import { test } from "node:test";
import assert from "node:assert/strict";
import { createInMemoryCentralRepository } from "../helpers/inMemoryCentralRepository.js";
import { iniciarServidorDePrueba } from "../helpers/testServer.js";

test("GET /api/central/recorridos/disponibles — 200 solo recorridos sin flete asignado (FR-003)", async () => {
  const repository = createInMemoryCentralRepository({
    recorridos: [
      { id: "50", fleteId: null, puntos: [{ id: "p1", orden: 1, estado: "pendiente" }, { id: "p2", orden: 2, estado: "pendiente" }] },
      { id: "51", fleteId: "7", puntos: [{ id: "p3", orden: 1, estado: "pendiente" }] },
    ],
    fletes: [{ id: "7", nombre: "Juan Pérez" }],
  });
  const server = await iniciarServidorDePrueba(undefined, repository);

  try {
    const res = await fetch(`${server.centralBaseUrl}/recorridos/disponibles`);
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.deepEqual(body.recorridos, [{ id: "50", totalPuntos: 2 }]);
  } finally {
    await server.cerrar();
  }
});

test("GET /api/central/fletes/disponibles — 200 solo fletes sin recorrido activo (FR-004)", async () => {
  const repository = createInMemoryCentralRepository({
    recorridos: [{ id: "51", estado: "activo", fleteId: "7", puntos: [] }],
    fletes: [
      { id: "7", nombre: "Juan Pérez" },
      { id: "9", nombre: "Ana Gómez" },
    ],
  });
  const server = await iniciarServidorDePrueba(undefined, repository);

  try {
    const res = await fetch(`${server.centralBaseUrl}/fletes/disponibles`);
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.deepEqual(body.fletes, [{ id: "9", nombre: "Ana Gómez" }]);
  } finally {
    await server.cerrar();
  }
});
