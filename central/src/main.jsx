import React, { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import "./styles.css";
import { MonitorView } from "./components/MonitorView.jsx";
import { RecorridoDetalle } from "./components/RecorridoDetalle.jsx";
import { HistorialView } from "./components/HistorialView.jsx";
import { listarActivos, obtenerDetalle } from "./services/api.js";
import { pollEvery } from "./services/polling.js";
import { conectarUbicacionEnTiempoReal } from "./services/mqttClient.js";

const INTERVALO_POLLING_MS = 5000;

function App() {
  const [vista, setVista] = useState("monitor");
  const [activos, setActivos] = useState([]);
  const [error, setError] = useState(null);
  const [detalle, setDetalle] = useState(null);
  const [mqttEstado, setMqttEstado] = useState("disabled");

  const aplicarUbicacionViva = (lista, evento) =>
    lista.map((r) => {
      if (String(r.flete?.id) !== String(evento.fleteId)) return r;
      return {
        ...r,
        ultimaUbicacion: {
          lat: evento.lat,
          lon: evento.lon,
          en: evento.en,
          reciente: true,
        },
      };
    });

  const abrirDetalle = async (id) => {
    setDetalle(await obtenerDetalle(id));
    setVista("detalle");
  };

  // Historia 1 (FR-001, FR-002): refresco automático por polling, sin
  // recarga manual de la página.
  useEffect(() => {
    return pollEvery(INTERVALO_POLLING_MS, async () => {
      try {
        setActivos(await listarActivos());
        setError(null);
      } catch {
        setError("error_desconocido");
      }
    });
  }, []);

  useEffect(() => {
    return conectarUbicacionEnTiempoReal({
      onEstado: setMqttEstado,
      onEvento: (evento) => {
        setActivos((prev) => aplicarUbicacionViva(prev, evento));
      },
    });
  }, []);

  return (
    <main className="app">
      <h1>Central — Panel de control</h1>
      <nav className="app__nav">
        <button type="button" aria-pressed={vista === "monitor"} onClick={() => setVista("monitor")}>
          Monitoreo
        </button>
        <button type="button" aria-pressed={vista === "historial"} onClick={() => setVista("historial")}>
          Historial
        </button>
      </nav>

      {error && <p role="alert">No se pudo actualizar el panel; reintentando…</p>}
      {mqttEstado !== "disabled" && <p role="status">Canal tiempo real MQTT: {mqttEstado}</p>}

      {vista === "monitor" && <MonitorView recorridos={activos} onSeleccionar={abrirDetalle} />}
      {vista === "detalle" && (
        <>
          <button type="button" onClick={() => setVista("monitor")}>
            ← Volver al monitoreo
          </button>
          <RecorridoDetalle detalle={detalle} />
        </>
      )}
      {vista === "historial" && <HistorialView />}
    </main>
  );
}

// Principio III (v2.0.0): Central funciona igual embebida en un iframe de
// APEX o accedida directamente por su propia URL; ninguno de los dos modos
// bloquea ni degrada la funcionalidad.
createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
