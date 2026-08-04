import { afterEach, describe, expect, it } from "vitest";
import { leerPayloadDeUrl } from "../../src/services/enlacePayload.js";

function payloadValido(puntos = [{ id: "p1", orden: 1, totalPuntos: 1, latitud: -34.6, longitud: -58.4, estado: "pendiente" }]) {
  return {
    recorrido: {
      estado: "activo",
      mqtt: {
        url: "wss://broker.example:8084/mqtt",
        username: "tok-1",
        password: "secreto",
        ubicacionTopic: "vickytruck/fletes/tok-1/ubicacion",
        eventosTopic: "vickytruck/fletes/tok-1/eventos",
        intervaloUbicacionMs: 60000,
      },
    },
    progreso: { pendientes: puntos.length, arribados: 0, completados: 0 },
    puntos,
  };
}

function codificar(payload) {
  const json = JSON.stringify(payload);
  const b64 = btoa(unescape(encodeURIComponent(json)));
  return b64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function setHash(hash) {
  window.location.hash = hash;
}

describe("enlacePayload — leerPayloadDeUrl (004-chofer-cloud-broker, contracts/enlace-recorrido.md)", () => {
  afterEach(() => {
    setHash("");
  });

  it("decodifica un payload válido embebido en #/r/<base64url>", () => {
    const payload = payloadValido();
    setHash(`#/r/${codificar(payload)}`);

    expect(leerPayloadDeUrl()).toEqual(payload);
  });

  it("devuelve null si no hay fragmento en la URL", () => {
    setHash("");
    expect(leerPayloadDeUrl()).toBeNull();
  });

  it("devuelve null si el fragmento no matchea el patrón #/r/...", () => {
    setHash("#otracosa");
    expect(leerPayloadDeUrl()).toBeNull();
  });

  it("devuelve null si el Base64 es inválido", () => {
    setHash("#/r/!!!no-es-base64!!!");
    expect(leerPayloadDeUrl()).toBeNull();
  });

  it("devuelve null si el JSON decodificado es inválido", () => {
    const b64 = btoa("esto no es json").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
    setHash(`#/r/${b64}`);
    expect(leerPayloadDeUrl()).toBeNull();
  });

  it("devuelve null si faltan campos de mqtt", () => {
    const payload = payloadValido();
    delete payload.recorrido.mqtt.password;
    setHash(`#/r/${codificar(payload)}`);
    expect(leerPayloadDeUrl()).toBeNull();
  });

  it("devuelve null si puntos está vacío", () => {
    const payload = payloadValido([]);
    setHash(`#/r/${codificar(payload)}`);
    expect(leerPayloadDeUrl()).toBeNull();
  });

  it("devuelve null si puntos tiene más de 10 elementos (Principio II)", () => {
    const puntos = Array.from({ length: 11 }, (_, i) => ({
      id: `p${i}`,
      orden: i + 1,
      totalPuntos: 11,
      latitud: 0,
      longitud: 0,
      estado: "pendiente",
    }));
    setHash(`#/r/${codificar(payloadValido(puntos))}`);
    expect(leerPayloadDeUrl()).toBeNull();
  });
});
