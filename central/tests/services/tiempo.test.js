import { describe, expect, it } from "vitest";
import {
  ahoraLocalIso,
  formatearHoraLocal,
  formatearFechaLocal,
  formatearDuracionMin,
  primerEventoIso,
  primerEventoConUbicacion,
  calcularTiempoTotalMin,
} from "../../src/services/tiempo.js";

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

describe("tiempo — primerEventoIso (009-central-mejora-visual)", () => {
  it("elige el inicioEn más temprano entre los puntos", () => {
    const puntos = [
      { inicioEn: "2026-08-13T09:00:00-03:00" },
      { inicioEn: "2026-08-13T08:00:00-03:00" },
      { inicioEn: "2026-08-13T10:00:00-03:00" },
    ];
    expect(primerEventoIso(puntos)).toBe("2026-08-13T08:00:00-03:00");
  });

  it("si ningún punto tiene inicioEn, cae al arriboEn más temprano", () => {
    const puntos = [{ arriboEn: "2026-08-13T09:00:00-03:00" }, { arriboEn: "2026-08-13T08:30:00-03:00" }];
    expect(primerEventoIso(puntos)).toBe("2026-08-13T08:30:00-03:00");
  });

  it("sin ningún evento registrado, da null", () => {
    expect(primerEventoIso([{ estado: "pendiente" }])).toBe(null);
  });
});

describe("tiempo — primerEventoConUbicacion (008, User Story 3, 2026-08-25)", () => {
  it("devuelve iso/lat/lon del punto con inicioEn más temprano", () => {
    const puntos = [
      { inicioEn: "2026-08-13T09:00:00-03:00", inicioLat: -34.7, inicioLon: -58.5 },
      { inicioEn: "2026-08-13T08:00:00-03:00", inicioLat: -34.6, inicioLon: -58.4 },
    ];
    expect(primerEventoConUbicacion(puntos)).toEqual({ iso: "2026-08-13T08:00:00-03:00", lat: -34.6, lon: -58.4 });
  });

  it("lat/lon en null si el punto no tiene ubicación de inicio registrada", () => {
    const puntos = [{ inicioEn: "2026-08-13T08:00:00-03:00" }];
    expect(primerEventoConUbicacion(puntos)).toEqual({ iso: "2026-08-13T08:00:00-03:00", lat: null, lon: null });
  });

  it("si ningún punto tiene inicioEn, cae al arriboEn más temprano con su ubicación", () => {
    const puntos = [
      { arriboEn: "2026-08-13T09:00:00-03:00", arriboLat: -34.7, arriboLon: -58.5 },
      { arriboEn: "2026-08-13T08:30:00-03:00", arriboLat: -34.65, arriboLon: -58.45 },
    ];
    expect(primerEventoConUbicacion(puntos)).toEqual({ iso: "2026-08-13T08:30:00-03:00", lat: -34.65, lon: -58.45 });
  });

  it("sin ningún evento registrado, da null", () => {
    expect(primerEventoConUbicacion([{ estado: "pendiente" }])).toBe(null);
  });
});

describe("tiempo — calcularTiempoTotalMin (009-central-mejora-visual)", () => {
  it("calcula la duración desde el primer evento hasta el cierre", () => {
    const puntos = [{ inicioEn: "2026-08-13T08:00:00-03:00" }];
    expect(calcularTiempoTotalMin(puntos, "2026-08-13T14:40:00-03:00")).toBe(400);
  });

  it("sin cierre, calcula lo transcurrido hasta 'ahora'", () => {
    const puntos = [{ inicioEn: "2026-08-13T08:00:00-03:00" }];
    const ahora = new Date("2026-08-13T10:00:00-03:00");
    expect(calcularTiempoTotalMin(puntos, null, ahora)).toBe(120);
  });

  it("sin ningún evento de inicio, da null", () => {
    expect(calcularTiempoTotalMin([{ estado: "pendiente" }], "2026-08-13T14:40:00-03:00")).toBe(null);
  });
});
