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
  CircleMarker: ({ children, center, "data-ubicacion-reciente": reciente, pathOptions, eventHandlers }) => (
    <div
      data-testid="circle-marker"
      data-lat={center[0]}
      data-lon={center[1]}
      data-ubicacion-reciente={reciente}
      data-color={pathOptions?.color}
      onClick={() => eventHandlers?.click?.()}
    >
      {children}
    </div>
  ),
  Popup: ({ children }) => <div>{children}</div>,
  Tooltip: ({ children }) => <div data-testid="tooltip">{children}</div>,
  Marker: ({ children, position, icon, eventHandlers }) => (
    <div
      data-testid="flete-marker"
      data-lat={position[0]}
      data-lon={position[1]}
      data-icon-html={icon?.options?.html}
      onClick={() => eventHandlers?.click?.()}
    >
      {children}
    </div>
  ),
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

describe("MapaSeguimiento — vista consolidada, marcadoresUnificados (010-mapa-central-unificado, US1)", () => {
  it("dibuja el marcador de flete y los puntos de varios recorridos a la vez, cada uno con su color", () => {
    render(
      <MapaSeguimiento
        marcadoresUnificados={[
          { tipo: "flete", recorridoId: "50", color: "#2c5f8a", lat: -34.6, lon: -58.4, fleteNombre: "Camión 7", reciente: true },
          { tipo: "punto", id: "p1", recorridoId: "50", color: "#2c5f8a", lat: -34.61, lon: -58.41, estado: "pendiente", cliente: "Almacén Centro", orden: 1 },
          { tipo: "flete", recorridoId: "51", color: "#c0392b", lat: -34.65, lon: -58.45, fleteNombre: "Camión 8", reciente: false },
        ]}
      />,
    );

    // 1 punto (CircleMarker) + 2 fletes (Marker, ícono distinto — US2).
    expect(screen.getAllByTestId("circle-marker")).toHaveLength(1);
    expect(screen.getAllByTestId("flete-marker")).toHaveLength(2);
  });

  it("cada recorrido usa un color propio no repetido entre sí", () => {
    render(
      <MapaSeguimiento
        marcadoresUnificados={[
          { tipo: "flete", recorridoId: "50", color: "#2c5f8a", lat: -34.6, lon: -58.4, fleteNombre: "Camión 7", reciente: true },
          { tipo: "flete", recorridoId: "51", color: "#c0392b", lat: -34.65, lon: -58.45, fleteNombre: "Camión 8", reciente: true },
        ]}
      />,
    );

    const [m1, m2] = screen.getAllByTestId("flete-marker");
    expect(m1.dataset.iconHtml).toContain("#2c5f8a");
    expect(m2.dataset.iconHtml).toContain("#c0392b");
  });

  it("al hacer click en un marcador de flete, invoca onSeleccionarFlete con el id del recorrido", () => {
    const onSeleccionarFlete = vi.fn();
    render(
      <MapaSeguimiento
        marcadoresUnificados={[
          { tipo: "flete", recorridoId: "50", color: "#2c5f8a", lat: -34.6, lon: -58.4, fleteNombre: "Camión 7", reciente: true },
        ]}
        onSeleccionarFlete={onSeleccionarFlete}
      />,
    );

    screen.getByTestId("flete-marker").click();
    expect(onSeleccionarFlete).toHaveBeenCalledWith("50");
  });
});

describe("MapaSeguimiento — ícono distinto para el flete/chofer (010-mapa-central-unificado, US2)", () => {
  it("el marcador de flete usa una forma distinta (Marker/ícono) a la de los puntos de entrega (CircleMarker)", () => {
    render(
      <MapaSeguimiento
        marcadoresUnificados={[
          { tipo: "flete", recorridoId: "50", color: "#2c5f8a", lat: -34.6, lon: -58.4, fleteNombre: "Camión 7", reciente: true },
          { tipo: "punto", id: "p1", recorridoId: "50", color: "#2c5f8a", lat: -34.61, lon: -58.41, estado: "pendiente", cliente: "Almacén Centro", orden: 1 },
        ]}
      />,
    );

    expect(screen.getByTestId("flete-marker")).toBeInTheDocument();
    expect(screen.getByTestId("circle-marker")).toBeInTheDocument();
  });

  it("todas las posiciones de flete comparten la misma familia de ícono entre sí, independientemente del color", () => {
    render(
      <MapaSeguimiento
        marcadoresUnificados={[
          { tipo: "flete", recorridoId: "50", color: "#2c5f8a", lat: -34.6, lon: -58.4, fleteNombre: "Camión 7", reciente: true },
          { tipo: "flete", recorridoId: "51", color: "#c0392b", lat: -34.65, lon: -58.45, fleteNombre: "Camión 8", reciente: true },
        ]}
      />,
    );

    const marcadores = screen.getAllByTestId("flete-marker");
    expect(marcadores).toHaveLength(2);
  });
});

describe("MapaSeguimiento — nombre de cliente y recencia al pasar el mouse (010-mapa-central-unificado, US3)", () => {
  it("un punto con cliente informado muestra el nombre del cliente en el tooltip de hover", () => {
    render(
      <MapaSeguimiento
        marcadoresUnificados={[
          { tipo: "punto", id: "p1", recorridoId: "50", color: "#2c5f8a", lat: -34.6, lon: -58.4, estado: "pendiente", cliente: "Almacén Centro", orden: 1 },
        ]}
      />,
    );

    expect(screen.getByTestId("tooltip")).toHaveTextContent("Almacén Centro");
  });

  it("un punto sin cliente informado muestra 'Punto {orden}' en el tooltip de hover", () => {
    render(
      <MapaSeguimiento
        marcadoresUnificados={[
          { tipo: "punto", id: "p1", recorridoId: "50", color: "#2c5f8a", lat: -34.6, lon: -58.4, estado: "pendiente", cliente: null, orden: 3 },
        ]}
      />,
    );

    expect(screen.getByTestId("tooltip")).toHaveTextContent("Punto 3");
  });

  it("una posición de flete muestra su nombre y si es reciente o no en el tooltip de hover (FR-005)", () => {
    render(
      <MapaSeguimiento
        marcadoresUnificados={[
          { tipo: "flete", recorridoId: "50", color: "#2c5f8a", lat: -34.6, lon: -58.4, fleteNombre: "Camión 7", reciente: false },
        ]}
      />,
    );

    const tooltip = screen.getByTestId("tooltip");
    expect(tooltip).toHaveTextContent("Camión 7");
    expect(tooltip).toHaveTextContent("no reciente");
  });

  it("el click sobre el marcador de flete sigue funcionando con el tooltip de hover (no requiere click para mostrar el texto)", () => {
    const onSeleccionarFlete = vi.fn();
    render(
      <MapaSeguimiento
        marcadoresUnificados={[
          { tipo: "flete", recorridoId: "50", color: "#2c5f8a", lat: -34.6, lon: -58.4, fleteNombre: "Camión 7", reciente: true },
        ]}
        onSeleccionarFlete={onSeleccionarFlete}
      />,
    );

    // El tooltip ya está en el DOM sin necesidad de click (hover, no Popup).
    expect(screen.getByTestId("tooltip")).toBeInTheDocument();
    screen.getByTestId("flete-marker").click();
    expect(onSeleccionarFlete).toHaveBeenCalledWith("50");
  });
});

describe("MapaSeguimiento — punto de salida siempre visible (010-mapa-central-unificado, US4)", () => {
  it("muestra el punto de salida por defecto aunque no haya marcadores de flete/punto (hayDatos=false)", () => {
    render(
      <MapaSeguimiento
        marcadoresUnificados={[{ tipo: "salidaDefault", color: null, lat: -34.8097527, lon: -58.4574414 }]}
        hayDatos={false}
      />,
    );

    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    expect(screen.getByTestId("flete-marker")).toBeInTheDocument();
  });

  it("sigue mostrando el estado vacío cuando ni siquiera hay marcador de salida", () => {
    render(<MapaSeguimiento marcadoresUnificados={[]} hayDatos={false} />);
    expect(screen.getByRole("status")).toHaveTextContent("No hay recorridos activos");
  });

  it("el tooltip del marcador de salida por defecto lo identifica como punto de salida, sin click ni color", () => {
    render(<MapaSeguimiento marcadoresUnificados={[{ tipo: "salidaDefault", color: null, lat: -34.8, lon: -58.4 }]} />);

    const marcador = screen.getByTestId("flete-marker");
    expect(marcador.dataset.iconHtml).not.toContain("background");
    expect(screen.getByTestId("tooltip")).toHaveTextContent(/salida/i);
  });

  it("un recorrido con puntoSalida propio agrega, además del default, un marcador con el color de su flete", () => {
    render(
      <MapaSeguimiento
        marcadoresUnificados={[
          { tipo: "salidaDefault", color: null, lat: -34.8097527, lon: -58.4574414 },
          { tipo: "salidaRecorrido", recorridoId: "50", color: "#8e44ad", lat: -34.55, lon: -58.35 },
        ]}
      />,
    );

    expect(screen.getAllByTestId("flete-marker")).toHaveLength(2);
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
