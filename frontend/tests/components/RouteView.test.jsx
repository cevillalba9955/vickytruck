import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
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
    onFinalizar: vi.fn(),
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

  it("no muestra la confirmación si falta un punto por completar", () => {
    render(<RouteView puntos={puntosDePrueba()} viajeEstado="detenido" puntoActivoId={null} {...handlers()} procesando={false} />);
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });
});

describe("RouteView — FINALIZAR (008-registro-inicio-fin-recorrido, FR-004/FR-007)", () => {
  it("cuando no quedan pendientes pero el recorrido sigue 'activo' (server), muestra el botón FINALIZAR en vez de la lista", () => {
    const puntos = puntosDePrueba().map((p) => ({ ...p, estado: "completado" }));
    render(<RouteView puntos={puntos} viajeEstado="detenido" puntoActivoId={null} estadoRecorrido="activo" {...handlers()} procesando={false} />);

    expect(screen.getByRole("button", { name: "FINALIZAR" })).toBeInTheDocument();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    expect(screen.queryByRole("listitem")).not.toBeInTheDocument();
  });

  it("al tocar FINALIZAR llama a onFinalizar (la confirmación depende del servidor, no de un estado local)", () => {
    const puntos = puntosDePrueba().map((p) => ({ ...p, estado: "completado" }));
    const propHandlers = handlers();
    render(<RouteView puntos={puntos} viajeEstado="detenido" puntoActivoId={null} estadoRecorrido="activo" {...propHandlers} procesando={false} />);

    fireEvent.click(screen.getByRole("button", { name: "FINALIZAR" }));

    expect(propHandlers.onFinalizar).toHaveBeenCalledTimes(1);
    // Sin que el servidor haya confirmado (estadoRecorrido sigue "activo"),
    // el botón sigue mostrándose — no hay confirmación optimista local.
    expect(screen.getByRole("button", { name: "FINALIZAR" })).toBeInTheDocument();
  });

  it("cuando estadoRecorrido === 'finalizado' (confirmado por el servidor) muestra el mensaje de cierre en vez del botón", () => {
    const puntos = puntosDePrueba().map((p) => ({ ...p, estado: "completado" }));
    render(<RouteView puntos={puntos} viajeEstado="detenido" puntoActivoId={null} estadoRecorrido="finalizado" {...handlers()} procesando={false} />);

    expect(screen.queryByRole("button", { name: "FINALIZAR" })).not.toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent(/recorrido finalizado/i);
  });
});
