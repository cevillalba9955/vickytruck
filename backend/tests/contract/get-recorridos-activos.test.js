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

test("GET /api/central/recorridos/activos — incluye puntos y puntoSalidaDefault siempre presente (010-mapa-central-unificado)", async () => {
  const repository = createInMemoryCentralRepository({
    recorridos: [
      {
        id: "50",
        estado: "activo",
        fleteId: "7",
        puntos: [{ id: "p1", orden: 1, estado: "pendiente", lat: -34.6, lon: -58.4, cliente: "Almacén Centro" }],
      },
    ],
    fletes: [{ id: "7", nombre: "Juan Pérez" }],
  });
  const server = await iniciarServidorDePrueba(undefined, repository);

  try {
    const res = await fetch(`${server.centralBaseUrl}/recorridos/activos`);
    const body = await res.json();
    assert.deepEqual(body.puntoSalidaDefault, { lat: -34.8097527, lon: -58.4574414 });
    const [r] = body.recorridos;
    assert.deepEqual(r.puntos[0], { id: "p1", orden: 1, lat: -34.6, lon: -58.4, cliente: "Almacén Centro", estado: "pendiente", inicioEn: null, inicioLat: null, inicioLon: null, arriboEn: null, descargaEn: null, remitoIds: [] });
    assert.equal(r.puntoSalida, null);
    assert.equal(r.color, null);
  } finally {
    await server.cerrar();
  }
});

test("GET /api/central/recorridos/activos — puntoSalidaDefault sigue presente sin recorridos activos (US4)", async () => {
  const repository = createInMemoryCentralRepository({ recorridos: [], fletes: [] });
  const server = await iniciarServidorDePrueba(undefined, repository);

  try {
    const res = await fetch(`${server.centralBaseUrl}/recorridos/activos`);
    const body = await res.json();
    assert.deepEqual(body.recorridos, []);
    assert.deepEqual(body.puntoSalidaDefault, { lat: -34.8097527, lon: -58.4574414 });
  } finally {
    await server.cerrar();
  }
});

test("GET /api/central/recorridos/activos — expone puntoSalida y color de un recorrido cuando el seed los trae (FR-002a/FR-008)", async () => {
  const repository = createInMemoryCentralRepository({
    recorridos: [
      {
        id: "50",
        estado: "activo",
        fleteId: "7",
        puntos: [{ id: "p1", orden: 1, estado: "pendiente" }],
        puntoSalida: { lat: -34.55, lon: -58.35 },
        color: "#8e44ad",
      },
    ],
    fletes: [{ id: "7", nombre: "Juan Pérez" }],
  });
  const server = await iniciarServidorDePrueba(undefined, repository);

  try {
    const res = await fetch(`${server.centralBaseUrl}/recorridos/activos`);
    const body = await res.json();
    assert.deepEqual(body.recorridos[0].puntoSalida, { lat: -34.55, lon: -58.35 });
    assert.equal(body.recorridos[0].color, "#8e44ad");
  } finally {
    await server.cerrar();
  }
});

test("GET /api/central/recorridos/activos — no expone cierreEn/cierreLat/cierreLon a nivel de recorrido (regresión, 008 User Story 3, 2026-08-25): ese endpoint es solo para recorridos todavía sin cerrar", async () => {
  const repository = createInMemoryCentralRepository({
    recorridos: [
      {
        id: "55",
        estado: "activo",
        fleteId: "7",
        puntos: [{ id: "p1", orden: 1, estado: "pendiente" }],
      },
    ],
    fletes: [{ id: "7", nombre: "Juan Pérez" }],
  });
  const server = await iniciarServidorDePrueba(undefined, repository);

  try {
    const res = await fetch(`${server.centralBaseUrl}/recorridos/activos`);
    const body = await res.json();
    const [r] = body.recorridos;
    assert.equal(r.cierreEn, undefined);
    assert.equal(r.cierreLat, undefined);
    assert.equal(r.cierreLon, undefined);
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
