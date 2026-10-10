import { test } from "node:test";
import assert from "node:assert/strict";
import { iniciarServidorDePrueba } from "../helpers/testServer.js";
import { createIntegracionStore } from "../../src/state/integracionStore.js";
import { createFakeEmqxProvisioning } from "../helpers/fakeEmqxProvisioning.js";

function withApiKey(init = {}) {
  return {
    ...init,
    headers: {
      "Content-Type": "application/json",
      "x-api-key": "test-key",
      ...(init.headers || {}),
    },
  };
}

test("POST /api/integracion/recorridos — 401 sin credenciales", async () => {
  const prev = process.env.INTEGRACION_API_KEY;
  process.env.INTEGRACION_API_KEY = "test-key";
  const store = createIntegracionStore();
  const server = await iniciarServidorDePrueba(undefined, undefined, undefined, store);

  try {
    const res = await fetch(`${server.integracionBaseUrl}/recorridos`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ recorridos: [] }),
    });
    assert.equal(res.status, 401);
  } finally {
    process.env.INTEGRACION_API_KEY = prev;
    await server.cerrar();
  }
});

test("GET /api/integracion/mqtt/estado — 401 sin credenciales", async () => {
  const prev = process.env.INTEGRACION_API_KEY;
  process.env.INTEGRACION_API_KEY = "test-key";
  const server = await iniciarServidorDePrueba(undefined, undefined, undefined, createIntegracionStore());

  try {
    const res = await fetch(`${server.integracionBaseUrl}/mqtt/estado`);
    assert.equal(res.status, 401);
  } finally {
    process.env.INTEGRACION_API_KEY = prev;
    await server.cerrar();
  }
});

test("GET /api/integracion/mqtt/estado — habilitado:false si no se inyectó ningún mqttBridge, canalPreferido:'directo' por default (012-ubicacion-por-chofer, 013-mqtt-a-backend-directo)", async () => {
  const prev = process.env.INTEGRACION_API_KEY;
  const prevCanal = process.env.UBICACION_CANAL_PREFERIDO;
  process.env.INTEGRACION_API_KEY = "test-key";
  delete process.env.UBICACION_CANAL_PREFERIDO;
  const server = await iniciarServidorDePrueba(undefined, undefined, undefined, createIntegracionStore());

  try {
    const res = await fetch(`${server.integracionBaseUrl}/mqtt/estado`, withApiKey());
    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), { habilitado: false, canalPreferido: "directo" });
  } finally {
    process.env.INTEGRACION_API_KEY = prev;
    if (prevCanal === undefined) delete process.env.UBICACION_CANAL_PREFERIDO;
    else process.env.UBICACION_CANAL_PREFERIDO = prevCanal;
    await server.cerrar();
  }
});

test("GET /api/integracion/mqtt/estado — refleja las métricas del mqttBridge inyectado, canalPreferido:'directo' por default", async () => {
  const prev = process.env.INTEGRACION_API_KEY;
  const prevCanal = process.env.UBICACION_CANAL_PREFERIDO;
  process.env.INTEGRACION_API_KEY = "test-key";
  delete process.env.UBICACION_CANAL_PREFERIDO;
  const mqttBridgeFake = {
    obtenerMetricas: () => ({
      habilitado: true,
      conectado: true,
      recibidos: 5,
      procesados: 4,
      duplicadosDescartados: 1,
      invalidos: 0,
      reconexiones: 0,
      ultimoMensajeEn: "2026-08-21T12:00:00-03:00",
    }),
  };
  const server = await iniciarServidorDePrueba(undefined, undefined, undefined, createIntegracionStore(), undefined, mqttBridgeFake);

  try {
    const res = await fetch(`${server.integracionBaseUrl}/mqtt/estado`, withApiKey());
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.habilitado, true);
    assert.equal(body.recibidos, 5);
    assert.equal(body.procesados, 4);
    assert.equal(body.canalPreferido, "directo");
  } finally {
    process.env.INTEGRACION_API_KEY = prev;
    if (prevCanal === undefined) delete process.env.UBICACION_CANAL_PREFERIDO;
    else process.env.UBICACION_CANAL_PREFERIDO = prevCanal;
    await server.cerrar();
  }
});

test("GET /api/integracion/mqtt/estado — canalPreferido:'broker' cuando UBICACION_CANAL_PREFERIDO=broker, independiente de las métricas del bridge (013-mqtt-a-backend-directo, FR-009)", async () => {
  const prev = process.env.INTEGRACION_API_KEY;
  const prevCanal = process.env.UBICACION_CANAL_PREFERIDO;
  process.env.INTEGRACION_API_KEY = "test-key";
  process.env.UBICACION_CANAL_PREFERIDO = "broker";
  const server = await iniciarServidorDePrueba(undefined, undefined, undefined, createIntegracionStore());

  try {
    const res = await fetch(`${server.integracionBaseUrl}/mqtt/estado`, withApiKey());
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.canalPreferido, "broker");
    assert.equal(body.habilitado, false); // sin mqttBridge inyectado en este test
  } finally {
    process.env.INTEGRACION_API_KEY = prev;
    if (prevCanal === undefined) delete process.env.UBICACION_CANAL_PREFERIDO;
    else process.env.UBICACION_CANAL_PREFERIDO = prevCanal;
    await server.cerrar();
  }
});

test("POST+GET /api/integracion/* — upsert y consulta de estado", async () => {
  const prev = process.env.INTEGRACION_API_KEY;
  process.env.INTEGRACION_API_KEY = "test-key";
  const store = createIntegracionStore();
  const server = await iniciarServidorDePrueba(undefined, undefined, undefined, store);

  try {
    const upsert = await fetch(
      `${server.integracionBaseUrl}/recorridos`,
      withApiKey({
        method: "POST",
        body: JSON.stringify({
          source: "oracle-apex",
          recorridos: [
            {
              id: "R-1001",
              fleteId: "F-1",
              estado: "activo",
              updatedAt: "2026-08-05T13:20:00Z",
              puntos: [{ id: "P-1", orden: 1, estado: "pendiente", lat: -34.6, lon: -58.4 }],
            },
          ],
        }),
      }),
    );

    assert.equal(upsert.status, 200);
    const upsertBody = await upsert.json();
    assert.equal(upsertBody.ok, true);
    assert.equal(upsertBody.upserted, 1);

    const estado = await fetch(`${server.integracionBaseUrl}/estado?recorridoId=R-1001`, withApiKey());
    assert.equal(estado.status, 200);
    const estadoBody = await estado.json();
    assert.equal(estadoBody.recorridos.length, 1);
    assert.equal(estadoBody.recorridos[0].id, "R-1001");
  } finally {
    process.env.INTEGRACION_API_KEY = prev;
    await server.cerrar();
  }
});

test("GET /api/integracion/estado — expone el GPS capturado al marcar arribo/descarga", async () => {
  const prev = process.env.INTEGRACION_API_KEY;
  process.env.INTEGRACION_API_KEY = "test-key";
  const store = createIntegracionStore();
  const server = await iniciarServidorDePrueba(undefined, undefined, undefined, store);

  try {
    await fetch(
      `${server.integracionBaseUrl}/recorridos`,
      withApiKey({
        method: "POST",
        body: JSON.stringify({
          source: "oracle-apex",
          recorridos: [
            {
              id: "R-2001",
              token: "tok-2001",
              fleteId: "F-1",
              estado: "activo",
              puntos: [{ id: "P-1", orden: 1, estado: "pendiente", lat: -34.6, lon: -58.4 }],
            },
          ],
        }),
      }),
    );

    await store.marcarArribo("tok-2001", "P-1", { lat: -34.61, lon: -58.41 });
    await store.marcarDescarga("tok-2001", "P-1", { lat: -34.62, lon: -58.42 });

    const estado = await fetch(`${server.integracionBaseUrl}/estado?recorridoId=R-2001`, withApiKey());
    const estadoBody = await estado.json();
    const punto = estadoBody.recorridos[0].puntos[0];
    assert.equal(punto.arriboLat, -34.61);
    assert.equal(punto.arriboLon, -58.41);
    assert.equal(punto.descargaLat, -34.62);
    assert.equal(punto.descargaLon, -58.42);
  } finally {
    process.env.INTEGRACION_API_KEY = prev;
    await server.cerrar();
  }
});

test("GET /api/integracion/estado — expone inicioEn/inicioLat/inicioLon por punto y cierreEn/cierreLat/cierreLon del recorrido (008, dirección Oracle, 2026-08-25)", async () => {
  const prev = process.env.INTEGRACION_API_KEY;
  process.env.INTEGRACION_API_KEY = "test-key";
  const store = createIntegracionStore();
  const server = await iniciarServidorDePrueba(undefined, undefined, undefined, store);

  try {
    await fetch(
      `${server.integracionBaseUrl}/recorridos`,
      withApiKey({
        method: "POST",
        body: JSON.stringify({
          source: "oracle-apex",
          recorridos: [
            {
              id: "R-2002",
              token: "tok-2002",
              fleteId: "F-1",
              estado: "activo",
              puntos: [{ id: "P-1", orden: 1, estado: "pendiente", lat: -34.6, lon: -58.4 }],
            },
          ],
        }),
      }),
    );

    await store.iniciarViaje("tok-2002", { lat: -34.601, lon: -58.401 });
    await store.registrarLlegue("tok-2002");
    await store.registrarDescargaCompleta("tok-2002");
    await store.finalizarRecorrido("tok-2002", { lat: -34.61, lon: -58.41 });

    const estado = await fetch(`${server.integracionBaseUrl}/estado?recorridoId=R-2002`, withApiKey());
    const estadoBody = await estado.json();
    const recorrido = estadoBody.recorridos[0];
    const punto = recorrido.puntos[0];
    assert.equal(punto.inicioLat, -34.601);
    assert.equal(punto.inicioLon, -58.401);
    assert.equal(recorrido.cierreLat, -34.61);
    assert.equal(recorrido.cierreLon, -58.41);
  } finally {
    process.env.INTEGRACION_API_KEY = prev;
    await server.cerrar();
  }
});

test("GET /api/integracion/estado — recorrido.inicioEn/inicioLat/inicioLon reflejan el punto que arrancó primero, no el último tocado (008, User Story 4, FR-016)", async () => {
  const prev = process.env.INTEGRACION_API_KEY;
  process.env.INTEGRACION_API_KEY = "test-key";
  const store = createIntegracionStore();
  const server = await iniciarServidorDePrueba(undefined, undefined, undefined, store);

  try {
    await fetch(
      `${server.integracionBaseUrl}/recorridos`,
      withApiKey({
        method: "POST",
        body: JSON.stringify({
          source: "oracle-apex",
          recorridos: [
            {
              id: "R-2003",
              token: "tok-2003",
              fleteId: "F-1",
              estado: "activo",
              puntos: [
                { id: "P-1", orden: 1, estado: "pendiente", lat: -34.6, lon: -58.4 },
                { id: "P-2", orden: 2, estado: "pendiente", lat: -34.7, lon: -58.5 },
              ],
            },
          ],
        }),
      }),
    );

    // Arranca y completa P-1 primero, después arranca P-2 — el inicio del
    // RECORRIDO debe seguir siendo el de P-1 (el más temprano), no el de P-2
    // (el último tocado).
    await store.iniciarViaje("tok-2003", { lat: -34.601, lon: -58.401 });
    await store.registrarLlegue("tok-2003");
    await store.registrarDescargaCompleta("tok-2003");
    await store.iniciarViaje("tok-2003", { lat: -34.701, lon: -58.501 });

    const estado = await fetch(`${server.integracionBaseUrl}/estado?recorridoId=R-2003`, withApiKey());
    const estadoBody = await estado.json();
    const recorrido = estadoBody.recorridos[0];
    assert.equal(recorrido.inicioEn, recorrido.puntos.find((p) => p.id === "P-1").inicioEn);
    assert.equal(recorrido.inicioLat, -34.601);
    assert.equal(recorrido.inicioLon, -58.401);
  } finally {
    process.env.INTEGRACION_API_KEY = prev;
    await server.cerrar();
  }
});

test("GET /api/integracion/estado — recorrido.inicioEn es null si todavía no se tocó INICIAR sobre ningún punto (008, User Story 4)", async () => {
  const prev = process.env.INTEGRACION_API_KEY;
  process.env.INTEGRACION_API_KEY = "test-key";
  const store = createIntegracionStore();
  const server = await iniciarServidorDePrueba(undefined, undefined, undefined, store);

  try {
    await fetch(
      `${server.integracionBaseUrl}/recorridos`,
      withApiKey({
        method: "POST",
        body: JSON.stringify({
          source: "oracle-apex",
          recorridos: [{ id: "R-2004", fleteId: "F-1", estado: "activo", puntos: [{ id: "P-1", orden: 1, estado: "pendiente" }] }],
        }),
      }),
    );

    const estado = await fetch(`${server.integracionBaseUrl}/estado?recorridoId=R-2004`, withApiKey());
    const estadoBody = await estado.json();
    const recorrido = estadoBody.recorridos[0];
    assert.equal(recorrido.inicioEn, null);
    assert.equal(recorrido.inicioLat, null);
    assert.equal(recorrido.inicioLon, null);
  } finally {
    process.env.INTEGRACION_API_KEY = prev;
    await server.cerrar();
  }
});

test("POST /api/integracion/recorridos — en modo broker aprovisiona la credencial MQTT permanente del choferId recibido (2026-08-10, FR-013)", async () => {
  const prev = process.env.INTEGRACION_API_KEY;
  const prevCanal = process.env.UBICACION_CANAL_PREFERIDO;
  process.env.INTEGRACION_API_KEY = "test-key";
  process.env.UBICACION_CANAL_PREFERIDO = "broker";
  const store = createIntegracionStore();
  const emqxProvisioning = createFakeEmqxProvisioning();
  const server = await iniciarServidorDePrueba(undefined, undefined, undefined, store, emqxProvisioning);

  try {
    await fetch(
      `${server.integracionBaseUrl}/recorridos`,
      withApiKey({
        method: "POST",
        body: JSON.stringify({
          source: "oracle-apex",
          recorridos: [
            { id: "R-3001", fleteId: "13", choferId: "CH-345", estado: "activo", puntos: [] },
            { id: "R-3002", fleteId: "14", choferId: null, estado: "activo", puntos: [] }, // sin chofer asignado: no debe aprovisionar
          ],
        }),
      }),
    );

    // provisionarCredencialChofer se dispara fire-and-forget (no bloquea la
    // respuesta del POST) — darle un tick al event loop antes de chequear.
    await new Promise((resolve) => setTimeout(resolve, 20));

    assert.ok(emqxProvisioning._tieneCredencialChofer("CH-345"));
    assert.equal(emqxProvisioning._tieneCredencialChofer(null), false);
  } finally {
    process.env.INTEGRACION_API_KEY = prev;
    if (prevCanal === undefined) delete process.env.UBICACION_CANAL_PREFERIDO;
    else process.env.UBICACION_CANAL_PREFERIDO = prevCanal;
    await server.cerrar();
  }
});

test("POST /api/integracion/recorridos — en modo directo (default) no aprovisiona credencial MQTT", async () => {
  const prev = process.env.INTEGRACION_API_KEY;
  const prevCanal = process.env.UBICACION_CANAL_PREFERIDO;
  process.env.INTEGRACION_API_KEY = "test-key";
  delete process.env.UBICACION_CANAL_PREFERIDO;
  const store = createIntegracionStore();
  const emqxProvisioning = createFakeEmqxProvisioning();
  const server = await iniciarServidorDePrueba(undefined, undefined, undefined, store, emqxProvisioning);

  try {
    const res = await fetch(
      `${server.integracionBaseUrl}/recorridos`,
      withApiKey({
        method: "POST",
        body: JSON.stringify({ recorridos: [{ id: "R-3101", fleteId: "13", choferId: "CH-345", estado: "activo", puntos: [] }] }),
      }),
    );
    assert.equal(res.status, 200);
    await new Promise((resolve) => setTimeout(resolve, 20));
    assert.equal(emqxProvisioning._tieneCredencialChofer("CH-345"), false);
  } finally {
    process.env.INTEGRACION_API_KEY = prev;
    if (prevCanal === undefined) delete process.env.UBICACION_CANAL_PREFERIDO;
    else process.env.UBICACION_CANAL_PREFERIDO = prevCanal;
    await server.cerrar();
  }
});

test("POST /api/integracion/recorridos (x2) — el mismo choferId en recorridos distintos reusa la misma credencial permanente (2026-08-10, FR-013)", async () => {
  const prev = process.env.INTEGRACION_API_KEY;
  process.env.INTEGRACION_API_KEY = "test-key";
  const store = createIntegracionStore();
  const emqxProvisioning = createFakeEmqxProvisioning();
  const server = await iniciarServidorDePrueba(undefined, undefined, undefined, store, emqxProvisioning);

  try {
    await fetch(
      `${server.integracionBaseUrl}/recorridos`,
      withApiKey({
        method: "POST",
        body: JSON.stringify({
          source: "oracle-apex",
          recorridos: [{ id: "R-4001", fleteId: "20", choferId: "CH-999", estado: "activo", puntos: [] }],
        }),
      }),
    );
    await new Promise((resolve) => setTimeout(resolve, 20));
    const primera = await emqxProvisioning.provisionarCredencialChofer("CH-999");

    // Segundo recorrido del MISMO chofer, fleteId distinto (ej. viaje nuevo).
    await fetch(
      `${server.integracionBaseUrl}/recorridos`,
      withApiKey({
        method: "POST",
        body: JSON.stringify({
          source: "oracle-apex",
          recorridos: [{ id: "R-4002", fleteId: "21", choferId: "CH-999", estado: "activo", puntos: [] }],
        }),
      }),
    );
    await new Promise((resolve) => setTimeout(resolve, 20));
    const segunda = await emqxProvisioning.provisionarCredencialChofer("CH-999");

    assert.deepEqual(primera, segunda);
  } finally {
    process.env.INTEGRACION_API_KEY = prev;
    await server.cerrar();
  }
});

test("GET /api/integracion/estado — incluye orden por punto (005-chofer-estados-viaje, FR-016)", async () => {
  const prev = process.env.INTEGRACION_API_KEY;
  process.env.INTEGRACION_API_KEY = "test-key";
  const store = createIntegracionStore();
  const server = await iniciarServidorDePrueba(undefined, undefined, undefined, store);

  try {
    store.upsertRecorridos([
      {
        id: "R-ORDEN-1",
        estado: "activo",
        puntos: [
          { id: "p1", orden: 1, estado: "pendiente" },
          { id: "p2", orden: 2, estado: "pendiente" },
        ],
      },
    ]);

    const res = await fetch(`${server.integracionBaseUrl}/estado?recorridoId=R-ORDEN-1`, withApiKey());
    const body = await res.json();
    assert.deepEqual(
      body.recorridos[0].puntos.map((p) => ({ id: p.id, orden: p.orden })),
      [
        { id: "p1", orden: 1 },
        { id: "p2", orden: 2 },
      ],
    );
  } finally {
    process.env.INTEGRACION_API_KEY = prev;
    await server.cerrar();
  }
});

test("GET /api/integracion/estado — 404 para recorrido inexistente", async () => {
  const prev = process.env.INTEGRACION_API_KEY;
  process.env.INTEGRACION_API_KEY = "test-key";
  const store = createIntegracionStore();
  const server = await iniciarServidorDePrueba(undefined, undefined, undefined, store);

  try {
    const res = await fetch(`${server.integracionBaseUrl}/estado?recorridoId=NOPE`, withApiKey());
    assert.equal(res.status, 404);
    const body = await res.json();
    assert.equal(body.error, "recorrido_no_encontrado");
  } finally {
    process.env.INTEGRACION_API_KEY = prev;
    await server.cerrar();
  }
});

// Cierre forzado desde Oracle/APEX cuando el chofer no toca FINALIZAR.
async function conRecorridoActivo(fn) {
  const prev = process.env.INTEGRACION_API_KEY;
  process.env.INTEGRACION_API_KEY = "test-key";
  const store = createIntegracionStore();
  store.upsertRecorridos([
    {
      id: "R-1",
      token: "tok-1",
      fleteId: "F-1",
      choferId: "CH-1",
      estado: "activo",
      puntos: [
        { id: "p1", orden: 1, estado: "completado" },
        { id: "p2", orden: 2, estado: "pendiente" },
      ],
    },
  ]);
  const server = await iniciarServidorDePrueba(store, store, store, store, createFakeEmqxProvisioning());
  try {
    await fn(server);
  } finally {
    process.env.INTEGRACION_API_KEY = prev;
    await server.cerrar();
  }
}

test("POST /api/integracion/recorridos/:id/finalizar — 401 sin credenciales", async () => {
  await conRecorridoActivo(async (server) => {
    const res = await fetch(`${server.integracionBaseUrl}/recorridos/R-1/finalizar`, { method: "POST" });
    assert.equal(res.status, 401);
  });
});

test("POST /api/integracion/recorridos/:id/finalizar — 404 si el recorrido no existe", async () => {
  await conRecorridoActivo(async (server) => {
    const res = await fetch(`${server.integracionBaseUrl}/recorridos/NO-EXISTE/finalizar`, withApiKey({ method: "POST" }));
    assert.equal(res.status, 404);
    assert.deepEqual(await res.json(), { error: "recorrido_no_encontrado" });
  });
});

test("POST /api/integracion/recorridos/:id/finalizar — cierra aunque haya puntos pendientes, sale de activos y queda en historial", async () => {
  await conRecorridoActivo(async (server) => {
    const res = await fetch(`${server.integracionBaseUrl}/recorridos/R-1/finalizar`, withApiKey({ method: "POST" }));
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.estado, "finalizado");
    assert.equal(body.cierreOrigen, "oracle");
    assert.match(body.cierreEn, /-03:00$/);

    const activos = await (await fetch(`${server.centralBaseUrl}/recorridos/activos`)).json();
    assert.equal(activos.recorridos.length, 0);

    const historial = await (await fetch(`${server.centralBaseUrl}/recorridos/historial`)).json();
    assert.equal(historial.recorridos[0].id, "R-1");
    assert.equal(historial.recorridos[0].cierreOrigen, "oracle");
    assert.equal(historial.recorridos[0].cierreLat, null);

    const estado = await (await fetch(`${server.integracionBaseUrl}/estado?recorridoId=R-1`, withApiKey())).json();
    assert.equal(estado.recorridos[0].estado, "finalizado");
    assert.equal(estado.recorridos[0].cierreEn, body.cierreEn);
    assert.equal(estado.recorridos[0].cierreOrigen, "oracle");
  });
});

test("POST /api/integracion/recorridos/:id/finalizar — idempotente: no pisa el cierre original", async () => {
  await conRecorridoActivo(async (server) => {
    const url = `${server.integracionBaseUrl}/recorridos/R-1/finalizar`;
    const primero = await (await fetch(url, withApiKey({ method: "POST" }))).json();
    await new Promise((r) => setTimeout(r, 5));
    const segundo = await (await fetch(url, withApiKey({ method: "POST" }))).json();
    assert.equal(segundo.cierreEn, primero.cierreEn);
  });
});

test("POST /api/integracion/recorridos/:id/finalizar — el chofer ya no puede avanzar el recorrido ni Oracle reactivarlo", async () => {
  await conRecorridoActivo(async (server) => {
    await fetch(`${server.integracionBaseUrl}/recorridos/R-1/finalizar`, withApiKey({ method: "POST" }));

    const iniciar = await fetch(`${server.baseUrl}/tok-1/viaje/iniciar`, { method: "POST" });
    assert.equal(iniciar.status, 409);
    const irPrimero = await fetch(`${server.baseUrl}/tok-1/viaje/ir-primero`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ puntoId: "p2" }),
    });
    assert.equal(irPrimero.status, 409);
    const arribo = await fetch(`${server.baseUrl}/tok-1/puntos/p2/arribo`, { method: "POST" });
    assert.equal(arribo.status, 409);

    const chofer = await (await fetch(`${server.baseUrl}/tok-1`)).json();
    assert.equal(chofer.recorrido.estado, "finalizado");
    assert.equal(chofer.recorrido.puedeCancelar, false);

    // Re-push de Oracle con 'activo' hardcodeado (armar_payload): no lo reabre.
    await fetch(`${server.integracionBaseUrl}/recorridos`, withApiKey({
      method: "POST",
      body: JSON.stringify({ recorridos: [{ id: "R-1", estado: "activo", puntos: [] }] }),
    }));
    const activos = await (await fetch(`${server.centralBaseUrl}/recorridos/activos`)).json();
    assert.equal(activos.recorridos.length, 0);
  });
});
