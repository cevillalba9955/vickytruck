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

    const filaReciente = screen.getByText("Juan Pérez").closest("tr");
    const filaNoReciente = screen.getByText("Ana Gómez").closest("tr");
    expect(filaReciente).toHaveAttribute("data-ubicacion-reciente", "true");
    expect(filaNoReciente).toHaveAttribute("data-ubicacion-reciente", "false");
    expect(filaNoReciente.querySelector(".ant-badge-status-warning")).toBeInTheDocument();
    expect(filaReciente.querySelector(".ant-badge-status-success")).toBeInTheDocument();
  });

  it("muestra el estado de viaje sin el id del punto, y el cliente del punto activo en su propia columna (009-central-mejora-visual)", () => {
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
            puntoActivo: { id: "p3", orden: 3, cliente: "Supermercado Sur" },
          },
          {
            id: "61",
            flete: { id: "12", nombre: "Diego Ríos" },
            progreso: { pendientes: 2, arribados: 0, completados: 0 },
            ultimaUbicacion: null,
            viajeEstado: "detenido",
            puntoActivoId: null,
            puntoActivo: null,
          },
        ]}
      />,
    );

    const filaLucia = screen.getByText("Lucía Paz").closest("tr");
    expect(filaLucia).toHaveTextContent("Manejando");
    expect(filaLucia).not.toHaveTextContent("punto p3");
    expect(filaLucia).toHaveTextContent("Supermercado Sur");

    const filaDiego = screen.getByText("Diego Ríos").closest("tr");
    expect(filaDiego).toHaveTextContent("Detenido");
    expect(filaDiego).not.toHaveTextContent("punto");
  });

  it("cuando el punto activo todavía no tiene cliente informado, muestra 'Punto {orden}' en vez de dejarlo vacío", () => {
    render(
      <MonitorView
        recorridos={[
          {
            id: "62",
            flete: { id: "14", nombre: "Nora Vidal" },
            progreso: { pendientes: 1, arribados: 0, completados: 0 },
            ultimaUbicacion: null,
            viajeEstado: "manejando",
            puntoActivoId: "p5",
            puntoActivo: { id: "p5", orden: 5, cliente: null },
          },
        ]}
      />,
    );

    expect(screen.getByText("Nora Vidal").closest("tr")).toHaveTextContent("Punto 5");
  });

  it("muestra 'Regresando a base' cuando esperandoFinalizar es true (008-registro-inicio-fin-recorrido)", () => {
    render(
      <MonitorView
        recorridos={[
          {
            id: "63",
            flete: { id: "13", nombre: "Marta Sosa" },
            progreso: { pendientes: 0, arribados: 0, completados: 2 },
            ultimaUbicacion: null,
            viajeEstado: "detenido",
            puntoActivoId: null,
            esperandoFinalizar: true,
          },
        ]}
      />,
    );

    const fila = screen.getByText("Marta Sosa").closest("tr");
    expect(fila).toHaveTextContent("Regresando");
    expect(fila).not.toHaveTextContent("Detenido");
  });

  it("muestra los minutos transcurridos desde la última lectura de ubicación, no la hora absoluta (009-central-mejora-visual)", () => {
    const haceCincoMinutos = new Date(Date.now() - 5 * 60000).toISOString();
    render(
      <MonitorView
        recorridos={[
          {
            id: "50",
            flete: { id: "7", nombre: "Juan Pérez" },
            progreso: { pendientes: 1, arribados: 1, completados: 1 },
            ultimaUbicacion: { lat: -34.6, lon: -58.4, en: haceCincoMinutos, reciente: true },
          },
        ]}
      />,
    );

    const fila = screen.getByText("Juan Pérez").closest("tr");
    expect(fila).toHaveTextContent("5 min");
    expect(fila).not.toHaveTextContent(/\d{2}:\d{2}:\d{2}/);
  });

  it("muestra un guion cuando no hay ubicación reportada", () => {
    render(
      <MonitorView
        recorridos={[
          {
            id: "50",
            flete: { id: "7", nombre: "Juan Pérez" },
            progreso: { pendientes: 1, arribados: 1, completados: 1 },
            ultimaUbicacion: { lat: null, lon: null, en: null, reciente: false },
          },
        ]}
      />,
    );

    expect(screen.getByText("Juan Pérez").closest("tr")).toHaveTextContent("—");
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
