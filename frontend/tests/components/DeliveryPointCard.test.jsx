import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { DeliveryPointCard } from "../../src/components/DeliveryPointCard.jsx";

// El setup del proyecto (tests/setup.js) no registra un afterEach(cleanup)
// global (no usa `test.globals` de vitest) — sin esto, el DOM de un test
// queda montado al empezar el siguiente y contamina las queries.
afterEach(cleanup);

function puntoDePrueba(overrides = {}) {
  return {
    id: "p1",
    orden: 1,
    totalPuntos: 3,
    latitud: -34.6,
    longitud: -58.4,
    estado: "pendiente",
    ...overrides,
  };
}

describe("DeliveryPointCard — información de recorrido (005-chofer-estados-viaje, US1)", () => {
  it("muestra cliente, dirección, rango horario y notas de entrega cuando están presentes (FR-002)", () => {
    render(<DeliveryPointCard punto={puntoDePrueba({
      cliente: "Distribuidora Sur SRL",
      direccion: "Av. Rivadavia 1234, CABA",
      rangoHorario: "09:00–12:00",
      notasEntrega: "Tocar timbre de depósito",
    })} viajeEstado="detenido" esPrimeroPendiente procesando={false} />);

    expect(screen.getByText("Distribuidora Sur SRL")).toBeInTheDocument();
    expect(screen.getByText("Av. Rivadavia 1234, CABA")).toBeInTheDocument();
    expect(screen.getByText("09:00–12:00")).toBeInTheDocument();
    expect(screen.getByText("Tocar timbre de depósito")).toBeInTheDocument();
  });

  it("omite con normalidad los campos ausentes, sin espacios vacíos ni error (FR-004)", () => {
    const { container } = render(
      <DeliveryPointCard
        punto={puntoDePrueba({ cliente: "Cliente B", rangoHorario: null, notasEntrega: null })}
        viajeEstado="detenido"
        esPrimeroPendiente
        procesando={false}
      />,
    );

    expect(screen.getByText("Cliente B")).toBeInTheDocument();
    expect(screen.queryByText("Horario")).not.toBeInTheDocument();
    expect(screen.queryByText("Notas")).not.toBeInTheDocument();
    expect(container.querySelector(".delivery-point-card__info")).toBeInTheDocument();
  });

  it("no renderiza ningún bloque de información cuando el punto no trae ningún campo informativo", () => {
    const { container } = render(<DeliveryPointCard punto={puntoDePrueba()} viajeEstado="detenido" esPrimeroPendiente procesando={false} />);
    expect(container.querySelector(".delivery-point-card__info")).not.toBeInTheDocument();
  });

  it("nunca renderiza remitoIds aunque el objeto punto lo traiga (FR-003, defensa en profundidad de UI)", () => {
    const { container } = render(
      <DeliveryPointCard punto={puntoDePrueba({ cliente: "Cliente C", remitoIds: ["R-1", "R-2"] })} viajeEstado="detenido" esPrimeroPendiente procesando={false} />,
    );

    expect(container.textContent).not.toMatch(/remito/i);
  });
});

describe("DeliveryPointCard — botones según estado de viaje (005-chofer-estados-viaje, US2)", () => {
  it("Detenido + primer pendiente: muestra INICIAR y no IR PRIMERO", () => {
    const onIniciar = vi.fn();
    render(<DeliveryPointCard punto={puntoDePrueba()} viajeEstado="detenido" esPrimeroPendiente onIniciar={onIniciar} procesando={false} />);

    const boton = screen.getByRole("button", { name: "INICIAR" });
    expect(screen.queryByRole("button", { name: "IR PRIMERO" })).not.toBeInTheDocument();
    boton.click();
    expect(onIniciar).toHaveBeenCalledTimes(1);
  });

  it("Detenido + no es el primero: muestra IR PRIMERO con el id del punto", () => {
    const onIrPrimero = vi.fn();
    render(<DeliveryPointCard punto={puntoDePrueba({ id: "p7" })} viajeEstado="detenido" esPrimeroPendiente={false} onIrPrimero={onIrPrimero} procesando={false} />);

    expect(screen.queryByRole("button", { name: "INICIAR" })).not.toBeInTheDocument();
    screen.getByRole("button", { name: "IR PRIMERO" }).click();
    expect(onIrPrimero).toHaveBeenCalledWith("p7");
  });

  it("Manejando + activo: muestra LLEGUE", () => {
    const onLlegue = vi.fn();
    render(<DeliveryPointCard punto={puntoDePrueba()} viajeEstado="manejando" esActivo onLlegue={onLlegue} procesando={false} />);
    screen.getByRole("button", { name: "LLEGUE" }).click();
    expect(onLlegue).toHaveBeenCalledTimes(1);
  });

  it("Manejando + no activo (reducido): no muestra ningún botón ni info", () => {
    const { container } = render(
      <DeliveryPointCard punto={puntoDePrueba({ cliente: "Cliente D" })} viajeEstado="manejando" esActivo={false} reducido procesando={false} />,
    );
    expect(container.querySelector(".delivery-point-card__acciones")).not.toBeInTheDocument();
    expect(container.querySelector(".delivery-point-card__info")).not.toBeInTheDocument();
    expect(container.querySelector(".delivery-point-card--reducido")).toBeInTheDocument();
  });

  it("Descargando + activo: muestra DESCARGA COMPLETA", () => {
    const onDescargaCompleta = vi.fn();
    render(<DeliveryPointCard punto={puntoDePrueba()} viajeEstado="descargando" esActivo onDescargaCompleta={onDescargaCompleta} procesando={false} />);
    screen.getByRole("button", { name: "DESCARGA COMPLETA" }).click();
    expect(onDescargaCompleta).toHaveBeenCalledTimes(1);
  });
});
