import { test } from "node:test";
import assert from "node:assert/strict";
import { createInMemoryRecorridoRepository } from "../helpers/inMemoryRecorridoRepository.js";
import { createFakeEmqxProvisioning } from "../helpers/fakeEmqxProvisioning.js";
import { iniciarServidorDePrueba } from "../helpers/testServer.js";

test("US1 — resolver token válido devuelve el recorrido completo sin exponer otros", async () => {
  const repository = createInMemoryRecorridoRepository([
    {
      token: "tok-flete-a",
      puntos: [
        { id: "a1", orden: 1, latitud: -1, longitud: -1, estado: "pendiente" },
        { id: "a2", orden: 2, latitud: -2, longitud: -2, estado: "pendiente" },
      ],
    },
    {
      token: "tok-flete-b",
      puntos: [{ id: "b1", orden: 1, latitud: -9, longitud: -9, estado: "pendiente" }],
    },
  ]);
  const server = await iniciarServidorDePrueba(repository, undefined, createFakeEmqxProvisioning());

  try {
    const resA = await fetch(`${server.baseUrl}/tok-flete-a`);
    const bodyA = await resA.json();
    assert.equal(resA.status, 200);
    assert.equal(bodyA.puntos.length, 2);
    assert.ok(bodyA.puntos.every((p) => ["a1", "a2"].includes(p.id)));

    // FR-012: un token inválido no debe exponer datos de otros recorridos
    const resInvalido = await fetch(`${server.baseUrl}/tok-no-existe`);
    assert.equal(resInvalido.status, 404);
    const bodyInvalido = await resInvalido.json();
    assert.deepEqual(bodyInvalido, { error: "enlace_invalido" });
  } finally {
    await server.cerrar();
  }
});
