import { describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { HistorialView } from "../../src/components/HistorialView.jsx";
import { listarHistorial } from "../../src/services/api.js";

vi.mock("../../src/services/api.js", () => ({
  listarHistorial: vi.fn(),
}));

// jsdom no implementa el layout que Leaflet necesita — se mockea react-leaflet
// igual que en MapaSeguimiento.test.jsx, ya que "Ver línea de tiempo" abre
// RecorridoDetalle, que embebe el mapa.
vi.mock("react-leaflet", () => ({
  MapContainer: ({ children }) => <div data-testid="map-container">{children}</div>,
  TileLayer: () => null,
  CircleMarker: ({ children }) => <div data-testid="circle-marker">{children}</div>,
  Popup: ({ children }) => <div>{children}</div>,
}));

describe("HistorialView — columnas de la tabla (009-central-mejora-visual)", () => {
  it("muestra fecha, flete, chofer, cantidad de clientes y tiempo total", async () => {
    listarHistorial.mockResolvedValue([
      {
        id: "88",
        fleteId: "5",
        flete: { id: "5", nombre: "Camión 5" },
        chofer: { id: "9", nombre: "Nora Vidal" },
        cierreEn: "2026-08-19T14:40:00-03:00",
        puntos: [
          { id: "p1", orden: 1, estado: "completado", inicioEn: "2026-08-19T08:00:00-03:00", descargaEn: "2026-08-19T08:35:00-03:00" },
          { id: "p2", orden: 2, estado: "completado", descargaEn: "2026-08-19T09:15:00-03:00" },
          { id: "p3", orden: 3, estado: "completado", descargaEn: "2026-08-19T09:55:00-03:00" },
        ],
      },
    ]);

    render(<HistorialView />);

    const fila = await waitFor(() => screen.getByText("Camión 5").closest("tr"));
    expect(fila).toHaveTextContent("19/08/2026");
    expect(fila).toHaveTextContent("14:40:00");
    expect(fila).toHaveTextContent("Nora Vidal");
    expect(fila).toHaveTextContent("3"); // cantidad de clientes
    // 08:00 (inicioEn del primer punto) -> 14:40 (cierreEn) = 6h 40min.
    expect(fila).toHaveTextContent("6h 40min");
  });

  it("muestra un guion cuando falta chofer o no se puede calcular el tiempo total", async () => {
    listarHistorial.mockResolvedValue([
      {
        id: "89",
        fleteId: "6",
        flete: { id: "6", nombre: "Camión 6" },
        chofer: null,
        cierreEn: null,
        puntos: [{ id: "p1", orden: 1, estado: "completado" }],
      },
    ]);

    render(<HistorialView />);

    const fila = await waitFor(() => screen.getByText("Camión 6").closest("tr"));
    expect(fila).toHaveTextContent("—");
  });

  it("'Ver línea de tiempo' lleva cierreLat/cierreLon al detalle (008, User Story 3, 2026-08-25 — regresión: 'abrirLineaDeTiempo' arma el objeto recorrido a mano y se olvidaba de estos dos campos)", async () => {
    listarHistorial.mockResolvedValue([
      {
        id: "90",
        fleteId: "7",
        flete: { id: "7", nombre: "Camión 7" },
        chofer: { id: "9", nombre: "Nora Vidal" },
        cierreEn: "2026-08-19T14:40:00-03:00",
        cierreLat: -34.61,
        cierreLon: -58.39,
        puntos: [{ id: "p1", orden: 1, estado: "completado", inicioEn: "2026-08-19T08:00:00-03:00" }],
      },
    ]);

    render(<HistorialView />);
    const boton = await waitFor(() => screen.getByRole("button", { name: "Ver línea de tiempo" }));
    fireEvent.click(boton);

    const hora = await waitFor(() => screen.getByText("14:40:00"));
    expect(hora.getAttribute("title")).toBe("-34.61000, -58.39000");
  });

  it("muestra un mensaje cuando no hay recorridos finalizados", async () => {
    listarHistorial.mockResolvedValue([]);
    render(<HistorialView />);
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("Todavía no hay recorridos finalizados"));
  });
});
