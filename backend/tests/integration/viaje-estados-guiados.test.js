import { test } from "node:test";
import assert from "node:assert/strict";
import { iniciarServidorDePrueba } from "../helpers/testServer.js";
import { createIntegracionStore } from "../../src/state/integracionStore.js";

test("US2 — ciclo guiado completo Detenido->Manejando->Descargando->Detenido sobre 2 puntos consecutivos", async () => {
  const store = createIntegracionStore();
  store.upsertRecorridos([
    {
      id: "R-1",
      token: "tok-1",
      fleteId: "F-1",
      estado: "activo",
      puntos: [
        { id: "p1", orden: 1, estado: "pendiente" },
        { id: "p2", orden: 2, estado: "pendiente" },
      ],
    },
  ]);
  const server = await iniciarServidorDePrueba(store, undefined, undefined, store);

  try {
    // Estado inicial: Detenido.
    let recorrido = await (await fetch(`${server.baseUrl}/tok-1`)).json();
    assert.equal(recorrido.recorrido.viajeEstado, "detenido");
    assert.equal(recorrido.recorrido.puntoActivoId, null);

    // Ciclo sobre p1.
    await fetch(`${server.baseUrl}/tok-1/viaje/iniciar`, { method: "POST" });
    recorrido = await (await fetch(`${server.baseUrl}/tok-1`)).json();
    assert.equal(recorrido.recorrido.viajeEstado, "manejando");
    assert.equal(recorrido.recorrido.puntoActivoId, "p1");

    await fetch(`${server.baseUrl}/tok-1/viaje/llegue`, { method: "POST" });
    recorrido = await (await fetch(`${server.baseUrl}/tok-1`)).json();
    assert.equal(recorrido.recorrido.viajeEstado, "descargando");
    assert.equal(recorrido.puntos.find((p) => p.id === "p1").estado, "arribado");

    await fetch(`${server.baseUrl}/tok-1/viaje/descarga-completa`, { method: "POST" });
    recorrido = await (await fetch(`${server.baseUrl}/tok-1`)).json();
    assert.equal(recorrido.recorrido.viajeEstado, "detenido");
    assert.equal(recorrido.recorrido.puntoActivoId, null);
    assert.equal(recorrido.puntos.find((p) => p.id === "p1").estado, "completado");
    assert.equal(recorrido.puntos.find((p) => p.id === "p2").estado, "pendiente");

    // Segundo ciclo arranca correctamente sobre p2 (el único pendiente que queda).
    await fetch(`${server.baseUrl}/tok-1/viaje/iniciar`, { method: "POST" });
    recorrido = await (await fetch(`${server.baseUrl}/tok-1`)).json();
    assert.equal(recorrido.recorrido.puntoActivoId, "p2", "el segundo ciclo debe activar p2, no volver a p1");

    await fetch(`${server.baseUrl}/tok-1/viaje/llegue`, { method: "POST" });
    await fetch(`${server.baseUrl}/tok-1/viaje/descarga-completa`, { method: "POST" });
    recorrido = await (await fetch(`${server.baseUrl}/tok-1`)).json();
    assert.equal(recorrido.recorrido.viajeEstado, "detenido");
    assert.equal(recorrido.progreso.completados, 2);
    assert.equal(recorrido.progreso.pendientes, 0);
  } finally {
    await server.cerrar();
  }
});

test("US2 — LLEGUE/DESCARGA COMPLETA operan siempre sobre el punto activo, no sobre cualquier pendiente", async () => {
  const store = createIntegracionStore();
  store.upsertRecorridos([
    {
      id: "R-2",
      token: "tok-2",
      fleteId: "F-2",
      estado: "activo",
      puntos: [
        { id: "p1", orden: 1, estado: "pendiente" },
        { id: "p2", orden: 2, estado: "pendiente" },
      ],
    },
  ]);
  const server = await iniciarServidorDePrueba(store, undefined, undefined, store);

  try {
    await fetch(`${server.baseUrl}/tok-2/viaje/iniciar`, { method: "POST" }); // activa p1
    await fetch(`${server.baseUrl}/tok-2/viaje/llegue`, { method: "POST" });

    const recorrido = await (await fetch(`${server.baseUrl}/tok-2`)).json();
    assert.equal(recorrido.puntos.find((p) => p.id === "p1").estado, "arribado");
    assert.equal(recorrido.puntos.find((p) => p.id === "p2").estado, "pendiente", "p2 no debe verse afectado");
  } finally {
    await server.cerrar();
  }
});
