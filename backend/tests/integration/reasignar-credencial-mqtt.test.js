import { test } from "node:test";
import assert from "node:assert/strict";
import { createInMemoryCentralRepository } from "../helpers/inMemoryCentralRepository.js";
import { createFakeEmqxProvisioning } from "../helpers/fakeEmqxProvisioning.js";
import { iniciarServidorDePrueba } from "../helpers/testServer.js";

test("US3 — al reasignar, se revoca la credencial MQTT del token anterior (FR-008)", async () => {
  const emqxProvisioning = createFakeEmqxProvisioning();
  const repository = createInMemoryCentralRepository(
    {
      recorridos: [
        { id: "50", estado: "activo", fleteId: "7", token: "tok-viejo", puntos: [{ id: "p1", orden: 1, estado: "pendiente" }] },
      ],
      fletes: [
        { id: "7", nombre: "Juan Pérez" },
        { id: "9", nombre: "Ana Gómez" },
      ],
    },
    { emqxProvisioning },
  );
  await emqxProvisioning.provisionarCredencial("tok-viejo"); // simula el estado previo: ya tenía credencial

  const server = await iniciarServidorDePrueba(undefined, repository);

  try {
    const res = await fetch(`${server.centralBaseUrl}/recorridos/50/reasignar`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fleteId: "9" }),
    });
    assert.equal(res.status, 200);
    const body = await res.json();

    assert.deepEqual(emqxProvisioning._revocados(), ["tok-viejo"]);
    assert.equal(emqxProvisioning._tieneCredencial("tok-viejo"), false);
    assert.notEqual(body.token, "tok-viejo");
  } finally {
    await server.cerrar();
  }
});

test("US3 — la primera asignación (sin token previo) no intenta revocar nada", async () => {
  const emqxProvisioning = createFakeEmqxProvisioning();
  const repository = createInMemoryCentralRepository(
    {
      recorridos: [{ id: "50", fleteId: null, puntos: [{ id: "p1", orden: 1, estado: "pendiente" }] }],
      fletes: [{ id: "7", nombre: "Juan Pérez" }],
    },
    { emqxProvisioning },
  );
  const server = await iniciarServidorDePrueba(undefined, repository);

  try {
    const res = await fetch(`${server.centralBaseUrl}/recorridos/50/asignar`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fleteId: "7" }),
    });
    assert.equal(res.status, 200);
    assert.deepEqual(emqxProvisioning._revocados(), []);
  } finally {
    await server.cerrar();
  }
});
