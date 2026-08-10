import React, { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import "leaflet/dist/leaflet.css";
import "./styles.css";
import { MonitorView } from "./components/MonitorView.jsx";
import { RecorridoDetalle } from "./components/RecorridoDetalle.jsx";
import { HistorialView } from "./components/HistorialView.jsx";
import { MapaSeguimiento } from "./components/MapaSeguimiento.jsx";
import { listarActivos, obtenerDetalle } from "./services/api.js";
import { pollEvery } from "./services/polling.js";
import { conectarUbicacionEnTiempoReal } from "./services/mqttClient.js";
import { construirMarcadoresFlete } from "./services/marcadores.js";

// 2026-08-10 (spec.md FR-005 activado, research.md Decisión 11): MQTT pasa
// a ser la vía principal de ubicación en vivo. El polling REST no se
// elimina — sigue siendo necesario para todo lo que MQTT no transporta
// (nuevos recorridos activos, progreso, viajeEstado/puntoActivoId,
// historial) — pero baja de cadencia cuando MQTT está conectado, actuando
// como respaldo de reconciliación en vez de la vía principal. Si MQTT se
// cae/reconecta, vuelve a la cadencia rápida original.
const INTERVALO_POLLING_MQTT_CONECTADO_MS = 30000;
const INTERVALO_POLLING_RESPALDO_MS = 5000;

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
  // recarga manual de la página. Cadencia dinámica: respaldo lento mientras
  // MQTT esté conectado (FR-005), vuelve a la cadencia rápida si no.
  const intervaloPolling = mqttEstado === "connected" ? INTERVALO_POLLING_MQTT_CONECTADO_MS : INTERVALO_POLLING_RESPALDO_MS;
  useEffect(() => {
    return pollEvery(intervaloPolling, async () => {
      try {
        setActivos(await listarActivos());
        setError(null);
      } catch {
        setError("error_desconocido");
      }
    });
  }, [intervaloPolling]);

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
        <button type="button" aria-pressed={vista === "mapa"} onClick={() => setVista("mapa")}>
          Mapa
        </button>
        <button type="button" aria-pressed={vista === "historial"} onClick={() => setVista("historial")}>
          Historial
        </button>
      </nav>

      {error && <p role="alert">No se pudo actualizar el panel; reintentando…</p>}
      {mqttEstado !== "disabled" && <p role="status">Canal tiempo real MQTT: {mqttEstado}</p>}

      {vista === "monitor" && <MonitorView recorridos={activos} onSeleccionar={abrirDetalle} />}
      {vista === "mapa" && (
        <MapaSeguimiento
          marcadoresFlete={construirMarcadoresFlete(activos)}
          hayDatos={activos.length > 0}
          onSeleccionarFlete={abrirDetalle}
        />
      )}
      {vista === "detalle" && (
        <>
          <button type="button" onClick={() => setVista("monitor")}>
            ← Volver al monitoreo
          </button>
          <RecorridoDetalle
            detalle={detalle}
            marcadorFlete={construirMarcadoresFlete(activos).find(
              (m) => String(m.recorridoId) === String(detalle?.recorrido?.id),
            )}
          />
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
