import { test } from "node:test";
import assert from "node:assert/strict";
import { createInMemoryRecorridoRepository } from "../helpers/inMemoryRecorridoRepository.js";
import { iniciarServidorDePrueba } from "../helpers/testServer.js";

test("GET /api/recorridos/:token — 200 con puntos ordenados y progreso", async () => {
  const repository = createInMemoryRecorridoRepository([
    {
      token: "tok-valido",
      estado: "activo",
      puntos: [
        { id: "p2", orden: 2, latitud: -34.6, longitud: -58.4, estado: "pendiente" },
        { id: "p1", orden: 1, latitud: -34.5, longitud: -58.3, estado: "completado" },
      ],
    },
  ]);
  const server = await iniciarServidorDePrueba(repository);

  try {
    const res = await fetch(`${server.baseUrl}/tok-valido`);
    assert.equal(res.status, 200);
    const body = await res.json();

    assert.equal(body.recorrido.estado, "activo");
    assert.equal(body.puntos.length, 2);
    // Orden por `orden`, no por orden de inserción (FR-003)
    assert.deepEqual(
      body.puntos.map((p) => p.orden),
      [1, 2],
    );
    assert.equal(body.puntos[0].totalPuntos, 2);
    assert.deepEqual(body.progreso, { pendientes: 1, arribados: 0, completados: 1 });
  } finally {
    await server.cerrar();
  }
});

test("GET /api/recorridos/:token — expone cliente/dirección/rango horario/notas por punto, y NUNCA remitoIds (005-chofer-estados-viaje, FR-002/FR-003)", async () => {
  const repository = createInMemoryRecorridoRepository([
    {
      token: "tok-info",
      estado: "activo",
      puntos: [
        {
          id: "p1",
          orden: 1,
          latitud: -34.6,
          longitud: -58.4,
          estado: "pendiente",
          cliente: "Distribuidora Sur SRL",
          direccion: "Av. Rivadavia 1234",
          rangoHorario: "09:00–12:00",
          notasEntrega: "Tocar timbre de depósito",
          // Simula un escenario donde la capa de repositorio filtrara mal y
          // remitoIds se colara hasta acá: serializePunto() en recorrido.js
          // MUST seguir sin exponerlo (allow-list explícito, no un spread).
          remitoIds: ["R-1", "R-2"],
        },
        { id: "p2", orden: 2, latitud: -34.7, longitud: -58.5, estado: "pendiente" },
      ],
    },
  ]);
  const server = await iniciarServidorDePrueba(repository);

  try {
    const res = await fetch(`${server.baseUrl}/tok-info`);
    const body = await res.json();
    const bodyTexto = JSON.stringify(body);

    assert.equal(body.puntos[0].cliente, "Distribuidora Sur SRL");
    assert.equal(body.puntos[0].direccion, "Av. Rivadavia 1234");
    assert.equal(body.puntos[0].rangoHorario, "09:00–12:00");
    assert.equal(body.puntos[0].notasEntrega, "Tocar timbre de depósito");

    // p2 no trae campos informativos: deben omitirse con normalidad (FR-004).
    assert.equal(body.puntos[1].cliente, null);

    assert.ok(!("remitoIds" in body.puntos[0]), "remitoIds no debe existir como clave en la respuesta del chofer");
    assert.ok(!bodyTexto.includes("remito"), "ningún rastro de 'remito' en el JSON completo servido al chofer");
  } finally {
    await server.cerrar();
  }
});

test("GET /api/recorridos/:token — expone recorrido.mqtt derivado del fleteId cuando EMQX está configurado", async () => {
  const prevUrl = process.env.EMQX_WSS_URL;
  const prevSecret = process.env.EMQX_TOKEN_PASSWORD_SECRET;
  process.env.EMQX_WSS_URL = "wss://broker-test.emqxsl.com:8084/mqtt";
  process.env.EMQX_TOKEN_PASSWORD_SECRET = "secreto-test";

  const repository = createInMemoryRecorridoRepository([
    {
      token: "tok-con-flete",
      fleteId: "13",
      choferId: "CH-345",
      estado: "activo",
      puntos: [{ id: "p1", orden: 1, latitud: 0, longitud: 0, estado: "pendiente" }],
    },
  ]);
  const server = await iniciarServidorDePrueba(repository);

  try {
    const res = await fetch(`${server.baseUrl}/tok-con-flete`);
    const body = await res.json();

    // El topic sigue siendo por-fleteId (FR-004, sin cambios); la
    // credencial (username/password) ahora deriva de choferId, no de
    // fleteId (research.md Decisión 8).
    assert.deepEqual(body.recorrido.mqtt, {
      url: "wss://broker-test.emqxsl.com:8084/mqtt",
      username: "chofer-CH-345",
      password: body.recorrido.mqtt.password, // determinística, no se hardcodea el hash acá
      topic: "chofer/13/ubicacion",
    });
    assert.ok(body.recorrido.mqtt.password.length > 0);
  } finally {
    if (prevUrl === undefined) delete process.env.EMQX_WSS_URL;
    else process.env.EMQX_WSS_URL = prevUrl;
    if (prevSecret === undefined) delete process.env.EMQX_TOKEN_PASSWORD_SECRET;
    else process.env.EMQX_TOKEN_PASSWORD_SECRET = prevSecret;
    await server.cerrar();
  }
});

test("GET /api/recorridos/:token — recorrido.mqtt es null sin fleteId o sin EMQX configurado", async () => {
  const prevUrl = process.env.EMQX_WSS_URL;
  delete process.env.EMQX_WSS_URL;

  const repository = createInMemoryRecorridoRepository([
    { token: "tok-sin-flete", fleteId: null, estado: "activo", puntos: [{ id: "p1", orden: 1, latitud: 0, longitud: 0, estado: "pendiente" }] },
  ]);
  const server = await iniciarServidorDePrueba(repository);

  try {
    const res = await fetch(`${server.baseUrl}/tok-sin-flete`);
    const body = await res.json();
    assert.equal(body.recorrido.mqtt, null);
  } finally {
    if (prevUrl === undefined) delete process.env.EMQX_WSS_URL;
    else process.env.EMQX_WSS_URL = prevUrl;
    await server.cerrar();
  }
});

test("GET /api/recorridos/:token — recorrido.mqtt es null con fleteId pero sin choferId todavía (2026-08-10, FR-013)", async () => {
  const prevUrl = process.env.EMQX_WSS_URL;
  const prevSecret = process.env.EMQX_TOKEN_PASSWORD_SECRET;
  process.env.EMQX_WSS_URL = "wss://broker-test.emqxsl.com:8084/mqtt";
  process.env.EMQX_TOKEN_PASSWORD_SECRET = "secreto-test";

  const repository = createInMemoryRecorridoRepository([
    {
      token: "tok-sin-chofer",
      fleteId: "13",
      choferId: null,
      estado: "activo",
      puntos: [{ id: "p1", orden: 1, latitud: 0, longitud: 0, estado: "pendiente" }],
    },
  ]);
  const server = await iniciarServidorDePrueba(repository);

  try {
    const res = await fetch(`${server.baseUrl}/tok-sin-chofer`);
    const body = await res.json();
    assert.equal(body.recorrido.mqtt, null);
  } finally {
    if (prevUrl === undefined) delete process.env.EMQX_WSS_URL;
    else process.env.EMQX_WSS_URL = prevUrl;
    if (prevSecret === undefined) delete process.env.EMQX_TOKEN_PASSWORD_SECRET;
    else process.env.EMQX_TOKEN_PASSWORD_SECRET = prevSecret;
    await server.cerrar();
  }
});

test("GET /api/recorridos/:token — 404 con token inválido", async () => {
  const repository = createInMemoryRecorridoRepository([
    { token: "tok-valido", puntos: [{ id: "p1", orden: 1, latitud: 0, longitud: 0, estado: "pendiente" }] },
  ]);
  const server = await iniciarServidorDePrueba(repository);

  try {
    const res = await fetch(`${server.baseUrl}/tok-inexistente`);
    assert.equal(res.status, 404);
    const body = await res.json();
    assert.equal(body.error, "enlace_invalido");
  } finally {
    await server.cerrar();
  }
});
