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
              choferId: "CH-9",
              choferNombre: "Diego Fernández",
              estado: "activo",
              puntos: [
                { id: "p1", orden: 1, estado: "pendiente", lat: -34.61, lon: -58.41, cliente: "Almacén Centro" },
                { id: "p2", orden: 2, estado: "pendiente", lat: -34.62, lon: -58.42, cliente: "Supermercado Sur" },
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
    // 009-central-mejora-visual: Central ve el chofer, distinto del flete.
    assert.deepEqual(activos.recorridos[0].chofer, { id: "CH-9", nombre: "Diego Fernández" });

    // 3. El chofer marca arribo, con su posición GPS del momento.
    const arribo = await fetch(`${server.baseUrl}/tok-central-e2e/puntos/p1/arribo`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ lat: -34.6101, lon: -58.4101 }),
    });
    assert.equal(arribo.status, 200);

    // 4. Central ve el progreso actualizado sin haber tocado Oracle.
    const detalle = await (await fetch(`${server.centralBaseUrl}/recorridos/R-3001`)).json();
    assert.equal(detalle.puntos[0].estado, "arribado");

    // 5. El detalle incluye lat/lon del punto (004-mapa-seguimiento-central,
    // FR-006) — topología fija, no el GPS de auditoría del evento arribo.
    assert.equal(detalle.puntos[0].lat, -34.61);
    assert.equal(detalle.puntos[0].lon, -58.41);

    // 5b. También incluye el GPS de auditoría capturado al marcar arribo
    // (009-central-mejora-visual) y el flete/chofer del recorrido, para el
    // encabezado y la grilla de RecorridoDetalle.
    assert.equal(detalle.puntos[0].arriboLat, -34.6101);
    assert.equal(detalle.puntos[0].arriboLon, -58.4101);
    assert.deepEqual(detalle.recorrido.flete, { id: "F-77", nombre: "Roberto Gómez" });
    assert.deepEqual(detalle.recorrido.chofer, { id: "CH-9", nombre: "Diego Fernández" });

    // 6. Central ve el estado de viaje del chofer en (casi) tiempo real, vía
    // el mismo polling (005-chofer-estados-viaje, FR-021). p1 ya está
    // "arribado" (paso 3), así que INICIAR activa p2, el único pendiente.
    await fetch(`${server.baseUrl}/tok-central-e2e/viaje/iniciar`, { method: "POST" });
    const activosTrasIniciar = await (await fetch(`${server.centralBaseUrl}/recorridos/activos`)).json();
    assert.equal(activosTrasIniciar.recorridos[0].viajeEstado, "manejando");
    assert.equal(activosTrasIniciar.recorridos[0].puntoActivoId, "p2");
    // 009-central-mejora-visual: Central ve el cliente del punto activo, no
    // solo su id, para poder mostrarlo en la columna "Punto" de Monitoreo.
    assert.deepEqual(activosTrasIniciar.recorridos[0].puntoActivo, { id: "p2", orden: 2, cliente: "Supermercado Sur" });
  } finally {
    process.env.INTEGRACION_API_KEY = prev;
    await server.cerrar();
  }
});

test("Oracle/APEX puede enviar puntoSalida y color (010-mapa-central-unificado, FR-002a/FR-006/FR-008); puntoSalidaDefault siempre presente", async () => {
  const prev = process.env.INTEGRACION_API_KEY;
  process.env.INTEGRACION_API_KEY = "test-key";

  const store = createIntegracionStore();
  const server = await iniciarServidorDePrueba(store, store, undefined, store);

  try {
    // Sin ningún recorrido activo todavía, puntoSalidaDefault ya está presente.
    const activosVacio = await (await fetch(`${server.centralBaseUrl}/recorridos/activos`)).json();
    assert.deepEqual(activosVacio.recorridos, []);
    assert.deepEqual(activosVacio.puntoSalidaDefault, { lat: -34.8097527, lon: -58.4574414 });

    const push = await fetch(
      `${server.integracionBaseUrl}/recorridos`,
      withApiKey({
        method: "POST",
        body: JSON.stringify({
          source: "oracle-apex",
          recorridos: [
            {
              id: "R-3002",
              fleteId: "F-78",
              fleteNombre: "Camión 78",
              estado: "activo",
              puntoSalida: { lat: -34.55, lon: -58.35 },
              color: "#8e44ad",
              puntos: [{ id: "p1", orden: 1, estado: "pendiente", lat: -34.61, lon: -58.41 }],
            },
          ],
        }),
      }),
    );
    assert.equal(push.status, 200);

    const activos = await (await fetch(`${server.centralBaseUrl}/recorridos/activos`)).json();
    assert.deepEqual(activos.recorridos[0].puntoSalida, { lat: -34.55, lon: -58.35 });
    assert.equal(activos.recorridos[0].color, "#8e44ad");
    // puntoSalidaDefault no cambia por tener recorridos activos con origen propio.
    assert.deepEqual(activos.puntoSalidaDefault, { lat: -34.8097527, lon: -58.4574414 });
  } finally {
    process.env.INTEGRACION_API_KEY = prev;
    await server.cerrar();
  }
});
