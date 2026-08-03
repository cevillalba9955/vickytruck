import { test } from "node:test";
import assert from "node:assert/strict";
import { createInMemoryRecorridoRepository } from "../helpers/inMemoryRecorridoRepository.js";
import { iniciarServidorDePrueba } from "../helpers/testServer.js";

test("US2 — marcar arribo sobre un punto no inicial funciona igual (marcado libre)", async () => {
  const repository = createInMemoryRecorridoRepository([
    {
      token: "tok-1",
      puntos: [
        { id: "p1", orden: 1, latitud: 0, longitud: 0, estado: "pendiente" },
        { id: "p2", orden: 2, latitud: 0, longitud: 0, estado: "pendiente" },
        { id: "p3", orden: 3, latitud: 0, longitud: 0, estado: "pendiente" },
      ],
    },
  ]);
  const server = await iniciarServidorDePrueba(repository);

  try {
    // Se marca arribo en el punto 3 sin haber tocado el 1 ni el 2.
    const res = await fetch(`${server.baseUrl}/tok-1/puntos/p3/arribo`, { method: "POST" });
    assert.equal(res.status, 200);

    const estadoActual = await (await fetch(`${server.baseUrl}/tok-1`)).json();
    const porId = Object.fromEntries(estadoActual.puntos.map((p) => [p.id, p.estado]));
    assert.equal(porId.p1, "pendiente");
    assert.equal(porId.p2, "pendiente");
    assert.equal(porId.p3, "arribado");
  } finally {
    await server.cerrar();
  }
});
