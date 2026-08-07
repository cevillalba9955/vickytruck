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

test("loop completo: Oracle/APEX -> Central (solo lectura), sin que el backend toque Oracle", async () => {
  const prev = process.env.INTEGRACION_API_KEY;
  process.env.INTEGRACION_API_KEY = "test-key";

  const store = createIntegracionStore();
  // Mismo wiring que server.js: una sola instancia sirve a las 3 rutas.
  const server = await iniciarServidorDePrueba(store, store, undefined, store);

  try {
    // 1. Oracle/APEX publica el recorrido ya asignado (con nombre de flete).
    const push = await fetch(
      `${server.integracionBaseUrl}/recorridos`,
      withApiKey({
        method: "POST",
        body: JSON.stringify({
          source: "oracle-apex",
          recorridos: [
            {
              id: "R-3001",
              token: "tok-central-e2e",
              fleteId: "F-77",
              fleteNombre: "Roberto Gómez",
              estado: "activo",
              puntos: [
                { id: "p1", orden: 1, estado: "pendiente", lat: -34.61, lon: -58.41 },
                { id: "p2", orden: 2, estado: "pendiente", lat: -34.62, lon: -58.42 },
              ],
            },
          ],
        }),
      }),
    );
    assert.equal(push.status, 200);

    // 2. Central lo ve en el monitoreo, con nombre de flete.
    const activos = await (await fetch(`${server.centralBaseUrl}/recorridos/activos`)).json();
    assert.equal(activos.recorridos.length, 1);
    assert.deepEqual(activos.recorridos[0].flete, { id: "F-77", nombre: "Roberto Gómez" });

    // 3. El chofer marca arribo.
    const arribo = await fetch(`${server.baseUrl}/tok-central-e2e/puntos/p1/arribo`, { method: "POST" });
    assert.equal(arribo.status, 200);

    // 4. Central ve el progreso actualizado sin haber tocado Oracle.
    const detalle = await (await fetch(`${server.centralBaseUrl}/recorridos/R-3001`)).json();
    assert.equal(detalle.puntos[0].estado, "arribado");

    // 5. El detalle incluye lat/lon del punto (004-mapa-seguimiento-central,
    // FR-006) — topología fija, no el GPS de auditoría del evento arribo.
    assert.equal(detalle.puntos[0].lat, -34.61);
    assert.equal(detalle.puntos[0].lon, -58.41);

    // 6. Central ve el estado de viaje del chofer en (casi) tiempo real, vía
    // el mismo polling (005-chofer-estados-viaje, FR-021). p1 ya está
    // "arribado" (paso 3), así que INICIAR activa p2, el único pendiente.
    await fetch(`${server.baseUrl}/tok-central-e2e/viaje/iniciar`, { method: "POST" });
    const activosTrasIniciar = await (await fetch(`${server.centralBaseUrl}/recorridos/activos`)).json();
    assert.equal(activosTrasIniciar.recorridos[0].viajeEstado, "manejando");
    assert.equal(activosTrasIniciar.recorridos[0].puntoActivoId, "p2");
  } finally {
    process.env.INTEGRACION_API_KEY = prev;
    await server.cerrar();
  }
});
