import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { AppHeader } from "../../src/components/AppHeader.jsx";

afterEach(cleanup);

describe("AppHeader — título y CANCELAR", () => {
  it("muestra el título VICKYTRUCK", () => {
    render(<AppHeader puedeCancelar={false} onCancelar={vi.fn()} procesando={false} />);
    expect(screen.getByText("VICKYTRUCK")).toBeInTheDocument();
  });

  it("cuando puedeCancelar es true, CANCELAR es visible y llama a onCancelar al tocarlo", () => {
    const onCancelar = vi.fn();
    render(<AppHeader puedeCancelar onCancelar={onCancelar} procesando={false} />);
    const boton = screen.getByRole("button", { name: "CANCELAR" });
    expect(boton).toBeVisible();
    boton.click();
    expect(onCancelar).toHaveBeenCalledTimes(1);
  });

  it("cuando puedeCancelar es false, CANCELAR sigue en el DOM pero no es visible (para no desplazar el resto)", () => {
    const { container } = render(<AppHeader puedeCancelar={false} onCancelar={vi.fn()} procesando={false} />);
    const boton = container.querySelector(".app__cancelar");
    expect(boton).toBeInTheDocument();
    expect(boton).not.toBeVisible();
    expect(boton.style.visibility).toBe("hidden");
  });
});
