import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { AsignacionForm } from "../../src/components/AsignacionForm.jsx";

vi.mock("../../src/services/api.js", () => ({
  listarDisponibles: vi.fn().mockResolvedValue([{ id: "50", totalPuntos: 3 }]),
  listarFletesDisponibles: vi.fn().mockResolvedValue([{ id: "9", nombre: "Ana Gómez" }]),
  asignarRecorrido: vi.fn(),
}));

import { asignarRecorrido } from "../../src/services/api.js";

describe("AsignacionForm — enlace (004-chofer-cloud-broker, FR-006)", () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  async function completarYEnviar() {
    await screen.findByText("Recorrido 50 (3 puntos)");
    fireEvent.change(screen.getByLabelText("Recorrido disponible"), { target: { value: "50" } });
    fireEvent.change(screen.getByLabelText("Flete disponible"), { target: { value: "9" } });
    fireEvent.click(screen.getByRole("button", { name: "Asignar" }));
  }

  it("muestra el enlace completo recibido (no el token crudo) tras asignar", async () => {
    asignarRecorrido.mockResolvedValue({
      recorridoId: "50",
      fleteId: "9",
      token: "tok-abc",
      asignadoEn: "2026-08-04T12:00:00Z",
      enlace: "https://chofer.example/#/r/eyJwYXlsb2FkIjp0cnVlfQ",
    });
    render(<AsignacionForm />);

    await completarYEnviar();

    expect(await screen.findByText("https://chofer.example/#/r/eyJwYXlsb2FkIjp0cnVlfQ")).toBeInTheDocument();
    expect(screen.queryByText("tok-abc")).not.toBeInTheDocument();
  });

  it("copia el enlace al portapapeles al tocar 'Copiar enlace'", async () => {
    asignarRecorrido.mockResolvedValue({
      recorridoId: "50",
      fleteId: "9",
      token: "tok-abc",
      asignadoEn: "2026-08-04T12:00:00Z",
      enlace: "https://chofer.example/#/r/eyJwYXlsb2FkIjp0cnVlfQ",
    });
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });
    render(<AsignacionForm />);

    await completarYEnviar();
    fireEvent.click(await screen.findByRole("button", { name: "Copiar enlace" }));

    await waitFor(() => expect(writeText).toHaveBeenCalledWith("https://chofer.example/#/r/eyJwYXlsb2FkIjp0cnVlfQ"));
    await waitFor(() => expect(screen.getByRole("button", { name: "¡Copiado!" })).toBeInTheDocument());
  });

  it("si la respuesta no trae `enlace` (compatibilidad), muestra el token y no ofrece copiar", async () => {
    asignarRecorrido.mockResolvedValue({
      recorridoId: "50",
      fleteId: "9",
      token: "tok-abc",
      asignadoEn: "2026-08-04T12:00:00Z",
    });
    render(<AsignacionForm />);

    await completarYEnviar();

    expect(await screen.findByText("tok-abc")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Copiar enlace" })).not.toBeInTheDocument();
  });
});
