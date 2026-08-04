import { test } from "node:test";
import assert from "node:assert/strict";
import { createInMemoryRecorridoRepository } from "../helpers/inMemoryRecorridoRepository.js";
import { createFakeEmqxProvisioning } from "../helpers/fakeEmqxProvisioning.js";
import { createEnlaceRecorrido } from "../../src/services/enlaceRecorrido.js";

// 004-chofer-cloud-broker: reemplaza el antiguo `GET /api/recorridos/:token`
// (retirado) — el chofer ya no le pide el recorrido al backend; en cambio,
// Central obtiene el payload embebido vía `enlaceRecorrido.construirEnlace`.
// Se conserva la garantía de aislamiento entre tokens (FR-007) que cubría el
// contrato HTTP retirado.
test("US1 — construirEnlace(token) devuelve el recorrido completo sin exponer otros", async () => {
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
  const enlaceRecorrido = createEnlaceRecorrido({
    recorridoRepository: repository,
    emqxProvisioning: createFakeEmqxProvisioning(),
    frontendBaseUrl: "https://chofer.example",
  });

  const enlaceA = await enlaceRecorrido.construirEnlace("tok-flete-a");
  assert.equal(enlaceA.payload.puntos.length, 2);
  assert.ok(enlaceA.payload.puntos.every((p) => ["a1", "a2"].includes(p.id)));

  // FR-007: un token inexistente no debe exponer datos de otros recorridos.
  assert.equal(await enlaceRecorrido.construirEnlace("tok-no-existe"), null);
});
