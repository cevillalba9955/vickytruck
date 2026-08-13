import { test } from "node:test";
import assert from "node:assert/strict";
import { createInMemoryCentralRepository } from "../helpers/inMemoryCentralRepository.js";
import { iniciarServidorDePrueba } from "../helpers/testServer.js";

test("GET /api/central/recorridos/historial — 200 solo recorridos finalizados (FR-010)", async () => {
  const repository = createInMemoryCentralRepository({
    recorridos: [
      { id: "40", estado: "finalizado", fleteId: "7", puntos: [{ id: "p1", orden: 1, estado: "completado" }] },
      { id: "50", estado: "activo", fleteId: "9", puntos: [{ id: "p2", orden: 1, estado: "pendiente" }] },
    ],
    fletes: [
      { id: "7", nombre: "Juan Pérez" },
      { id: "9", nombre: "Ana Gómez" },
    ],
  });
  const server = await iniciarServidorDePrueba(undefined, repository);

  try {
    const res = await fetch(`${server.centralBaseUrl}/recorridos/historial`);
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.recorridos.length, 1);
    assert.equal(body.recorridos[0].id, "40");
    assert.equal(body.recorridos[0].fleteId, "7");
  } finally {
    await server.cerrar();
  }
});

test("GET /api/central/recorridos/historial — expone cierreEn por recorrido (008-registro-inicio-fin-recorrido)", async () => {
  const repository = createInMemoryCentralRepository({
    recorridos: [
      {
        id: "41",
        estado: "finalizado",
        fleteId: "7",
        cierreEn: "2026-08-13T14:40:00-03:00",
        puntos: [{ id: "p1", orden: 1, estado: "completado" }],
      },
    ],
    fletes: [{ id: "7", nombre: "Juan Pérez" }],
  });
  const server = await iniciarServidorDePrueba(undefined, repository);

  try {
    const res = await fetch(`${server.centralBaseUrl}/recorridos/historial`);
    const body = await res.json();
    assert.equal(body.recorridos[0].cierreEn, "2026-08-13T14:40:00-03:00");
  } finally {
    await server.cerrar();
  }
});
