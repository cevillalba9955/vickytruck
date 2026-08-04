import { test } from "node:test";
import assert from "node:assert/strict";
import { createInMemoryCentralRepository } from "../helpers/inMemoryCentralRepository.js";
import { createInMemoryRecorridoRepository } from "../helpers/inMemoryRecorridoRepository.js";
import { createFakeEmqxProvisioning } from "../helpers/fakeEmqxProvisioning.js";
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

// 004-chofer-cloud-broker (FR-006, US3 acceptance scenario 2): el detalle de
// un recorrido YA activo también incluye `enlace`, no solo la respuesta de
// /asignar — así Central puede volver a obtenerlo sin reasignar nada.
test("GET /api/central/recorridos/:id — incluye `enlace` para un recorrido ya activo (FR-006)", async () => {
  process.env.CHOFER_FRONTEND_URL = "https://chofer.example";
  const centralRepository = createInMemoryCentralRepository({
    recorridos: [
      { id: "50", estado: "activo", fleteId: "7", token: "tok-activo-50", puntos: [{ id: "p1", orden: 1, estado: "pendiente" }] },
    ],
    fletes: [{ id: "7", nombre: "Juan Pérez" }],
  });
  const recorridoRepository = createInMemoryRecorridoRepository([
    { token: "tok-activo-50", puntos: [{ id: "p1", orden: 1, latitud: -1, longitud: -1, estado: "pendiente" }] },
  ]);
  const server = await iniciarServidorDePrueba(recorridoRepository, centralRepository, createFakeEmqxProvisioning());

  try {
    const res = await fetch(`${server.centralBaseUrl}/recorridos/50`);
    const body = await res.json();

    assert.ok(body.recorrido.enlace.startsWith("https://chofer.example/#/r/"));
    const b64 = body.recorrido.enlace.split("/#/r/")[1].replace(/-/g, "+").replace(/_/g, "/");
    const payload = JSON.parse(Buffer.from(b64 + "=".repeat((4 - (b64.length % 4)) % 4), "base64").toString("utf8"));
    assert.equal(payload.recorrido.mqtt.username, "tok-activo-50");
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
