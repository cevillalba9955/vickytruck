import React, { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import "./styles.css";
import { MonitorView } from "./components/MonitorView.jsx";
import { AsignacionForm } from "./components/AsignacionForm.jsx";
import { RecorridoDetalle } from "./components/RecorridoDetalle.jsx";
import { HistorialView } from "./components/HistorialView.jsx";
import { listarActivos, obtenerDetalle, obtenerConfigMqtt } from "./services/api.js";
import { pollEvery } from "./services/polling.js";
import { conectar as conectarMqtt, suscribir as suscribirMqtt } from "./services/mqttClient.js";

const INTERVALO_POLLING_MS = 5000;

function extraerTokenDeTopic(topic) {
  // vickytruck/fletes/{token}/ubicacion
  return topic.split("/")[2] || null;
}

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

  // 003-mqtt-broker-fletes (FR-005, US1): suscripción directa al bróker,
  // aditiva al polling de arriba — si falla, el panel sigue funcionando vía
  // polling (research.md §5). Actualiza `ultimaUbicacion` del recorrido cuyo
  // `token` coincide con el del mensaje recibido, sin esperar al próximo tick.
  useEffect(() => {
    let cancelado = false;
    let dejarDeEscuchar;

    (async () => {
      try {
        const config = await obtenerConfigMqtt();
        if (cancelado) return;
        conectarMqtt(config);
        dejarDeEscuchar = suscribirMqtt(config.ubicacionTopicFilter, (topic, payload) => {
          const token = extraerTokenDeTopic(topic);
          if (!token || payload?.lat == null || payload?.lon == null) return;
          setActivos((actuales) =>
            actuales.map((r) =>
              r.token === token
                ? { ...r, ultimaUbicacion: { lat: payload.lat, lon: payload.lon, en: payload.en, reciente: true } }
                : r,
            ),
          );
        });
      } catch {
        // Sin credencial de servicio disponible (backend recién arrancando,
        // bróker no configurado aún): el panel sigue funcionando vía polling.
      }
    })();

    return () => {
      cancelado = true;
      if (dejarDeEscuchar) dejarDeEscuchar();
    };
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

// Principio III (v2.0.0): Central funciona igual embebida en un iframe de
// APEX o accedida directamente por su propia URL; ninguno de los dos modos
// bloquea ni degrada la funcionalidad.
createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
