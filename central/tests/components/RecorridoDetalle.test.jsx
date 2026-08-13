import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { RecorridoDetalle } from "../../src/components/RecorridoDetalle.jsx";

// jsdom no implementa el layout que Leaflet necesita — se mockea react-leaflet
// igual que en MapaSeguimiento.test.jsx (research.md de 004, Decisión 4).
vi.mock("react-leaflet", () => ({
  MapContainer: ({ children }) => <div data-testid="map-container">{children}</div>,
  TileLayer: () => null,
  CircleMarker: ({ children }) => <div data-testid="circle-marker">{children}</div>,
  Popup: ({ children }) => <div>{children}</div>,
}));

function detalleDePrueba(overrides = {}) {
  return {
    recorrido: { id: "50", estado: "activo", fleteId: "7" },
    puntos: [],
    ...overrides,
  };
}

describe("RecorridoDetalle — horarios de arribo/descarga (006-normalizar-formato-horario, US2)", () => {
  it("muestra arriboEn/descargaEn formateados en HH24:MM:SS local, no el string ISO crudo", () => {
    render(
      <RecorridoDetalle
        detalle={detalleDePrueba({
          puntos: [{ id: "p1", orden: 1, estado: "completado", arriboEn: "2026-08-11T10:35:20.123-03:00", descargaEn: "2026-08-11T10:50:05.000-03:00" }],
        })}
      />,
    );

    expect(screen.getByText("Arribo: 10:35:20")).toBeInTheDocument();
    expect(screen.getByText("Descarga: 10:50:05")).toBeInTheDocument();
    expect(screen.queryByText(/2026-08-11T10:35:20\.123-03:00/)).not.toBeInTheDocument();
  });

  it("un arriboEn histórico en UTC (Z) también se muestra correcto en hora local (FR-006, US3)", () => {
    render(
      <RecorridoDetalle
        detalle={detalleDePrueba({
          puntos: [{ id: "p1", orden: 1, estado: "arribado", arriboEn: "2026-08-11T13:35:20.123Z" }],
        })}
      />,
    );

    expect(screen.getByText("Arribo: 10:35:20")).toBeInTheDocument();
  });
});

describe("RecorridoDetalle — cierre e inicio (008-registro-inicio-fin-recorrido)", () => {
  it("muestra Inicio por punto y Cierre + tiempo de regreso a base cuando el recorrido está finalizado", () => {
    render(
      <RecorridoDetalle
        detalle={detalleDePrueba({
          recorrido: { id: "50", estado: "finalizado", fleteId: "7", cierreEn: "2026-08-13T14:40:00-03:00" },
          puntos: [{ id: "p1", orden: 1, estado: "completado", inicioEn: "2026-08-13T14:02:00-03:00", descargaEn: "2026-08-13T14:25:00-03:00" }],
        })}
      />,
    );

    expect(screen.getByText("Inicio: 14:02:00")).toBeInTheDocument();
    expect(screen.getByText(/Cierre:/)).toHaveTextContent("14:40:00");
    expect(screen.getByText(/Cierre:/)).toHaveTextContent("regreso a base: 15 min");
  });

  it("no muestra la línea de Cierre si el recorrido todavía no fue finalizado", () => {
    render(
      <RecorridoDetalle
        detalle={detalleDePrueba({
          puntos: [{ id: "p1", orden: 1, estado: "completado", descargaEn: "2026-08-13T14:25:00-03:00" }],
        })}
      />,
    );

    expect(screen.queryByText(/Cierre:/)).not.toBeInTheDocument();
  });
});
