import { test } from "node:test";
import assert from "node:assert/strict";
import { createInMemoryCentralRepository } from "../helpers/inMemoryCentralRepository.js";
import { iniciarServidorDePrueba } from "../helpers/testServer.js";

test("GET /api/central/recorridos/activos — 200 con progreso y última ubicación (FR-001)", async () => {
  const repository = createInMemoryCentralRepository({
    recorridos: [
      {
        id: "50",
        estado: "activo",
        fleteId: "7",
        puntos: [
          { id: "p1", orden: 1, estado: "completado" },
          { id: "p2", orden: 2, estado: "arribado" },
          { id: "p3", orden: 3, estado: "pendiente" },
        ],
      },
    ],
    fletes: [
      {
        id: "7",
        nombre: "Juan Pérez",
        ultimaUbicacionLat: -34.6,
        ultimaUbicacionLon: -58.4,
        ultimaUbicacionEn: new Date().toISOString(),
      },
    ],
  });
  const server = await iniciarServidorDePrueba(undefined, repository);

  try {
    const res = await fetch(`${server.centralBaseUrl}/recorridos/activos`);
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.recorridos.length, 1);
    const [r] = body.recorridos;
    assert.equal(r.id, "50");
    assert.equal(r.flete.nombre, "Juan Pérez");
    assert.deepEqual(r.progreso, { pendientes: 1, arribados: 1, completados: 1 });
    assert.equal(r.ultimaUbicacion.reciente, true);
  } finally {
    await server.cerrar();
  }
});

test("GET /api/central/recorridos/activos — un recorrido sin flete asignado no aparece", async () => {
  const repository = createInMemoryCentralRepository({
    recorridos: [{ id: "51", fleteId: null, puntos: [{ id: "p1", orden: 1, estado: "pendiente" }] }],
    fletes: [],
  });
  const server = await iniciarServidorDePrueba(undefined, repository);

  try {
    const res = await fetch(`${server.centralBaseUrl}/recorridos/activos`);
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.deepEqual(body.recorridos, []);
  } finally {
    await server.cerrar();
  }
});
