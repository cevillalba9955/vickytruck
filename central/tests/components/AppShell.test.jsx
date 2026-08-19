import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { AppShell } from "../../src/components/AppShell.jsx";

// 009-central-mejora-visual (US2, Acceptance Scenario 1): la sección activa
// del menú lateral debe quedar visualmente distinguida del resto.
describe("AppShell", () => {
  it("resalta como activa la sección indicada por la prop `seccion`", () => {
    render(
      <AppShell seccion="historial" onCambiarSeccion={vi.fn()}>
        <p>contenido</p>
      </AppShell>,
    );

    const itemHistorial = screen.getByText("Historial").closest('[role="menuitem"]');
    const itemMonitoreo = screen.getByText("Monitoreo").closest('[role="menuitem"]');

    expect(itemHistorial).toHaveClass("ant-menu-item-selected");
    expect(itemMonitoreo).not.toHaveClass("ant-menu-item-selected");
  });

  it("notifica el cambio de sección al hacer clic en un ítem del menú", async () => {
    const onCambiarSeccion = vi.fn();
    render(
      <AppShell seccion="monitor" onCambiarSeccion={onCambiarSeccion}>
        <p>contenido</p>
      </AppShell>,
    );

    screen.getByText("Mapa").click();

    expect(onCambiarSeccion).toHaveBeenCalledWith("mapa");
  });
});
