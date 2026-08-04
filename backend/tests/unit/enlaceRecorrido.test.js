import { test } from "node:test";
import assert from "node:assert/strict";
import { createInMemoryRecorridoRepository } from "../helpers/inMemoryRecorridoRepository.js";
import { createFakeEmqxProvisioning } from "../helpers/fakeEmqxProvisioning.js";
import { createEnlaceRecorrido } from "../../src/services/enlaceRecorrido.js";

function decodificar(url) {
  const marcador = "/#/r/";
  const idx = url.indexOf(marcador);
  assert.ok(idx !== -1, `la url no tiene el fragmento esperado: ${url}`);
  const b64url = url.slice(idx + marcador.length);
  const b64 = b64url.replace(/-/g, "+").replace(/_/g, "/");
  const padded = b64 + "=".repeat((4 - (b64.length % 4)) % 4);
  return JSON.parse(Buffer.from(padded, "base64").toString("utf8"));
}

function repoConToken(token) {
  return createInMemoryRecorridoRepository([
    {
      token,
      estado: "activo",
      puntos: [
        { id: "p2", orden: 2, latitud: -34.6, longitud: -58.4, estado: "pendiente" },
        { id: "p1", orden: 1, latitud: -34.5, longitud: -58.3, estado: "completado" },
      ],
    },
  ]);
}

test("construirEnlace — devuelve payload con recorrido.mqtt, progreso y puntos, y una url con prefijo frontendBaseUrl + /#/r/", async () => {
  process.env.EMQX_WSS_URL = "wss://broker.example:8084/mqtt";
  const enlaceRecorrido = createEnlaceRecorrido({
    recorridoRepository: repoConToken("tok-1"),
    emqxProvisioning: createFakeEmqxProvisioning(),
    frontendBaseUrl: "https://chofer.example",
  });

  const { payload, url } = await enlaceRecorrido.construirEnlace("tok-1");

  assert.ok(url.startsWith("https://chofer.example/#/r/"));
  assert.equal(payload.recorrido.estado, "activo");
  assert.equal(payload.recorrido.mqtt.username, "tok-1");
  assert.equal(payload.recorrido.mqtt.password, "fake-pass-tok-1");
  assert.equal(payload.recorrido.mqtt.ubicacionTopic, "vickytruck/fletes/tok-1/ubicacion");
  assert.equal(payload.recorrido.mqtt.eventosTopic, "vickytruck/fletes/tok-1/eventos");
  assert.equal(payload.progreso.completados, 1);
  assert.equal(payload.puntos.length, 2);
  assert.equal(payload.puntos[0].id, "p1"); // ordenado por `orden`
  assert.equal(payload.puntos[0].totalPuntos, 2);

  // JSON.stringify omite claves en `undefined` (ej. arriboEn/descargaEn de un
  // punto "pendiente"); se normaliza `payload` por el mismo camino antes de
  // comparar, ya que eso es justamente lo que viaja en la URL.
  assert.deepEqual(decodificar(url), JSON.parse(JSON.stringify(payload)));
});

test("construirEnlace — token inexistente devuelve null (sin exponer error interno)", async () => {
  const enlaceRecorrido = createEnlaceRecorrido({
    recorridoRepository: repoConToken("tok-1"),
    emqxProvisioning: createFakeEmqxProvisioning(),
    frontendBaseUrl: "https://chofer.example",
  });

  assert.equal(await enlaceRecorrido.construirEnlace("no-existe"), null);
});

test("construirEnlace — pedido dos veces para el mismo token devuelve la misma url (idempotencia, FR-006)", async () => {
  const enlaceRecorrido = createEnlaceRecorrido({
    recorridoRepository: repoConToken("tok-1"),
    emqxProvisioning: createFakeEmqxProvisioning(),
    frontendBaseUrl: "https://chofer.example",
  });

  const primera = await enlaceRecorrido.construirEnlace("tok-1");
  const segunda = await enlaceRecorrido.construirEnlace("tok-1");
  assert.equal(primera.url, segunda.url);
});

test("construirEnlace — lanza un error claro si falta frontendBaseUrl", async () => {
  delete process.env.CHOFER_FRONTEND_URL;
  const enlaceRecorrido = createEnlaceRecorrido({
    recorridoRepository: repoConToken("tok-1"),
    emqxProvisioning: createFakeEmqxProvisioning(),
  });

  await assert.rejects(() => enlaceRecorrido.construirEnlace("tok-1"), /CHOFER_FRONTEND_URL/);
});
