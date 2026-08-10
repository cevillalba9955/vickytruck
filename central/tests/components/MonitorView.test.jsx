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

  it("muestra el estado de viaje y el punto activo del chofer (005-chofer-estados-viaje, FR-021)", () => {
    render(
      <MonitorView
        recorridos={[
          {
            id: "60",
            flete: { id: "11", nombre: "Lucía Paz" },
            progreso: { pendientes: 1, arribados: 0, completados: 1 },
            ultimaUbicacion: null,
            viajeEstado: "manejando",
            puntoActivoId: "p3",
          },
          {
            id: "61",
            flete: { id: "12", nombre: "Diego Ríos" },
            progreso: { pendientes: 2, arribados: 0, completados: 0 },
            ultimaUbicacion: null,
            viajeEstado: "detenido",
            puntoActivoId: null,
          },
        ]}
      />,
    );

    expect(screen.getByText("Lucía Paz").closest("tr")).toHaveTextContent("Manejando (punto p3)");
    expect(screen.getByText("Diego Ríos").closest("tr")).toHaveTextContent("Detenido");
    expect(screen.getByText("Diego Ríos").closest("tr")).not.toHaveTextContent("punto");
  });

  it("muestra un mensaje cuando no hay recorridos activos", () => {
    render(<MonitorView recorridos={[]} />);
    expect(screen.getByRole("status")).toHaveTextContent("No hay recorridos activos");
  });

  it("permite coexistencia con estado de canal MQTT mostrado en pantalla", () => {
    render(
      <>
        <p role="status">Canal tiempo real MQTT: connected</p>
        <MonitorView
          recorridos={[
            {
              id: "52",
              flete: { id: "10", nombre: "Mario Ruiz" },
              progreso: { pendientes: 2, arribados: 1, completados: 0 },
              ultimaUbicacion: { lat: -34.61, lon: -58.39, en: new Date().toISOString(), reciente: true },
            },
          ]}
        />
      </>,
    );

    expect(screen.getByText("Canal tiempo real MQTT: connected")).toBeInTheDocument();
    expect(screen.getByText("Mario Ruiz")).toBeInTheDocument();
  });
});
