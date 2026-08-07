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

test("US3 — IR PRIMERO sobrevive a un re-push de Oracle con el orden viejo, hasta que Oracle lee el nuevo vía GET /estado", async () => {
  const prev = process.env.INTEGRACION_API_KEY;
  process.env.INTEGRACION_API_KEY = "test-key";

  const store = createIntegracionStore();
  const server = await iniciarServidorDePrueba(store, undefined, undefined, store);

  function withApiKey(init = {}) {
    return { ...init, headers: { "Content-Type": "application/json", "x-api-key": "test-key", ...(init.headers || {}) } };
  }

  const puntosOriginales = [
    { id: "p1", orden: 1, estado: "pendiente" },
    { id: "p2", orden: 2, estado: "pendiente" },
    { id: "p3", orden: 3, estado: "pendiente" },
  ];

  try {
    await fetch(
      `${server.integracionBaseUrl}/recorridos`,
      withApiKey({
        method: "POST",
        body: JSON.stringify({ source: "oracle-apex", recorridos: [{ id: "R-3", token: "tok-3", fleteId: "F-3", estado: "activo", puntos: puntosOriginales }] }),
      }),
    );

    // Chofer prioriza p3 con IR PRIMERO.
    await fetch(`${server.baseUrl}/tok-3/viaje/ir-primero`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ puntoId: "p3" }),
    });
    let recorrido = await (await fetch(`${server.baseUrl}/tok-3`)).json();
    assert.deepEqual(
      recorrido.puntos.map((p) => p.id),
      ["p3", "p1", "p2"],
    );

    // Oracle re-pushea el recorrido con el orden ORIGINAL (todavía no se
    // enteró del reordenamiento) — no debe pisar el orden fijado por el chofer.
    await fetch(
      `${server.integracionBaseUrl}/recorridos`,
      withApiKey({
        method: "POST",
        body: JSON.stringify({ source: "oracle-apex", recorridos: [{ id: "R-3", token: "tok-3", fleteId: "F-3", estado: "activo", puntos: puntosOriginales }] }),
      }),
    );
    recorrido = await (await fetch(`${server.baseUrl}/tok-3`)).json();
    assert.deepEqual(
      recorrido.puntos.map((p) => p.id),
      ["p3", "p1", "p2"],
      "el re-push con orden viejo no debe pisar el reordenamiento del chofer todavía no leído por Oracle",
    );

    // Oracle finalmente lee el estado (su próximo poll) — a partir de acá el
    // orden queda "confirmado" y un push posterior con orden viejo sí pisa.
    await fetch(`${server.integracionBaseUrl}/estado?recorridoId=R-3`, withApiKey());

    await fetch(
      `${server.integracionBaseUrl}/recorridos`,
      withApiKey({
        method: "POST",
        body: JSON.stringify({ source: "oracle-apex", recorridos: [{ id: "R-3", token: "tok-3", fleteId: "F-3", estado: "activo", puntos: puntosOriginales }] }),
      }),
    );
    recorrido = await (await fetch(`${server.baseUrl}/tok-3`)).json();
    assert.deepEqual(
      recorrido.puntos.map((p) => p.id),
      ["p1", "p2", "p3"],
      "tras confirmar sincronización, un push posterior con orden viejo sí se aplica de nuevo",
    );
  } finally {
    process.env.INTEGRACION_API_KEY = prev;
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
