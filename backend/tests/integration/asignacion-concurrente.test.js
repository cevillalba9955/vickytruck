import { test } from "node:test";
import assert from "node:assert/strict";
import { createInMemoryCentralRepository } from "../helpers/inMemoryCentralRepository.js";

test("US2 — dos asignaciones casi simultáneas sobre el mismo recorrido: solo una prevalece (FR-015)", async () => {
  const repository = createInMemoryCentralRepository({
    recorridos: [{ id: "50", fleteId: null, puntos: [{ id: "p1", orden: 1, estado: "pendiente" }] }],
    fletes: [
      { id: "7", nombre: "Juan Pérez" },
      { id: "9", nombre: "Ana Gómez" },
    ],
  });

  const [r1, r2] = await Promise.all([repository.asignar("50", "7"), repository.asignar("50", "9")]);

  const outcomes = [r1.outcome, r2.outcome];
  assert.equal(outcomes.filter((o) => o === "ok").length, 1, "exactamente una asignación debe aplicarse");
  assert.equal(outcomes.filter((o) => o === "ya_asignado").length, 1, "la otra debe rechazarse, no quedar ambigua");

  // El recorrido ya no aparece como "disponible" para una tercera asignación.
  const disponibles = await repository.listarDisponibles();
  assert.deepEqual(disponibles, []);
});
