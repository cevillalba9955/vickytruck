import { describe, expect, it } from "vitest";
import { ahoraLocalIso, formatearHoraLocal, formatearFechaLocal, formatearDuracionMin } from "../../src/services/tiempo.js";

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

describe("tiempo — formatearFechaLocal (009-central-mejora-visual)", () => {
  it("da DD/MM/AAAA de Buenos Aires", () => {
    expect(formatearFechaLocal("2026-08-11T10:35:20.123-03:00")).toBe("11/08/2026");
  });

  it("reconvierte un timestamp Z al día local, no al día UTC", () => {
    // 2026-08-11T23:35 en Argentina (UTC-3) es 2026-08-12T02:35 en UTC.
    expect(formatearFechaLocal("2026-08-12T02:35:00.000Z")).toBe("11/08/2026");
  });
});

describe("tiempo — formatearDuracionMin (009-central-mejora-visual)", () => {
  it("menos de una hora da 'Y min'", () => {
    expect(formatearDuracionMin(45)).toBe("45 min");
  });

  it("una hora o más da 'Xh Ymin'", () => {
    expect(formatearDuracionMin(135)).toBe("2h 15min");
  });

  it("horas exactas no muestran minutos sobrantes en 0", () => {
    expect(formatearDuracionMin(120)).toBe("2h 0min");
  });

  it("null o negativo da '—'", () => {
    expect(formatearDuracionMin(null)).toBe("—");
    expect(formatearDuracionMin(-5)).toBe("—");
  });
});
