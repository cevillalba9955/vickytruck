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

test("POST /api/integracion/recorridos — aprovisiona la credencial MQTT permanente del choferId recibido (2026-08-10, FR-013)", async () => {
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
