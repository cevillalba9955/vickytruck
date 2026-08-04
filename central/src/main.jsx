import React, { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import "./styles.css";
import { MonitorView } from "./components/MonitorView.jsx";
import { AsignacionForm } from "./components/AsignacionForm.jsx";
import { RecorridoDetalle } from "./components/RecorridoDetalle.jsx";
import { HistorialView } from "./components/HistorialView.jsx";
import { FueraDeIframeNotice } from "./components/FueraDeIframeNotice.jsx";
import { estaEmbebidoEnIframe } from "./services/embedGuard.js";
import { listarActivos, obtenerDetalle } from "./services/api.js";
import { pollEvery } from "./services/polling.js";

const INTERVALO_POLLING_MS = 5000;

function App() {
  const [vista, setVista] = useState("monitor");
  const [activos, setActivos] = useState([]);
  const [error, setError] = useState(null);
  const [detalleId, setDetalleId] = useState(null);
  const [detalle, setDetalle] = useState(null);

  const abrirDetalle = async (id) => {
    setDetalleId(id);
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

  return (
    <main className="app">
      <h1>Central — Panel de control</h1>
      <nav className="app__nav">
        <button type="button" aria-pressed={vista === "monitor"} onClick={() => setVista("monitor")}>
          Monitoreo
        </button>
        <button type="button" aria-pressed={vista === "asignar"} onClick={() => setVista("asignar")}>
          Asignar recorrido
        </button>
        <button type="button" aria-pressed={vista === "historial"} onClick={() => setVista("historial")}>
          Historial
        </button>
      </nav>

      {error && <p role="alert">No se pudo actualizar el panel; reintentando…</p>}

      {vista === "monitor" && <MonitorView recorridos={activos} onSeleccionar={abrirDetalle} />}
      {vista === "asignar" && <AsignacionForm onAsignado={() => setVista("monitor")} />}
      {vista === "detalle" && (
        <>
          <button type="button" onClick={() => setVista("monitor")}>
            ← Volver al monitoreo
          </button>
          <RecorridoDetalle detalle={detalle} onReasignado={() => abrirDetalle(detalleId)} />
        </>
      )}
      {vista === "historial" && <HistorialView />}
    </main>
  );
}

const raiz = createRoot(document.getElementById("root"));

if (!estaEmbebidoEnIframe()) {
  raiz.render(<FueraDeIframeNotice />);
} else {
  raiz.render(
    <React.StrictMode>
      <App />
    </React.StrictMode>,
  );
}
