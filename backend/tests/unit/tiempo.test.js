import { test } from "node:test";
import assert from "node:assert/strict";
import { ahoraLocalIso, formatearHoraLocal } from "../../src/util/tiempo.js";

test("ahoraLocalIso — siempre termina en -03:00, nunca en Z", () => {
  const iso = ahoraLocalIso(new Date("2026-08-11T13:35:20.123Z"));

  assert.match(iso, /-03:00$/);
  assert.doesNotMatch(iso, /Z$/);
});

test("ahoraLocalIso — la hora de pared es 3 horas menos que el UTC de entrada", () => {
  const iso = ahoraLocalIso(new Date("2026-08-11T13:35:20.123Z"));

  assert.equal(iso, "2026-08-11T10:35:20.123-03:00");
});

test("formatearHoraLocal — timestamp nuevo (-03:00) da HH:MM:SS de dos dígitos", () => {
  assert.equal(formatearHoraLocal("2026-08-11T10:35:20.123-03:00"), "10:35:20");
});

test("formatearHoraLocal — timestamp histórico (Z, UTC) representando el mismo instante da el mismo resultado", () => {
  assert.equal(formatearHoraLocal("2026-08-11T13:35:20.123Z"), "10:35:20");
});

test("formatearHoraLocal — medianoche se muestra como 00:00:00, no 24:00:00", () => {
  assert.equal(formatearHoraLocal("2026-08-11T03:00:00.000Z"), "00:00:00");
});
