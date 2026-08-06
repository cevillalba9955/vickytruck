import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MapaSeguimiento } from "../../src/components/MapaSeguimiento.jsx";

// jsdom no implementa el layout que Leaflet necesita (getBoundingClientRect,
// tamaño de tiles) — se mockea react-leaflet para testear qué props/marcadores
// recibe el componente, no cómo Leaflet pinta un tile (ver research.md,
// Decisión 4).
vi.mock("react-leaflet", () => ({
  MapContainer: ({ children }) => <div data-testid="map-container">{children}</div>,
  TileLayer: () => null,
  CircleMarker: ({ children, center, "data-ubicacion-reciente": reciente, eventHandlers }) => (
    <div
      data-testid="circle-marker"
      data-lat={center[0]}
      data-lon={center[1]}
      data-ubicacion-reciente={reciente}
      onClick={() => eventHandlers?.click?.()}
    >
      {children}
    </div>
  ),
  Popup: ({ children }) => <div>{children}</div>,
}));

describe("MapaSeguimiento — modo general (Historia 1)", () => {
  it("dibuja un marcador por cada flete con ubicación conocida (FR-001)", () => {
    render(
      <MapaSeguimiento
        marcadoresFlete={[
          { recorridoId: "50", fleteNombre: "Juan Pérez", lat: -34.6, lon: -58.4, en: "2026-08-06T10:00:00Z", reciente: true },
          { recorridoId: "51", fleteNombre: "Ana Gómez", lat: -34.5, lon: -58.3, en: "2026-08-06T09:00:00Z", reciente: false },
        ]}
      />,
    );

    expect(screen.getAllByTestId("circle-marker")).toHaveLength(2);
  });

  it("distingue visualmente reciente de no reciente (FR-003)", () => {
    render(
      <MapaSeguimiento
        marcadoresFlete={[
          { recorridoId: "50", fleteNombre: "Juan Pérez", lat: -34.6, lon: -58.4, en: "2026-08-06T10:00:00Z", reciente: true },
          { recorridoId: "51", fleteNombre: "Ana Gómez", lat: -34.5, lon: -58.3, en: "2026-08-06T09:00:00Z", reciente: false },
        ]}
      />,
    );

    const marcadores = screen.getAllByTestId("circle-marker");
    expect(marcadores[0]).toHaveAttribute("data-ubicacion-reciente", "true");
    expect(marcadores[1]).toHaveAttribute("data-ubicacion-reciente", "false");
  });

  it("al hacer click en un marcador, invoca onSeleccionarFlete con el id del recorrido (FR-005)", () => {
    const onSeleccionarFlete = vi.fn();
    render(
      <MapaSeguimiento
        marcadoresFlete={[{ recorridoId: "50", fleteNombre: "Juan Pérez", lat: -34.6, lon: -58.4, en: null, reciente: true }]}
        onSeleccionarFlete={onSeleccionarFlete}
      />,
    );

    screen.getByTestId("circle-marker").click();
    expect(onSeleccionarFlete).toHaveBeenCalledWith("50");
  });

  it("muestra un mensaje claro cuando no hay recorridos activos (Edge Case)", () => {
    render(<MapaSeguimiento marcadoresFlete={[]} hayDatos={false} />);
    expect(screen.getByRole("status")).toHaveTextContent("No hay recorridos activos");
  });
});

describe("MapaSeguimiento — modo detalle (Historia 2)", () => {
  it("dibuja los puntos del recorrido junto con el marcador del flete (FR-006)", () => {
    render(
      <MapaSeguimiento
        marcadoresFlete={[{ recorridoId: "50", fleteNombre: "Juan Pérez", lat: -34.6, lon: -58.4, en: null, reciente: true }]}
        puntos={[
          { id: "P-1", orden: 1, lat: -34.61, lon: -58.41, estado: "arribado" },
          { id: "P-2", orden: 2, lat: -34.62, lon: -58.42, estado: "pendiente" },
        ]}
      />,
    );

    // 1 marcador de flete + 2 puntos de entrega
    expect(screen.getAllByTestId("circle-marker")).toHaveLength(3);
  });

  it("dibuja los puntos del recorrido aunque el flete no tenga ubicación reportada todavía", () => {
    render(
      <MapaSeguimiento
        marcadoresFlete={[]}
        puntos={[{ id: "P-1", orden: 1, lat: -34.61, lon: -58.41, estado: "pendiente" }]}
      />,
    );

    expect(screen.getAllByTestId("circle-marker")).toHaveLength(1);
  });
});
