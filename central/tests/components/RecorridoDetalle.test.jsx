import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { RecorridoDetalle } from "../../src/components/RecorridoDetalle.jsx";

vi.mock("../../src/services/api.js", () => ({
  listarFletesDisponibles: vi.fn().mockResolvedValue([]),
  reasignarRecorrido: vi.fn(),
}));

function detalleConEnlace(enlace) {
  return {
    recorrido: { id: "50", estado: "activo", fleteId: "7", enlace },
    puntos: [{ id: "p1", orden: 1, estado: "pendiente" }],
  };
}

describe("RecorridoDetalle — enlace (004-chofer-cloud-broker, FR-006, US3 AS2)", () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("muestra el enlace de un recorrido ya activo (no solo justo tras asignarlo)", () => {
    render(<RecorridoDetalle detalle={detalleConEnlace("https://chofer.example/#/r/eyJwYXlsb2FkIjp0cnVlfQ")} />);

    expect(screen.getByText("https://chofer.example/#/r/eyJwYXlsb2FkIjp0cnVlfQ")).toBeInTheDocument();
  });

  it("copia el enlace al portapapeles al tocar 'Copiar enlace'", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });
    render(<RecorridoDetalle detalle={detalleConEnlace("https://chofer.example/#/r/eyJwYXlsb2FkIjp0cnVlfQ")} />);

    fireEvent.click(screen.getByRole("button", { name: "Copiar enlace" }));

    await waitFor(() => expect(writeText).toHaveBeenCalledWith("https://chofer.example/#/r/eyJwYXlsb2FkIjp0cnVlfQ"));
    await waitFor(() => expect(screen.getByRole("button", { name: "¡Copiado!" })).toBeInTheDocument());
  });

  it("no muestra la sección de enlace si el detalle no trae `enlace`", () => {
    render(<RecorridoDetalle detalle={detalleConEnlace(undefined)} />);

    expect(screen.queryByRole("button", { name: "Copiar enlace" })).not.toBeInTheDocument();
  });
});
