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

test("US2 — GET /api/integracion/estado pagina resultados cuando no hay recorridoId", async () => {
  const prev = process.env.INTEGRACION_API_KEY;
  process.env.INTEGRACION_API_KEY = "test-key";

  const store = createIntegracionStore();
  store.upsertRecorridos([
    { id: "R-1", estado: "activo", puntos: [] },
    { id: "R-2", estado: "activo", puntos: [] },
    { id: "R-3", estado: "activo", puntos: [] },
  ]);

  const server = await iniciarServidorDePrueba(undefined, undefined, undefined, store);
  try {
    const res = await fetch(`${server.integracionBaseUrl}/estado?limit=2&offset=1`, withApiKey());
    assert.equal(res.status, 200);

    const body = await res.json();
    assert.equal(body.recorridos.length, 2);
    assert.equal(body.paginacion.total, 3);
    assert.equal(body.paginacion.limit, 2);
    assert.equal(body.paginacion.offset, 1);
    assert.equal(body.paginacion.hasNext, false);
  } finally {
    process.env.INTEGRACION_API_KEY = prev;
    await server.cerrar();
  }
});
