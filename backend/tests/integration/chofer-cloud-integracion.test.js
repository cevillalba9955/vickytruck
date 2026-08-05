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

test("loop completo: Oracle/APEX -> chofer cloud -> Oracle/APEX, sin que el backend toque Oracle", async () => {
  const prev = process.env.INTEGRACION_API_KEY;
  process.env.INTEGRACION_API_KEY = "test-key";

  const store = createIntegracionStore();
  // Mismo wiring que server.js: el store de integración también sirve de
  // repositorio para /api/recorridos.
  const server = await iniciarServidorDePrueba(store, undefined, undefined, store);

  try {
    // 1. Oracle/APEX publica el recorrido (con el token que usará el chofer).
    const push = await fetch(
      `${server.integracionBaseUrl}/recorridos`,
      withApiKey({
        method: "POST",
        body: JSON.stringify({
          source: "oracle-apex",
          recorridos: [
            {
              id: "R-2001",
              token: "tok-e2e",
              fleteId: "F-9",
              estado: "activo",
              puntos: [{ id: "p1", orden: 1, estado: "pendiente", lat: -34.6, lon: -58.4 }],
            },
          ],
        }),
      }),
    );
    assert.equal(push.status, 200);

    // 2. El chofer abre su enlace y ve el recorrido.
    const detalle = await (await fetch(`${server.baseUrl}/tok-e2e`)).json();
    assert.equal(detalle.puntos.length, 1);
    assert.equal(detalle.puntos[0].estado, "pendiente");

    // 3. El chofer marca arribo y luego descarga.
    const arribo = await fetch(`${server.baseUrl}/tok-e2e/puntos/p1/arribo`, { method: "POST" });
    assert.equal(arribo.status, 200);
    const descarga = await fetch(`${server.baseUrl}/tok-e2e/puntos/p1/descarga`, { method: "POST" });
    assert.equal(descarga.status, 200);

    // 4. Oracle/APEX consulta el estado (polling) y ve la entrega completada,
    // sin que el backend haya abierto ninguna conexión hacia Oracle.
    const estado = await fetch(`${server.integracionBaseUrl}/estado?recorridoId=R-2001`, withApiKey());
    const estadoBody = await estado.json();
    assert.equal(estadoBody.recorridos[0].puntos[0].estado, "completado");
    assert.ok(estadoBody.recorridos[0].puntos[0].descargaEn);
  } finally {
    process.env.INTEGRACION_API_KEY = prev;
    await server.cerrar();
  }
});
