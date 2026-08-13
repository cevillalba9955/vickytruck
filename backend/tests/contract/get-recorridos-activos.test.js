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
        updatedAt: "2026-08-11T10:35:20.123-03:00",
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
    // 006-normalizar-formato-horario, US2: updatedAt del recorrido llega a Central.
    assert.equal(r.updatedAt, "2026-08-11T10:35:20.123-03:00");
  } finally {
    await server.cerrar();
  }
});

test("GET /api/central/recorridos/activos — esperandoFinalizar es true cuando todos los puntos están completados (008, research.md Decisión 5)", async () => {
  const repository = createInMemoryCentralRepository({
    recorridos: [
      {
        id: "60",
        estado: "activo",
        fleteId: "7",
        puntos: [
          { id: "p1", orden: 1, estado: "completado" },
          { id: "p2", orden: 2, estado: "completado" },
        ],
      },
    ],
    fletes: [{ id: "7", nombre: "Juan Pérez" }],
  });
  const server = await iniciarServidorDePrueba(undefined, repository);

  try {
    const res = await fetch(`${server.centralBaseUrl}/recorridos/activos`);
    const body = await res.json();
    assert.equal(body.recorridos[0].esperandoFinalizar, true);
  } finally {
    await server.cerrar();
  }
});

test("GET /api/central/recorridos/activos — esperandoFinalizar es false si todavía hay puntos pendientes/arribados", async () => {
  const repository = createInMemoryCentralRepository({
    recorridos: [
      {
        id: "61",
        estado: "activo",
        fleteId: "7",
        puntos: [
          { id: "p1", orden: 1, estado: "completado" },
          { id: "p2", orden: 2, estado: "pendiente" },
        ],
      },
    ],
    fletes: [{ id: "7", nombre: "Juan Pérez" }],
  });
  const server = await iniciarServidorDePrueba(undefined, repository);

  try {
    const res = await fetch(`${server.centralBaseUrl}/recorridos/activos`);
    const body = await res.json();
    assert.equal(body.recorridos[0].esperandoFinalizar, false);
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
