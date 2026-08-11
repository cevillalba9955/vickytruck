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

describe("DeliveryPointCard — encabezado orden + cliente", () => {
  it("combina el número de orden y el nombre del cliente en un solo encabezado (ej. '1 - Cliente')", () => {
    render(<DeliveryPointCard punto={puntoDePrueba({ orden: 1, cliente: "Distribuidora Sur SRL" })} viajeEstado="detenido" esPrimeroPendiente procesando={false} />);
    expect(screen.getByText("1 - Distribuidora Sur SRL")).toBeInTheDocument();
  });

  it("sin cliente, muestra solo el número de orden", () => {
    render(<DeliveryPointCard punto={puntoDePrueba({ orden: 2 })} viajeEstado="detenido" esPrimeroPendiente procesando={false} />);
    expect(screen.getByText("2")).toBeInTheDocument();
  });
});

describe("DeliveryPointCard — información de recorrido (005-chofer-estados-viaje, US1)", () => {
  it("muestra dirección, rango horario y notas de entrega cuando están presentes (FR-002)", () => {
    render(<DeliveryPointCard punto={puntoDePrueba({
      cliente: "Distribuidora Sur SRL",
      direccion: "Av. Rivadavia 1234, CABA",
      rangoHorario: "09:00–12:00",
      notasEntrega: "Tocar timbre de depósito",
    })} viajeEstado="detenido" esPrimeroPendiente procesando={false} />);

    expect(screen.getByText("Av. Rivadavia 1234, CABA")).toBeInTheDocument();
    expect(screen.getByText("09:00–12:00")).toBeInTheDocument();
    expect(screen.getByText("Tocar timbre de depósito")).toBeInTheDocument();
  });

  it("omite con normalidad los campos ausentes, sin espacios vacíos ni error (FR-004)", () => {
    const { container } = render(
      <DeliveryPointCard
        punto={puntoDePrueba({ cliente: "Cliente B", direccion: "Calle 1", rangoHorario: null, notasEntrega: null })}
        viajeEstado="detenido"
        esPrimeroPendiente
        procesando={false}
      />,
    );

    expect(screen.getByText("Calle 1")).toBeInTheDocument();
    expect(screen.queryByText("Horario")).not.toBeInTheDocument();
    expect(screen.queryByText("Notas")).not.toBeInTheDocument();
    expect(container.querySelector(".delivery-point-card__info")).toBeInTheDocument();
  });

  it("no renderiza ningún bloque de información cuando el punto no trae dirección/horario/notas (el cliente ya se muestra en el encabezado)", () => {
    const { container } = render(<DeliveryPointCard punto={puntoDePrueba({ cliente: "Solo Cliente" })} viajeEstado="detenido" esPrimeroPendiente procesando={false} />);
    expect(container.querySelector(".delivery-point-card__info")).not.toBeInTheDocument();
  });

  it("nunca renderiza remitoIds aunque el objeto punto lo traiga (FR-003, defensa en profundidad de UI)", () => {
    const { container } = render(
      <DeliveryPointCard punto={puntoDePrueba({ cliente: "Cliente C", remitoIds: ["R-1", "R-2"] })} viajeEstado="detenido" esPrimeroPendiente procesando={false} />,
    );

    expect(container.textContent).not.toMatch(/remito/i);
  });
});

describe("DeliveryPointCard — horarios de arribo/descarga (006-normalizar-formato-horario, US1)", () => {
  it("muestra arriboEn/descargaEn formateados en HH24:MM:SS local, no el string ISO crudo (FR-001)", () => {
    render(<DeliveryPointCard punto={puntoDePrueba({
      cliente: "Distribuidora Sur SRL",
      estado: "completado",
      arriboEn: "2026-08-11T10:35:20.123-03:00",
      descargaEn: "2026-08-11T10:50:05.000-03:00",
    })} viajeEstado="detenido" esPrimeroPendiente procesando={false} />);

    expect(screen.getByText("10:35:20")).toBeInTheDocument();
    expect(screen.getByText("10:50:05")).toBeInTheDocument();
    expect(screen.queryByText("2026-08-11T10:35:20.123-03:00")).not.toBeInTheDocument();
  });

  it("un arriboEn histórico en UTC (Z) también se muestra correcto en hora local (FR-006, sin migración)", () => {
    render(<DeliveryPointCard punto={puntoDePrueba({
      cliente: "Cliente histórico",
      estado: "arribado",
      arriboEn: "2026-08-11T13:35:20.123Z",
    })} viajeEstado="detenido" esPrimeroPendiente procesando={false} />);

    expect(screen.getByText("10:35:20")).toBeInTheDocument();
  });

  it("sin arriboEn/descargaEn, no muestra ninguna hora (punto todavía pendiente)", () => {
    const { container } = render(<DeliveryPointCard punto={puntoDePrueba({ cliente: "Cliente E" })} viajeEstado="detenido" esPrimeroPendiente procesando={false} />);
    expect(container.querySelector(".delivery-point-card__horarios")).not.toBeInTheDocument();
  });

  it("rangoHorario se sigue mostrando exactamente como el string recibido, sin reformatear (spec Clarifications, pregunta 3 — regresión)", () => {
    render(<DeliveryPointCard punto={puntoDePrueba({
      cliente: "Cliente F",
      rangoHorario: "09:00–12:00",
      arriboEn: "2026-08-11T10:35:20.123-03:00",
    })} viajeEstado="detenido" esPrimeroPendiente procesando={false} />);

    expect(screen.getByText("09:00–12:00")).toBeInTheDocument();
  });
});

describe("DeliveryPointCard — botón de mapa (aspecto)", () => {
  it("muestra un botón cuadrado con ícono en vez del link de texto, apuntando a la ubicación del punto", () => {
    const { container } = render(<DeliveryPointCard punto={puntoDePrueba({ latitud: -34.6, longitud: -58.4 })} viajeEstado="detenido" esPrimeroPendiente procesando={false} />);

    expect(screen.queryByText("Ver ubicación en el mapa")).not.toBeInTheDocument();
    const boton = screen.getByRole("link", { name: "Ver ubicación en el mapa" });
    expect(boton).toHaveClass("delivery-point-card__boton-mapa");
    expect(boton).toHaveAttribute("href", "https://www.google.com/maps?q=-34.6,-58.4");
    expect(container.querySelector(".delivery-point-card__boton-mapa svg")).toBeInTheDocument();
  });

  it("el botón de mapa aparece a la derecha del botón grande de comando, dentro de la misma fila", () => {
    const { container } = render(<DeliveryPointCard punto={puntoDePrueba()} viajeEstado="detenido" esPrimeroPendiente procesando={false} />);
    const fila = container.querySelector(".delivery-point-card__fila-acciones");
    expect(fila).toBeInTheDocument();
    expect(fila.querySelector(".delivery-point-card__acciones")).toBeInTheDocument();
    expect(fila.querySelector(".delivery-point-card__boton-mapa")).toBeInTheDocument();
  });

  it("no muestra el botón de mapa en un punto reducido", () => {
    const { container } = render(<DeliveryPointCard punto={puntoDePrueba()} viajeEstado="manejando" esActivo={false} reducido procesando={false} />);
    expect(container.querySelector(".delivery-point-card__boton-mapa")).not.toBeInTheDocument();
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
    expect(container.querySelector(".delivery-point-card__fila-acciones")).not.toBeInTheDocument();
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
