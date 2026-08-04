import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { MonitorView } from "../../src/components/MonitorView.jsx";

describe("MonitorView", () => {
  it("marca visualmente una ubicación no reciente distinta de una reciente (FR-014)", () => {
    render(
      <MonitorView
        recorridos={[
          {
            id: "50",
            flete: { id: "7", nombre: "Juan Pérez" },
            progreso: { pendientes: 1, arribados: 1, completados: 1 },
            ultimaUbicacion: { lat: -34.6, lon: -58.4, en: new Date().toISOString(), reciente: true },
          },
          {
            id: "51",
            flete: { id: "9", nombre: "Ana Gómez" },
            progreso: { pendientes: 3, arribados: 0, completados: 0 },
            ultimaUbicacion: { lat: -34.5, lon: -58.3, en: new Date().toISOString(), reciente: false },
          },
        ]}
      />,
    );

    expect(screen.getByText("Juan Pérez").closest("tr")).toHaveTextContent("Ubicación reciente");
    expect(screen.getByText("Ana Gómez").closest("tr")).toHaveTextContent("Ubicación no reciente");
  });

  it("muestra un mensaje cuando no hay recorridos activos", () => {
    render(<MonitorView recorridos={[]} />);
    expect(screen.getByRole("status")).toHaveTextContent("No hay recorridos activos");
  });
});
