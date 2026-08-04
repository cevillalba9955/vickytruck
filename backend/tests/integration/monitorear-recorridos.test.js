import { test } from "node:test";
import assert from "node:assert/strict";
import { createInMemoryCentralRepository } from "../helpers/inMemoryCentralRepository.js";

test("US1 — listarActivos refleja un cambio de estado de punto sin recrear el repositorio (FR-002)", async () => {
  const puntos = [
    { id: "p1", orden: 1, estado: "pendiente" },
    { id: "p2", orden: 2, estado: "pendiente" },
  ];
  const repository = createInMemoryCentralRepository({
    recorridos: [{ id: "50", estado: "activo", fleteId: "7", puntos }],
    fletes: [{ id: "7", nombre: "Juan Pérez" }],
  });

  const antes = await repository.listarActivos();
  assert.deepEqual(antes[0].progreso, { pendientes: 2, arribados: 0, completados: 0 });

  // Simula que el chofer marcó "arribo" en p1 (mismo dato subyacente que lee
  // Central; en producción ambos backends comparten la misma fuente Oracle,
  // Principio IV).
  puntos[0].estado = "arribado";

  const despues = await repository.listarActivos();
  assert.deepEqual(despues[0].progreso, { pendientes: 1, arribados: 1, completados: 0 });
});

test("US1 — listarActivos marca una ubicación vieja como no reciente (FR-014)", async () => {
  const haceDiezMinutos = new Date(Date.now() - 10 * 60 * 1000).toISOString();
  const repository = createInMemoryCentralRepository(
    {
      recorridos: [{ id: "50", estado: "activo", fleteId: "7", puntos: [{ id: "p1", orden: 1, estado: "pendiente" }] }],
      fletes: [
        {
          id: "7",
          nombre: "Juan Pérez",
          ultimaUbicacionLat: -34.6,
          ultimaUbicacionLon: -58.4,
          ultimaUbicacionEn: haceDiezMinutos,
        },
      ],
    },
    { staleMs: 5 * 60 * 1000 },
  );

  const [r] = await repository.listarActivos();
  assert.equal(r.ultimaUbicacion.reciente, false);
});
