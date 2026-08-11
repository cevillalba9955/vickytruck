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
        updatedAt: "2026-08-11T10:35:20.123-03:00",
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
    // 006-normalizar-formato-horario, US2: updatedAt del recorrido llega a Central.
    assert.equal(body.recorrido.updatedAt, "2026-08-11T10:35:20.123-03:00");
  } finally {
    await server.cerrar();
  }
});

test("GET /api/central/recorridos/:id — expone remitoIds por punto, dato interno de control (005-chofer-estados-viaje, FR-003)", async () => {
  const repository = createInMemoryCentralRepository({
    recorridos: [
      {
        id: "51",
        estado: "activo",
        fleteId: "8",
        puntos: [
          { id: "p1", orden: 1, estado: "pendiente", remitoIds: ["R-1", "R-2"] },
          { id: "p2", orden: 2, estado: "pendiente" },
        ],
      },
    ],
    fletes: [{ id: "8", nombre: "Ana Gómez" }],
  });
  const server = await iniciarServidorDePrueba(undefined, repository);

  try {
    const res = await fetch(`${server.centralBaseUrl}/recorridos/51`);
    const body = await res.json();
    assert.deepEqual(body.puntos[0].remitoIds, ["R-1", "R-2"]);
    assert.deepEqual(body.puntos[1].remitoIds, [], "un punto sin remitos expone lista vacía, no error");
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
