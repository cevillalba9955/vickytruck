import { describe, expect, it } from "vitest";
import { ahoraLocalIso, formatearHoraLocal } from "../../src/services/tiempo.js";

describe("tiempo — ahoraLocalIso (006-normalizar-formato-horario, FR-002/FR-007)", () => {
  it("siempre termina en -03:00, nunca en Z", () => {
    const iso = ahoraLocalIso(new Date("2026-08-11T13:35:20.123Z"));
    expect(iso).toMatch(/-03:00$/);
    expect(iso).not.toMatch(/Z$/);
  });

  it("la hora de pared es 3 horas menos que el UTC de entrada", () => {
    expect(ahoraLocalIso(new Date("2026-08-11T13:35:20.123Z"))).toBe("2026-08-11T10:35:20.123-03:00");
  });
});

describe("tiempo — formatearHoraLocal (FR-001)", () => {
  it("timestamp nuevo (-03:00) da HH:MM:SS de dos dígitos", () => {
    expect(formatearHoraLocal("2026-08-11T10:35:20.123-03:00")).toBe("10:35:20");
  });

  it("timestamp histórico (Z, UTC) representando el mismo instante da el mismo resultado", () => {
    expect(formatearHoraLocal("2026-08-11T13:35:20.123Z")).toBe("10:35:20");
  });
});
