import { test } from "node:test";
import assert from "node:assert/strict";
import { canalUbicacionPreferido } from "../../src/config/ubicacionCanal.js";

function conVariable(valor, fn) {
  const prev = process.env.UBICACION_CANAL_PREFERIDO;
  if (valor === undefined) delete process.env.UBICACION_CANAL_PREFERIDO;
  else process.env.UBICACION_CANAL_PREFERIDO = valor;
  try {
    fn();
  } finally {
    if (prev === undefined) delete process.env.UBICACION_CANAL_PREFERIDO;
    else process.env.UBICACION_CANAL_PREFERIDO = prev;
  }
}

test("canalUbicacionPreferido — 'directo' cuando la variable no está seteada", () => {
  conVariable(undefined, () => {
    assert.equal(canalUbicacionPreferido(), "directo");
  });
});

test("canalUbicacionPreferido — 'broker' cuando la variable vale exactamente 'broker'", () => {
  conVariable("broker", () => {
    assert.equal(canalUbicacionPreferido(), "broker");
  });
});

test("canalUbicacionPreferido — case-insensitive ('BROKER', 'Broker')", () => {
  conVariable("BROKER", () => {
    assert.equal(canalUbicacionPreferido(), "broker");
  });
  conVariable("Broker", () => {
    assert.equal(canalUbicacionPreferido(), "broker");
  });
});

test("canalUbicacionPreferido — valor inválido cae a 'directo'", () => {
  conVariable("otra-cosa", () => {
    assert.equal(canalUbicacionPreferido(), "directo");
  });
});

test("canalUbicacionPreferido — string vacío cae a 'directo'", () => {
  conVariable("", () => {
    assert.equal(canalUbicacionPreferido(), "directo");
  });
});

test("canalUbicacionPreferido — 'directo' explícito da 'directo'", () => {
  conVariable("directo", () => {
    assert.equal(canalUbicacionPreferido(), "directo");
  });
});
