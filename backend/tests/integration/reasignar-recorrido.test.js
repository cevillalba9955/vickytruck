import { test } from "node:test";
import assert from "node:assert/strict";
import { createInMemoryCentralRepository } from "../helpers/inMemoryCentralRepository.js";

test("US4 — tras reasignar, el flete original vuelve a estar disponible y los puntos completados no cambian", async () => {
  const repository = createInMemoryCentralRepository({
    recorridos: [
      {
        id: "50",
        estado: "activo",
        fleteId: "7",
        token: "tok-original",
        puntos: [
          { id: "p1", orden: 1, estado: "completado" },
          { id: "p2", orden: 2, estado: "pendiente" },
        ],
      },
    ],
    fletes: [
      { id: "7", nombre: "Juan Pérez" },
      { id: "11", nombre: "Luis Díaz" },
    ],
  });

  const antes = await repository.listarFletesDisponibles();
  assert.deepEqual(antes, [{ id: "11", nombre: "Luis Díaz" }]); // el flete 7 está ocupado con el recorrido 50

  const resultado = await repository.reasignar("50", "11");
  assert.equal(resultado.outcome, "ok");
  assert.notEqual(resultado.recorrido.token, "tok-original");

  const despues = await repository.listarFletesDisponibles();
  assert.deepEqual(despues, [{ id: "7", nombre: "Juan Pérez" }]); // 7 quedó libre; 11 pasó a ocupado

  const detalle = await repository.obtenerDetalle("50");
  assert.deepEqual(
    detalle.puntos.map((p) => p.estado),
    ["completado", "pendiente"],
  );
});
