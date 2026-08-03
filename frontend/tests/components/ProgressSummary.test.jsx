import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { ProgressSummary } from "../../src/components/ProgressSummary.jsx";

describe("ProgressSummary", () => {
  it("refleja un estado mixto de conteos correctamente (US4, FR-008)", () => {
    render(<ProgressSummary progreso={{ pendientes: 6, arribados: 1, completados: 3 }} />);
    const grupo = screen.getByRole("group", { name: /progreso del recorrido/i });
    expect(grupo).toHaveTextContent("3 de 10 completados");
    expect(grupo).toHaveTextContent("1 en curso");
    expect(grupo).toHaveTextContent("6 pendientes");
  });

  it("no renderiza nada si no hay progreso todavía", () => {
    const { container } = render(<ProgressSummary progreso={null} />);
    expect(container).toBeEmptyDOMElement();
  });
});
