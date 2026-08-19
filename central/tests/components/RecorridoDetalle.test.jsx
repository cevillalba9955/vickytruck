import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
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

describe("RecorridoDetalle — encabezado (009-central-mejora-visual)", () => {
  it("muestra fecha, flete, chofer, hora inicio, final y tiempo total de un recorrido finalizado", () => {
    render(
      <RecorridoDetalle
        detalle={detalleDePrueba({
          recorrido: {
            id: "50",
            estado: "finalizado",
            fleteId: "7",
            flete: { id: "7", nombre: "Camión 7" },
            chofer: { id: "9", nombre: "Nora Vidal" },
            cierreEn: "2026-08-13T14:40:00-03:00",
          },
          puntos: [
            {
              id: "p1",
              orden: 1,
              estado: "completado",
              lat: -34.6,
              lon: -58.4,
              inicioEn: "2026-08-13T08:00:00-03:00",
              arriboEn: "2026-08-13T08:20:00-03:00",
              descargaEn: "2026-08-13T08:35:00-03:00",
            },
          ],
        })}
      />,
    );

    expect(screen.getByText("Recorrido 50")).toBeInTheDocument();
    expect(screen.getByText("13/08/2026")).toBeInTheDocument();
    expect(screen.getByText("Camión 7")).toBeInTheDocument();
    expect(screen.getByText("Nora Vidal")).toBeInTheDocument();
    expect(screen.getByText("08:00:00")).toBeInTheDocument(); // Hora inicio
    expect(screen.getByText("14:40:00")).toBeInTheDocument(); // Final
    expect(screen.getByText("6h 40min")).toBeInTheDocument(); // Tiempo total
  });

  it("muestra guiones cuando el recorrido está activo, sin cierre ni flete/chofer informados", () => {
    render(<RecorridoDetalle detalle={detalleDePrueba({ puntos: [] })} />);

    // Fecha, Flete, Chofer, Hora inicio, Final, Tiempo total: 6 guiones.
    expect(screen.getAllByText("—").length).toBeGreaterThanOrEqual(6);
  });
});

describe("RecorridoDetalle — grilla de puntos (009-central-mejora-visual)", () => {
  it("muestra cliente, estado, hora de llegada y hora de descarga por punto", () => {
    render(
      <RecorridoDetalle
        detalle={detalleDePrueba({
          puntos: [
            {
              id: "p1",
              orden: 1,
              estado: "completado",
              cliente: "Almacén Centro",
              lat: -34.6,
              lon: -58.4,
              inicioEn: "2026-08-13T07:45:00-03:00",
              arriboEn: "2026-08-13T08:20:00-03:00",
              descargaEn: "2026-08-13T08:35:00-03:00",
            },
          ],
        })}
      />,
    );

    expect(screen.getByText("Almacén Centro")).toBeInTheDocument();
    expect(screen.getByText("Completado")).toBeInTheDocument();
    expect(screen.getByText("08:20:00")).toBeInTheDocument();
    expect(screen.getByText("08:35:00")).toBeInTheDocument();
  });

  it("cuando no hay cliente informado, muestra 'Punto {orden}' en vez de dejarlo vacío", () => {
    render(<RecorridoDetalle detalle={detalleDePrueba({ puntos: [{ id: "p1", orden: 3, estado: "pendiente", cliente: null }] })} />);
    expect(screen.getByText("Punto 3")).toBeInTheDocument();
  });

  it("sin hora de llegada/descarga registrada, muestra un guion", () => {
    render(<RecorridoDetalle detalle={detalleDePrueba({ puntos: [{ id: "p1", orden: 1, estado: "pendiente", lat: -34.6, lon: -58.4 }] })} />);
    expect(screen.getAllByText("—").length).toBeGreaterThanOrEqual(2);
  });
});

describe("RecorridoDetalle — proximidad GPS al punto, radio de 500 m (009-central-mejora-visual)", () => {
  it("marca en verde cuando la posición registrada cae dentro del radio esperado", () => {
    render(
      <RecorridoDetalle
        detalle={detalleDePrueba({
          puntos: [
            {
              id: "p1",
              orden: 1,
              estado: "completado",
              lat: -34.6,
              lon: -58.4,
              inicioEn: "2026-08-13T07:45:00-03:00",
              arriboEn: "2026-08-13T08:20:00-03:00",
              // ~11 m de diferencia — bien dentro del radio.
              arriboLat: -34.6001,
              arriboLon: -58.4001,
            },
          ],
        })}
      />,
    );

    const fila = screen.getByText("08:20:00").closest("tr");
    expect(fila.querySelector(".ant-badge-status-success")).toBeInTheDocument();
  });

  it("marca en rojo cuando la posición registrada cae fuera del radio esperado", () => {
    render(
      <RecorridoDetalle
        detalle={detalleDePrueba({
          puntos: [
            {
              id: "p1",
              orden: 1,
              estado: "completado",
              lat: -34.6,
              lon: -58.4,
              descargaEn: "2026-08-13T08:35:00-03:00",
              // 0.01° de latitud ≈ 1.1 km — fuera del radio de 500 m.
              descargaLat: -34.61,
              descargaLon: -58.4,
            },
          ],
        })}
      />,
    );

    const fila = screen.getByText("08:35:00").closest("tr");
    expect(fila.querySelector(".ant-badge-status-error")).toBeInTheDocument();
  });

  it("sin GPS capturado para el evento, muestra la hora sin color (no hay con qué comparar)", () => {
    render(
      <RecorridoDetalle
        detalle={detalleDePrueba({
          puntos: [
            {
              id: "p1",
              orden: 1,
              estado: "completado",
              lat: -34.6,
              lon: -58.4,
              inicioEn: "2026-08-13T07:45:00-03:00",
              arriboEn: "2026-08-13T08:20:00-03:00",
            },
          ],
        })}
      />,
    );

    const fila = screen.getByText("08:20:00").closest("tr");
    expect(fila.querySelector(".ant-badge")).not.toBeInTheDocument();
  });
});

describe("RecorridoDetalle — horarios en hora local (006-normalizar-formato-horario, US2/US3)", () => {
  it("formatea arriboEn/descargaEn en HH24:MM:SS local, no el string ISO crudo", () => {
    render(
      <RecorridoDetalle
        detalle={detalleDePrueba({
          puntos: [
            {
              id: "p1",
              orden: 1,
              estado: "completado",
              lat: -34.6,
              lon: -58.4,
              inicioEn: "2026-08-11T10:00:00.000-03:00",
              arriboEn: "2026-08-11T10:35:20.123-03:00",
              descargaEn: "2026-08-11T10:50:05.000-03:00",
            },
          ],
        })}
      />,
    );

    expect(screen.getByText("10:35:20")).toBeInTheDocument();
    expect(screen.getByText("10:50:05")).toBeInTheDocument();
    expect(screen.queryByText(/2026-08-11T10:35:20\.123-03:00/)).not.toBeInTheDocument();
  });

  it("un arriboEn histórico en UTC (Z) también se muestra correcto en hora local (FR-006, US3)", () => {
    render(
      <RecorridoDetalle
        detalle={detalleDePrueba({
          puntos: [
            {
              id: "p1",
              orden: 1,
              estado: "arribado",
              lat: -34.6,
              lon: -58.4,
              inicioEn: "2026-08-11T13:00:00.000Z",
              arriboEn: "2026-08-11T13:35:20.123Z",
            },
          ],
        })}
      />,
    );

    expect(screen.getByText("10:35:20")).toBeInTheDocument();
  });
});

describe("RecorridoDetalle — recorrido todavía activo (008-registro-inicio-fin-recorrido)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-13T10:00:00-03:00"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("sin cierre, 'Final' queda en guion y 'Tiempo total' muestra lo transcurrido hasta ahora", () => {
    render(
      <RecorridoDetalle
        detalle={detalleDePrueba({
          puntos: [{ id: "p1", orden: 1, estado: "arribado", lat: -34.6, lon: -58.4, inicioEn: "2026-08-13T08:00:00-03:00" }],
        })}
      />,
    );

    expect(screen.getByText("08:00:00")).toBeInTheDocument(); // Hora inicio
    expect(screen.getByText("2h 0min")).toBeInTheDocument(); // 08:00 -> 10:00 (ahora)
  });
});
