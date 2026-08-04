import { test } from "node:test";
import assert from "node:assert/strict";
import { createVinculoDispositivo } from "../../src/state/vinculoDispositivo.js";

test("vinculoDispositivo — primer registrarConexion vincula el token al clientId", () => {
  const vinculo = createVinculoDispositivo();
  const resultado = vinculo.registrarConexion("tok-1", "dev-a");
  assert.equal(resultado.accion, "vinculado");
});

test("vinculoDispositivo — mismo clientId en llamadas posteriores no dispara expulsión (reconexión legítima)", () => {
  const vinculo = createVinculoDispositivo();
  vinculo.registrarConexion("tok-1", "dev-a");
  const resultado = vinculo.registrarConexion("tok-1", "dev-a");
  assert.equal(resultado.accion, "reconexion");
});

test("vinculoDispositivo — clientId distinto dispara expulsión, sin reemplazar el vínculo original", () => {
  const vinculo = createVinculoDispositivo();
  vinculo.registrarConexion("tok-1", "dev-a");
  const resultado = vinculo.registrarConexion("tok-1", "dev-b");
  assert.equal(resultado.accion, "expulsar");
  assert.equal(resultado.clientId, "dev-b");

  // El vínculo original sigue siendo dev-a: una reconexión de dev-a después
  // del intento de dev-b sigue tratándose como legítima.
  const siguiente = vinculo.registrarConexion("tok-1", "dev-a");
  assert.equal(siguiente.accion, "reconexion");
});

test("vinculoDispositivo — liberar limpia el vínculo y un registrarConexion posterior vuelve a vincular como primero", () => {
  const vinculo = createVinculoDispositivo();
  vinculo.registrarConexion("tok-1", "dev-a");
  vinculo.liberar("tok-1");

  const resultado = vinculo.registrarConexion("tok-1", "dev-b");
  assert.equal(resultado.accion, "vinculado");
});

test("vinculoDispositivo — tokens distintos no interfieren entre sí", () => {
  const vinculo = createVinculoDispositivo();
  vinculo.registrarConexion("tok-1", "dev-a");
  const resultado = vinculo.registrarConexion("tok-2", "dev-a");
  assert.equal(resultado.accion, "vinculado");
});

test("vinculoDispositivo — liberar un token sin vínculo previo es un no-op", () => {
  const vinculo = createVinculoDispositivo();
  assert.doesNotThrow(() => vinculo.liberar("no-existe"));
});
