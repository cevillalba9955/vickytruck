import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { RouteView } from "../../src/components/RouteView.jsx";

afterEach(cleanup);

function puntosDePrueba() {
  return [
    { id: "p3", orden: 3, totalPuntos: 3, latitud: -3, longitud: -3, estado: "pendiente" },
    { id: "p1", orden: 1, totalPuntos: 3, latitud: -1, longitud: -1, estado: "pendiente" },
    { id: "p2", orden: 2, totalPuntos: 3, latitud: -2, longitud: -2, estado: "pendiente" },
  ];
}

function handlers() {
  return {
    onIniciar: vi.fn(),
    onIrPrimero: vi.fn(),
    onLlegue: vi.fn(),
    onDescargaCompleta: vi.fn(),
  };
}

describe("RouteView — estado de viaje guiado (005-chofer-estados-viaje, US2)", () => {
  it("en Detenido muestra todos los puntos pendientes ordenados, con INICIAR solo en el primero", () => {
    render(<RouteView puntos={puntosDePrueba()} viajeEstado="detenido" puntoActivoId={null} {...handlers()} procesando={false} />);

    const items = screen.getAllByRole("listitem");
    expect(items).toHaveLength(3);
    expect(items[0]).toHaveAttribute("data-estado", "pendiente");

    const botonesIniciar = screen.getAllByRole("button", { name: "INICIAR" });
    expect(botonesIniciar).toHaveLength(1);
    expect(screen.getAllByRole("button", { name: "IR PRIMERO" })).toHaveLength(2);
  });

  it("en Manejando muestra solo el punto activo con LLEGUE; el resto queda reducido sin botón", () => {
    render(<RouteView puntos={puntosDePrueba()} viajeEstado="manejando" puntoActivoId="p1" {...handlers()} procesando={false} />);

    const items = screen.getAllByRole("listitem");
    expect(items).toHaveLength(3);
    expect(screen.getAllByRole("button", { name: "LLEGUE" })).toHaveLength(1);
    expect(screen.queryByRole("button", { name: "INICIAR" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "IR PRIMERO" })).not.toBeInTheDocument();

    const reducidos = items.filter((li) => li.className.includes("delivery-point-card--reducido"));
    expect(reducidos).toHaveLength(2);
  });

  it("en Descargando muestra DESCARGA COMPLETA solo sobre el punto activo", () => {
    render(<RouteView puntos={puntosDePrueba()} viajeEstado="descargando" puntoActivoId="p2" {...handlers()} procesando={false} />);
    expect(screen.getAllByRole("button", { name: "DESCARGA COMPLETA" })).toHaveLength(1);
  });

  it("muestra la confirmación cuando todos los puntos están completados (FR-009 de 001-chofer-recorrido)", () => {
    const puntos = puntosDePrueba().map((p) => ({ ...p, estado: "completado" }));
    render(<RouteView puntos={puntos} viajeEstado="detenido" puntoActivoId={null} {...handlers()} procesando={false} />);
    expect(screen.getByRole("status")).toHaveTextContent(/recorrido finalizado/i);
  });

  it("no muestra la confirmación si falta un punto por completar", () => {
    render(<RouteView puntos={puntosDePrueba()} viajeEstado="detenido" puntoActivoId={null} {...handlers()} procesando={false} />);
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });
});
