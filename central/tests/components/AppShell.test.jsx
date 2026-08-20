import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { AppShell } from "../../src/components/AppShell.jsx";

// 011-unificar-monitoreo-mapa: el menú lateral se reemplaza por un único
// botón en el header que alterna entre Monitoreo (con el mapa debajo,
// unificados) e Historial.
describe("AppShell", () => {
  it("en Monitoreo, muestra un botón para ir a Historial", () => {
    render(
      <AppShell seccion="monitor" onCambiarSeccion={vi.fn()}>
        <p>contenido</p>
      </AppShell>,
    );

    expect(screen.getByRole("button", { name: /ver historial/i })).toBeInTheDocument();
  });

  it("en Historial, muestra un botón para volver a Monitoreo", () => {
    render(
      <AppShell seccion="historial" onCambiarSeccion={vi.fn()}>
        <p>contenido</p>
      </AppShell>,
    );

    expect(screen.getByRole("button", { name: /ver monitoreo/i })).toBeInTheDocument();
  });

  it("notifica el cambio de sección al hacer clic en el botón de alternar", () => {
    const onCambiarSeccion = vi.fn();
    render(
      <AppShell seccion="monitor" onCambiarSeccion={onCambiarSeccion}>
        <p>contenido</p>
      </AppShell>,
    );

    screen.getByRole("button", { name: /ver historial/i }).click();

    expect(onCambiarSeccion).toHaveBeenCalledWith("historial");
  });

  it("no muestra ningún menú lateral (solo el botón de alternar en el header)", () => {
    render(
      <AppShell seccion="monitor" onCambiarSeccion={vi.fn()}>
        <p>contenido</p>
      </AppShell>,
    );

    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });
});
