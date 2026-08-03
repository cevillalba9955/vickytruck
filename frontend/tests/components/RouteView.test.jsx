import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { RouteView } from "../../src/components/RouteView.jsx";

function puntosDePrueba() {
  return [
    { id: "p3", orden: 3, totalPuntos: 3, latitud: -3, longitud: -3, estado: "pendiente" },
    { id: "p1", orden: 1, totalPuntos: 3, latitud: -1, longitud: -1, estado: "completado" },
    { id: "p2", orden: 2, totalPuntos: 3, latitud: -2, longitud: -2, estado: "arribado" },
  ];
}

describe("RouteView", () => {
  it("renderiza los puntos en el orden correcto (FR-003)", () => {
    render(
      <RouteView
        puntos={puntosDePrueba()}
        onMarcarArribo={vi.fn()}
        onMarcarDescarga={vi.fn()}
        procesandoPuntoId={null}
      />,
    );

    const items = screen.getAllByRole("listitem");
    expect(items).toHaveLength(3);
    expect(items[0]).toHaveAttribute("data-estado", "completado");
    expect(items[1]).toHaveAttribute("data-estado", "arribado");
    expect(items[2]).toHaveAttribute("data-estado", "pendiente");
  });

  it("no muestra la confirmación de finalizado si falta un punto por completar", () => {
    render(
      <RouteView
        puntos={puntosDePrueba()}
        onMarcarArribo={vi.fn()}
        onMarcarDescarga={vi.fn()}
        procesandoPuntoId={null}
      />,
    );
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("muestra la confirmación cuando todos los puntos están completados (FR-009)", () => {
    const puntos = puntosDePrueba().map((p) => ({ ...p, estado: "completado" }));
    render(
      <RouteView puntos={puntos} onMarcarArribo={vi.fn()} onMarcarDescarga={vi.fn()} procesandoPuntoId={null} />,
    );
    expect(screen.getByRole("status")).toHaveTextContent(/recorrido finalizado/i);
  });
});
