import { test } from "node:test";
import assert from "node:assert/strict";
import { createInMemoryCentralRepository } from "../helpers/inMemoryCentralRepository.js";
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
