import { test } from "node:test";
import assert from "node:assert/strict";
import { iniciarServidorDePrueba } from "../helpers/testServer.js";
import { createIntegracionStore } from "../../src/state/integracionStore.js";

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

test("US1 — reintento idempotente de upsert no duplica recorridos", async () => {
  const prev = process.env.INTEGRACION_API_KEY;
  process.env.INTEGRACION_API_KEY = "test-key";

  const store = createIntegracionStore();
  const server = await iniciarServidorDePrueba(undefined, undefined, undefined, store);

  const payload = {
    source: "oracle-apex",
    recorridos: [
      {
        id: "R-1001",
        fleteId: "F-11",
        estado: "activo",
        updatedAt: "2026-08-05T10:00:00Z",
        puntos: [{ id: "P-1", orden: 1, estado: "pendiente", lat: -34.6, lon: -58.4 }],
      },
    ],
  };

  try {
    const first = await fetch(
      `${server.integracionBaseUrl}/recorridos`,
      withApiKey({ method: "POST", body: JSON.stringify(payload) }),
    );
    assert.equal(first.status, 200);

    const retry = await fetch(
      `${server.integracionBaseUrl}/recorridos`,
      withApiKey({ method: "POST", body: JSON.stringify(payload) }),
    );
    assert.equal(retry.status, 200);

    const estado = await fetch(`${server.integracionBaseUrl}/estado`, withApiKey());
    assert.equal(estado.status, 200);
    const estadoBody = await estado.json();
    assert.equal(estadoBody.recorridos.length, 1);
    assert.equal(estadoBody.recorridos[0].id, "R-1001");
  } finally {
    process.env.INTEGRACION_API_KEY = prev;
    await server.cerrar();
  }
});
