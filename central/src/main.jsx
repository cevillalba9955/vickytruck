import React, { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { ConfigProvider, Card, Button, Alert } from "antd";
import { ArrowLeftOutlined } from "@ant-design/icons";
import "leaflet/dist/leaflet.css";
import "./styles.css";
import { themeConfig } from "./theme/tokens.js";
import { AppShell } from "./components/AppShell.jsx";
import { MonitorView } from "./components/MonitorView.jsx";
import { RecorridoDetalle } from "./components/RecorridoDetalle.jsx";
import { HistorialView } from "./components/HistorialView.jsx";
import { MapaSeguimiento } from "./components/MapaSeguimiento.jsx";
import { listarActivos, obtenerDetalle } from "./services/api.js";
import { pollEvery } from "./services/polling.js";
import { conectarUbicacionEnTiempoReal } from "./services/mqttClient.js";
import { construirMarcadoresFlete, construirMarcadoresMapaUnificado } from "./services/marcadores.js";

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
  // Sección desde la que se abrió el Detalle: permite que el botón de
  // alternar sección del header, y el texto "Volver a…" del propio Detalle,
  // sigan reflejando de dónde vino el operador (009-central-mejora-visual,
  // US2). Monitoreo y Mapa se unificaron en una sola sección
  // (011-unificar-monitoreo-mapa), así que hoy siempre vale "monitor".
  const [origenDetalle, setOrigenDetalle] = useState("monitor");
  const [activos, setActivos] = useState([]);
  // puntoSalidaDefault (010-mapa-central-unificado, US4): constante del
  // backend, siempre presente aunque `activos` esté vacío.
  const [puntoSalidaDefault, setPuntoSalidaDefault] = useState(null);
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
    setOrigenDetalle(vista);
    setDetalle(await obtenerDetalle(id));
    setVista("detalle");
  };

  // Historia 1 (FR-001, FR-002): refresco automático por polling, sin
  // recarga manual de la página. Cadencia dinámica: respaldo lento mientras
  // MQTT esté conectado (FR-005), vuelve a la cadencia rápida si no.
  const intervaloPolling = mqttEstado === "connected" ? INTERVALO_POLLING_MQTT_CONECTADO_MS : INTERVALO_POLLING_RESPALDO_MS;
  const idDetalleAbierto = vista === "detalle" ? detalle?.recorrido?.id : null;
  useEffect(() => {
    return pollEvery(intervaloPolling, async () => {
      try {
        const [{ recorridos: nuevosActivos, puntoSalidaDefault: nuevoPuntoSalidaDefault }, nuevoDetalle] = await Promise.all([
          listarActivos(),
          // 009-central-mejora-visual: mientras se está viendo el Detalle de
          // un recorrido activo (abierto desde Monitoreo/Mapa), se refresca
          // con la misma cadencia que Monitoreo — antes quedaba congelado en
          // la foto del momento en que se abrió "Ver detalle".
          idDetalleAbierto ? obtenerDetalle(idDetalleAbierto) : Promise.resolve(null),
        ]);
        setActivos(nuevosActivos);
        setPuntoSalidaDefault(nuevoPuntoSalidaDefault);
        if (nuevoDetalle) setDetalle(nuevoDetalle);
        setError(null);
      } catch {
        setError("error_desconocido");
      }
    });
  }, [intervaloPolling, idDetalleAbierto]);

  useEffect(() => {
    return conectarUbicacionEnTiempoReal({
      onEstado: setMqttEstado,
      onEvento: (evento) => {
        setActivos((prev) => aplicarUbicacionViva(prev, evento));
      },
    });
  }, []);

  return (
    <AppShell
      seccion={vista === "detalle" ? origenDetalle : vista}
      onCambiarSeccion={setVista}
      mqttEstado={mqttEstado}
    >
      {error && (
        <Alert
          role="alert"
          type="error"
          showIcon
          title="No se pudo actualizar el panel; reintentando…"
          style={{ marginBottom: 12 }}
        />
      )}

      {vista === "monitor" && (
        <>
          <MonitorView recorridos={activos} onSeleccionar={abrirDetalle} />
          {/* 011-unificar-monitoreo-mapa: el mapa pasa a vivir debajo de la
              grilla de Monitoreo en la misma sección, en vez de una pestaña
              separada — maximiza el área de visualización disponible ahora
              que no hay menú lateral. */}
          <Card style={{ marginTop: 16 }}>
            <MapaSeguimiento
              marcadoresUnificados={construirMarcadoresMapaUnificado(activos, puntoSalidaDefault)}
              hayDatos={activos.length > 0}
              onSeleccionarFlete={abrirDetalle}
            />
          </Card>
        </>
      )}
      {vista === "detalle" && (
        <RecorridoDetalle
          detalle={detalle}
          marcadorFlete={construirMarcadoresFlete(activos).find(
            (m) => String(m.recorridoId) === String(detalle?.recorrido?.id),
          )}
          accionVolver={
            <Button type="text" icon={<ArrowLeftOutlined />} onClick={() => setVista(origenDetalle)}>
              Volver al monitoreo
            </Button>
          }
        />
      )}
      {vista === "historial" && <HistorialView />}
    </AppShell>
  );
}

// Principio III (v2.0.0): Central funciona igual embebida en un iframe de
// APEX o accedida directamente por su propia URL; ninguno de los dos modos
// bloquea ni degrada la funcionalidad.
createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <ConfigProvider theme={themeConfig}>
      <App />
    </ConfigProvider>
  </React.StrictMode>,
);
