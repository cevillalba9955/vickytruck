import { test } from "node:test";
import assert from "node:assert/strict";
import { createInMemoryRecorridoRepository } from "../helpers/inMemoryRecorridoRepository.js";
import { iniciarServidorDePrueba } from "../helpers/testServer.js";

test("US3 — flujo completo arribo -> descarga en los 2 puntos deja el recorrido 100% completado", async () => {
  const repository = createInMemoryRecorridoRepository([
    {
      token: "tok-1",
      puntos: [
        { id: "p1", orden: 1, latitud: 0, longitud: 0, estado: "pendiente" },
        { id: "p2", orden: 2, latitud: 0, longitud: 0, estado: "pendiente" },
      ],
    },
  ]);
  const server = await iniciarServidorDePrueba(repository);

  try {
    for (const puntoId of ["p1", "p2"]) {
      const arribo = await fetch(`${server.baseUrl}/tok-1/puntos/${puntoId}/arribo`, { method: "POST" });
      assert.equal(arribo.status, 200);
      const descarga = await fetch(`${server.baseUrl}/tok-1/puntos/${puntoId}/descarga`, { method: "POST" });
      assert.equal(descarga.status, 200);
    }

    const estadoFinal = await (await fetch(`${server.baseUrl}/tok-1`)).json();
    assert.deepEqual(estadoFinal.progreso, { pendientes: 0, arribados: 0, completados: 2 });
    assert.ok(estadoFinal.puntos.every((p) => p.estado === "completado"));
  } finally {
    await server.cerrar();
  }
});
