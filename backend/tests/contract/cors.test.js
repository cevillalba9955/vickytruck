import { test } from "node:test";
import assert from "node:assert/strict";
import { iniciarServidorDePrueba } from "../helpers/testServer.js";
import { createIntegracionStore } from "../../src/state/integracionStore.js";

test("CORS — refleja Access-Control-Allow-Origin para un origen permitido", async () => {
  const prev = process.env.CORS_ORIGINS;
  process.env.CORS_ORIGINS = "https://vickytruck.cevillalba.workers.dev";
  const store = createIntegracionStore();
  const server = await iniciarServidorDePrueba(store, store, undefined, store);

  try {
    const res = await fetch(`${server.centralBaseUrl}/recorridos/activos`, {
      headers: { Origin: "https://vickytruck.cevillalba.workers.dev" },
    });
    assert.equal(res.headers.get("access-control-allow-origin"), "https://vickytruck.cevillalba.workers.dev");
  } finally {
    process.env.CORS_ORIGINS = prev;
    await server.cerrar();
  }
});

test("CORS — no agrega el header para un origen no permitido", async () => {
  const prev = process.env.CORS_ORIGINS;
  process.env.CORS_ORIGINS = "https://vickytruck.cevillalba.workers.dev";
  const store = createIntegracionStore();
  const server = await iniciarServidorDePrueba(store, store, undefined, store);

  try {
    const res = await fetch(`${server.centralBaseUrl}/recorridos/activos`, {
      headers: { Origin: "https://sitio-cualquiera.com" },
    });
    assert.equal(res.headers.get("access-control-allow-origin"), null);
  } finally {
    process.env.CORS_ORIGINS = prev;
    await server.cerrar();
  }
});

test("CORS — responde 204 a un preflight OPTIONS", async () => {
  const prev = process.env.CORS_ORIGINS;
  process.env.CORS_ORIGINS = "https://vickytruck.cevillalba.workers.dev";
  const store = createIntegracionStore();
  const server = await iniciarServidorDePrueba(store, store, undefined, store);

  try {
    const res = await fetch(`${server.centralBaseUrl}/recorridos/activos`, {
      method: "OPTIONS",
      headers: {
        Origin: "https://vickytruck.cevillalba.workers.dev",
        "Access-Control-Request-Method": "GET",
      },
    });
    assert.equal(res.status, 204);
  } finally {
    process.env.CORS_ORIGINS = prev;
    await server.cerrar();
  }
});
