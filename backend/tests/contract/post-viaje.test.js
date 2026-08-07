import { test } from "node:test";
import assert from "node:assert/strict";
import { iniciarServidorDePrueba } from "../helpers/testServer.js";
import { createIntegracionStore } from "../../src/state/integracionStore.js";

// Los endpoints /viaje/* gatean server-side sobre viajeEstado/puntoActivoId
// (research.md, Decisión 7), que solo vive en el store real (no en el fake
// inMemoryRecorridoRepository, pensado para el contrato más simple de
// arribo/descarga libre de 001-chofer-recorrido) — igual que hace
// chofer-cloud-integracion.test.js para el loop completo.
async function servidorConRecorrido(puntos) {
  const store = createIntegracionStore();
  store.upsertRecorridos([{ id: "R-1", token: "tok-1", fleteId: "F-1", estado: "activo", puntos }]);
  const server = await iniciarServidorDePrueba(store, undefined, undefined, store);
  return { store, server };
}

test("POST /viaje/iniciar — Detenido -> Manejando sobre el primer punto pendiente (FR-007)", async () => {
  const { server } = await servidorConRecorrido([
    { id: "p1", orden: 1, estado: "pendiente" },
    { id: "p2", orden: 2, estado: "pendiente" },
  ]);
  try {
    const res = await fetch(`${server.baseUrl}/tok-1/viaje/iniciar`, { method: "POST" });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.viajeEstado, "manejando");
    assert.equal(body.puntoActivoId, "p1");
  } finally {
    await server.cerrar();
  }
});

test("POST /viaje/iniciar — 409 si ya no está Detenido", async () => {
  const { server } = await servidorConRecorrido([{ id: "p1", orden: 1, estado: "pendiente" }]);
  try {
    await fetch(`${server.baseUrl}/tok-1/viaje/iniciar`, { method: "POST" });
    const res = await fetch(`${server.baseUrl}/tok-1/viaje/iniciar`, { method: "POST" });
    assert.equal(res.status, 409);
    const body = await res.json();
    assert.equal(body.error, "transicion_invalida");
    assert.equal(body.viajeEstado, "manejando");
  } finally {
    await server.cerrar();
  }
});

test("POST /viaje/iniciar — 409 si no hay puntos pendientes", async () => {
  const { server } = await servidorConRecorrido([{ id: "p1", orden: 1, estado: "completado" }]);
  try {
    const res = await fetch(`${server.baseUrl}/tok-1/viaje/iniciar`, { method: "POST" });
    assert.equal(res.status, 409);
  } finally {
    await server.cerrar();
  }
});

test("POST /viaje/iniciar — 404 con token inexistente", async () => {
  const { server } = await servidorConRecorrido([{ id: "p1", orden: 1, estado: "pendiente" }]);
  try {
    const res = await fetch(`${server.baseUrl}/no-existe/viaje/iniciar`, { method: "POST" });
    assert.equal(res.status, 404);
    assert.equal((await res.json()).error, "enlace_invalido");
  } finally {
    await server.cerrar();
  }
});

test("POST /viaje/llegue — Manejando -> Descargando, marca arribo sobre el punto activo (FR-008, FR-009)", async () => {
  const { server } = await servidorConRecorrido([{ id: "p1", orden: 1, estado: "pendiente" }]);
  try {
    await fetch(`${server.baseUrl}/tok-1/viaje/iniciar`, { method: "POST" });
    const res = await fetch(`${server.baseUrl}/tok-1/viaje/llegue`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ lat: -34.6, lon: -58.4 }),
    });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.viajeEstado, "descargando");
    assert.equal(body.puntoActivoId, "p1");
    assert.equal(body.puntoEstado, "arribado");
    assert.ok(body.arriboEn);
  } finally {
    await server.cerrar();
  }
});

test("POST /viaje/llegue — 409 si el viaje no está Manejando", async () => {
  const { server } = await servidorConRecorrido([{ id: "p1", orden: 1, estado: "pendiente" }]);
  try {
    const res = await fetch(`${server.baseUrl}/tok-1/viaje/llegue`, { method: "POST" });
    assert.equal(res.status, 409);
    assert.equal((await res.json()).viajeEstado, "detenido");
  } finally {
    await server.cerrar();
  }
});

test("POST /viaje/descarga-completa — Descargando -> Detenido, marca descarga y libera el punto activo (FR-010, FR-011)", async () => {
  const { server } = await servidorConRecorrido([{ id: "p1", orden: 1, estado: "pendiente" }]);
  try {
    await fetch(`${server.baseUrl}/tok-1/viaje/iniciar`, { method: "POST" });
    await fetch(`${server.baseUrl}/tok-1/viaje/llegue`, { method: "POST" });
    const res = await fetch(`${server.baseUrl}/tok-1/viaje/descarga-completa`, { method: "POST" });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.viajeEstado, "detenido");
    assert.equal(body.puntoActivoId, null);
    assert.equal(body.puntoEstado, "completado");
    assert.ok(body.descargaEn);
  } finally {
    await server.cerrar();
  }
});

test("POST /viaje/descarga-completa — 409 si el viaje no está Descargando", async () => {
  const { server } = await servidorConRecorrido([{ id: "p1", orden: 1, estado: "pendiente" }]);
  try {
    await fetch(`${server.baseUrl}/tok-1/viaje/iniciar`, { method: "POST" }); // manejando, no descargando
    const res = await fetch(`${server.baseUrl}/tok-1/viaje/descarga-completa`, { method: "POST" });
    assert.equal(res.status, 409);
    assert.equal((await res.json()).viajeEstado, "manejando");
  } finally {
    await server.cerrar();
  }
});

test("POST /viaje/ir-primero — mueve un punto pendiente al frente (FR-014)", async () => {
  const { server } = await servidorConRecorrido([
    { id: "p1", orden: 1, estado: "pendiente" },
    { id: "p2", orden: 2, estado: "pendiente" },
    { id: "p3", orden: 3, estado: "pendiente" },
  ]);
  try {
    const res = await fetch(`${server.baseUrl}/tok-1/viaje/ir-primero`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ puntoId: "p3" }),
    });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.deepEqual(
      body.puntos.map((p) => p.id),
      ["p3", "p1", "p2"],
    );
  } finally {
    await server.cerrar();
  }
});

test("POST /viaje/ir-primero — 404 si el punto no existe en el recorrido", async () => {
  const { server } = await servidorConRecorrido([
    { id: "p1", orden: 1, estado: "pendiente" },
    { id: "p2", orden: 2, estado: "pendiente" },
  ]);
  try {
    const res = await fetch(`${server.baseUrl}/tok-1/viaje/ir-primero`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ puntoId: "no-existe" }),
    });
    assert.equal(res.status, 404);
  } finally {
    await server.cerrar();
  }
});

test("POST /viaje/ir-primero — 409 si el punto ya es el primero pendiente", async () => {
  const { server } = await servidorConRecorrido([
    { id: "p1", orden: 1, estado: "pendiente" },
    { id: "p2", orden: 2, estado: "pendiente" },
  ]);
  try {
    const res = await fetch(`${server.baseUrl}/tok-1/viaje/ir-primero`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ puntoId: "p1" }),
    });
    assert.equal(res.status, 409);
    assert.equal((await res.json()).motivo, "ya_es_primero");
  } finally {
    await server.cerrar();
  }
});

test("POST /viaje/ir-primero — 409 si solo queda un punto pendiente", async () => {
  const { server } = await servidorConRecorrido([{ id: "p1", orden: 1, estado: "pendiente" }]);
  try {
    const res = await fetch(`${server.baseUrl}/tok-1/viaje/ir-primero`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ puntoId: "p1" }),
    });
    assert.equal(res.status, 409);
  } finally {
    await server.cerrar();
  }
});

test("POST /viaje/ir-primero — 409 si el viaje no está Detenido", async () => {
  const { server } = await servidorConRecorrido([
    { id: "p1", orden: 1, estado: "pendiente" },
    { id: "p2", orden: 2, estado: "pendiente" },
  ]);
  try {
    await fetch(`${server.baseUrl}/tok-1/viaje/iniciar`, { method: "POST" });
    const res = await fetch(`${server.baseUrl}/tok-1/viaje/ir-primero`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ puntoId: "p2" }),
    });
    assert.equal(res.status, 409);
    assert.equal((await res.json()).motivo, "viaje_no_detenido");
  } finally {
    await server.cerrar();
  }
});

test("POST /viaje/ir-primero — 409 si el punto no está pendiente (ya arribado/completado)", async () => {
  const { server } = await servidorConRecorrido([
    { id: "p1", orden: 1, estado: "completado" },
    { id: "p2", orden: 2, estado: "pendiente" },
  ]);
  try {
    const res = await fetch(`${server.baseUrl}/tok-1/viaje/ir-primero`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ puntoId: "p1" }),
    });
    assert.equal(res.status, 409);
    assert.equal((await res.json()).motivo, "no_pendiente");
  } finally {
    await server.cerrar();
  }
});

test("POST /viaje/cancelar — revierte INICIAR (vuelve a Detenido, sin punto activo)", async () => {
  const { server } = await servidorConRecorrido([{ id: "p1", orden: 1, estado: "pendiente" }]);
  try {
    await fetch(`${server.baseUrl}/tok-1/viaje/iniciar`, { method: "POST" });
    const res = await fetch(`${server.baseUrl}/tok-1/viaje/cancelar`, { method: "POST" });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.viajeEstado, "detenido");
    assert.equal(body.puntoActivoId, null);

    const recorrido = await (await fetch(`${server.baseUrl}/tok-1`)).json();
    assert.equal(recorrido.puntos[0].estado, "pendiente");
  } finally {
    await server.cerrar();
  }
});

test("POST /viaje/cancelar — revierte LLEGUE (vuelve a Manejando, punto pendiente de nuevo)", async () => {
  const { server } = await servidorConRecorrido([{ id: "p1", orden: 1, estado: "pendiente" }]);
  try {
    await fetch(`${server.baseUrl}/tok-1/viaje/iniciar`, { method: "POST" });
    await fetch(`${server.baseUrl}/tok-1/viaje/llegue`, { method: "POST" });
    const res = await fetch(`${server.baseUrl}/tok-1/viaje/cancelar`, { method: "POST" });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.viajeEstado, "manejando");
    assert.equal(body.puntoActivoId, "p1");

    const recorrido = await (await fetch(`${server.baseUrl}/tok-1`)).json();
    assert.equal(recorrido.puntos[0].estado, "pendiente");
    assert.equal(recorrido.puntos[0].arriboEn, null);
  } finally {
    await server.cerrar();
  }
});

test("POST /viaje/cancelar — revierte DESCARGA COMPLETA (vuelve a Descargando, punto arribado de nuevo)", async () => {
  const { server } = await servidorConRecorrido([{ id: "p1", orden: 1, estado: "pendiente" }]);
  try {
    await fetch(`${server.baseUrl}/tok-1/viaje/iniciar`, { method: "POST" });
    await fetch(`${server.baseUrl}/tok-1/viaje/llegue`, { method: "POST" });
    await fetch(`${server.baseUrl}/tok-1/viaje/descarga-completa`, { method: "POST" });
    const res = await fetch(`${server.baseUrl}/tok-1/viaje/cancelar`, { method: "POST" });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.viajeEstado, "descargando");
    assert.equal(body.puntoActivoId, "p1");

    const recorrido = await (await fetch(`${server.baseUrl}/tok-1`)).json();
    assert.equal(recorrido.puntos[0].estado, "arribado");
    assert.equal(recorrido.puntos[0].descargaEn, null);
  } finally {
    await server.cerrar();
  }
});

test("POST /viaje/cancelar — revierte IR PRIMERO (restaura el orden previo)", async () => {
  const { server } = await servidorConRecorrido([
    { id: "p1", orden: 1, estado: "pendiente" },
    { id: "p2", orden: 2, estado: "pendiente" },
    { id: "p3", orden: 3, estado: "pendiente" },
  ]);
  try {
    await fetch(`${server.baseUrl}/tok-1/viaje/ir-primero`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ puntoId: "p3" }),
    });
    const res = await fetch(`${server.baseUrl}/tok-1/viaje/cancelar`, { method: "POST" });
    assert.equal(res.status, 200);

    const recorrido = await (await fetch(`${server.baseUrl}/tok-1`)).json();
    assert.deepEqual(
      recorrido.puntos.map((p) => p.id),
      ["p1", "p2", "p3"],
    );
  } finally {
    await server.cerrar();
  }
});

test("POST /viaje/cancelar — 409 nada_para_cancelar sin operación previa", async () => {
  const { server } = await servidorConRecorrido([{ id: "p1", orden: 1, estado: "pendiente" }]);
  try {
    const res = await fetch(`${server.baseUrl}/tok-1/viaje/cancelar`, { method: "POST" });
    assert.equal(res.status, 409);
    assert.equal((await res.json()).error, "nada_para_cancelar");
  } finally {
    await server.cerrar();
  }
});

test("POST /viaje/cancelar — FR-018: solo revierte la última operación, no una anterior", async () => {
  const { server } = await servidorConRecorrido([{ id: "p1", orden: 1, estado: "pendiente" }]);
  try {
    await fetch(`${server.baseUrl}/tok-1/viaje/iniciar`, { method: "POST" });
    await fetch(`${server.baseUrl}/tok-1/viaje/llegue`, { method: "POST" }); // 2da operación reemplaza a la 1ra

    const res = await fetch(`${server.baseUrl}/tok-1/viaje/cancelar`, { method: "POST" });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.viajeEstado, "manejando", "cancela LLEGUE (la última), no INICIAR");

    // Ya no queda nada para cancelar de nuevo.
    const segundoCancelar = await fetch(`${server.baseUrl}/tok-1/viaje/cancelar`, { method: "POST" });
    assert.equal(segundoCancelar.status, 409);
  } finally {
    await server.cerrar();
  }
});
