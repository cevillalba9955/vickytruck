import { test } from "node:test";
import assert from "node:assert/strict";
import { createInMemoryCentralRepository } from "../helpers/inMemoryCentralRepository.js";
import { createInMemoryRecorridoRepository } from "../helpers/inMemoryRecorridoRepository.js";
import { createFakeEmqxProvisioning } from "../helpers/fakeEmqxProvisioning.js";
import { iniciarServidorDePrueba } from "../helpers/testServer.js";

function seed() {
  return createInMemoryCentralRepository({
    recorridos: [
      {
        id: "50",
        estado: "activo",
        fleteId: "7",
        token: "tok-original",
        puntos: [
          { id: "p1", orden: 1, estado: "completado" },
          { id: "p2", orden: 2, estado: "completado" },
          { id: "p3", orden: 3, estado: "pendiente" },
        ],
      },
      { id: "51", estado: "activo", fleteId: "9", puntos: [{ id: "p4", orden: 1, estado: "pendiente" }] },
    ],
    fletes: [
      { id: "7", nombre: "Juan Pérez" },
      { id: "9", nombre: "Ana Gómez" },
      { id: "11", nombre: "Luis Díaz" },
    ],
  });
}

test("POST reasignar — 200 conserva estados de puntos e invalida el token anterior (FR-009)", async () => {
  const server = await iniciarServidorDePrueba(undefined, seed());
  try {
    const res = await fetch(`${server.centralBaseUrl}/recorridos/50/reasignar`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fleteId: "11" }),
    });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.fleteId, "11");
    assert.notEqual(body.token, "tok-original");
    assert.equal(body.tokenAnteriorInvalidado, true);

    const detalleRes = await fetch(`${server.centralBaseUrl}/recorridos/50`);
    const detalle = await detalleRes.json();
    assert.equal(detalle.recorrido.fleteId, "11");
    assert.deepEqual(
      detalle.puntos.map((p) => p.estado),
      ["completado", "completado", "pendiente"],
    );
  } finally {
    await server.cerrar();
  }
});

// 004-chofer-cloud-broker (FR-006): igual que /asignar, /reasignar también
// devuelve un `enlace` — correspondiente siempre al token NUEVO, nunca al
// que se acaba de invalidar.
test("POST reasignar — 200 incluye un `enlace` nuevo, correspondiente al token nuevo (FR-006)", async () => {
  process.env.CHOFER_FRONTEND_URL = "https://chofer.example";
  const centralRepository = createInMemoryCentralRepository(
    {
      recorridos: [{ id: "50", estado: "activo", fleteId: "7", token: "tok-original", puntos: [{ id: "p1", orden: 1, estado: "pendiente" }] }],
      fletes: [
        { id: "7", nombre: "Juan Pérez" },
        { id: "11", nombre: "Luis Díaz" },
      ],
    },
    { generarToken: () => "tok-nuevo-50" },
  );
  const recorridoRepository = createInMemoryRecorridoRepository([
    { token: "tok-nuevo-50", puntos: [{ id: "p1", orden: 1, latitud: -1, longitud: -1, estado: "pendiente" }] },
  ]);
  const server = await iniciarServidorDePrueba(recorridoRepository, centralRepository, createFakeEmqxProvisioning());

  try {
    const res = await fetch(`${server.centralBaseUrl}/recorridos/50/reasignar`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fleteId: "11" }),
    });
    const body = await res.json();

    assert.ok(body.enlace.startsWith("https://chofer.example/#/r/"));
    const b64 = body.enlace.split("/#/r/")[1].replace(/-/g, "+").replace(/_/g, "/");
    const payload = JSON.parse(Buffer.from(b64 + "=".repeat((4 - (b64.length % 4)) % 4), "base64").toString("utf8"));
    // El enlace corresponde al token NUEVO, nunca al que se acaba de invalidar.
    assert.equal(payload.recorrido.mqtt.username, "tok-nuevo-50");
  } finally {
    await server.cerrar();
  }
});

test("POST reasignar — 409 flete_ocupado si el flete destino ya tiene otro recorrido activo", async () => {
  const server = await iniciarServidorDePrueba(undefined, seed());
  try {
    const res = await fetch(`${server.centralBaseUrl}/recorridos/50/reasignar`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fleteId: "9" }),
    });
    assert.equal(res.status, 409);
    assert.equal((await res.json()).error, "flete_ocupado");
  } finally {
    await server.cerrar();
  }
});
