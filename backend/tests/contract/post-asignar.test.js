import { test } from "node:test";
import assert from "node:assert/strict";
import { createInMemoryCentralRepository } from "../helpers/inMemoryCentralRepository.js";
import { createInMemoryRecorridoRepository } from "../helpers/inMemoryRecorridoRepository.js";
import { createFakeEmqxProvisioning } from "../helpers/fakeEmqxProvisioning.js";
import { iniciarServidorDePrueba } from "../helpers/testServer.js";

function seed() {
  return createInMemoryCentralRepository({
    recorridos: [
      { id: "50", fleteId: null, puntos: [{ id: "p1", orden: 1, estado: "pendiente" }] },
      { id: "51", estado: "activo", fleteId: "7", puntos: [{ id: "p2", orden: 1, estado: "pendiente" }] },
    ],
    fletes: [
      { id: "7", nombre: "Juan Pérez" },
      { id: "9", nombre: "Ana Gómez" },
    ],
  });
}

test("POST asignar — 200 aplica la asignación y genera un token (FR-005, FR-006)", async () => {
  const server = await iniciarServidorDePrueba(undefined, seed());
  try {
    const res = await fetch(`${server.centralBaseUrl}/recorridos/50/asignar`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fleteId: "9" }),
    });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.recorridoId, "50");
    assert.equal(body.fleteId, "9");
    assert.ok(body.token);
    assert.ok(body.asignadoEn);
  } finally {
    await server.cerrar();
  }
});

// 004-chofer-cloud-broker (FR-006): la respuesta de /asignar incluye el
// enlace completo listo para copiar, no solo el `token` crudo. El token que
// genera `centralRepository.asignar` acá se fija a un valor conocido para
// poder sembrar `recorridoRepository` con el mismo token (en producción,
// `enlaceRecorrido.construirEnlace` resuelve ambos contra el mismo token
// real, ver server.js).
test("POST asignar — 200 incluye `enlace` con el payload embebido, decodificable (FR-006)", async () => {
  process.env.CHOFER_FRONTEND_URL = "https://chofer.example";
  const centralRepository = createInMemoryCentralRepository(
    {
      recorridos: [{ id: "50", fleteId: null, puntos: [{ id: "p1", orden: 1, estado: "pendiente" }] }],
      fletes: [{ id: "9", nombre: "Ana Gómez" }],
    },
    { generarToken: () => "tok-enlace-50" },
  );
  const recorridoRepository = createInMemoryRecorridoRepository([
    { token: "tok-enlace-50", puntos: [{ id: "p1", orden: 1, latitud: -1, longitud: -1, estado: "pendiente" }] },
  ]);
  const server = await iniciarServidorDePrueba(recorridoRepository, centralRepository, createFakeEmqxProvisioning());

  try {
    const res = await fetch(`${server.centralBaseUrl}/recorridos/50/asignar`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fleteId: "9" }),
    });
    const body = await res.json();

    assert.ok(body.enlace.startsWith("https://chofer.example/#/r/"));
    const b64 = body.enlace.split("/#/r/")[1].replace(/-/g, "+").replace(/_/g, "/");
    const payload = JSON.parse(Buffer.from(b64 + "=".repeat((4 - (b64.length % 4)) % 4), "base64").toString("utf8"));
    assert.equal(payload.recorrido.mqtt.username, "tok-enlace-50");
    assert.equal(payload.puntos.length, 1);
  } finally {
    await server.cerrar();
  }
});

test("POST asignar — 409 ya_asignado si el recorrido ya tiene flete activo (FR-007)", async () => {
  const server = await iniciarServidorDePrueba(undefined, seed());
  try {
    const res = await fetch(`${server.centralBaseUrl}/recorridos/51/asignar`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fleteId: "9" }),
    });
    assert.equal(res.status, 409);
    assert.equal((await res.json()).error, "ya_asignado");
  } finally {
    await server.cerrar();
  }
});

test("POST asignar — 409 flete_ocupado si el flete ya tiene otro recorrido activo (Historia 2, escenario 4)", async () => {
  const server = await iniciarServidorDePrueba(undefined, seed());
  try {
    const res = await fetch(`${server.centralBaseUrl}/recorridos/50/asignar`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fleteId: "7" }),
    });
    assert.equal(res.status, 409);
    assert.equal((await res.json()).error, "flete_ocupado");
  } finally {
    await server.cerrar();
  }
});

test("POST asignar — 404 con recorrido inexistente", async () => {
  const server = await iniciarServidorDePrueba(undefined, seed());
  try {
    const res = await fetch(`${server.centralBaseUrl}/recorridos/999/asignar`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fleteId: "9" }),
    });
    assert.equal(res.status, 404);
    assert.equal((await res.json()).error, "recorrido_no_encontrado");
  } finally {
    await server.cerrar();
  }
});
