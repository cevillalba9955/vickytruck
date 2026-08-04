import React, { useCallback, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import "./styles.css";
import { RouteView } from "./components/RouteView.jsx";
import { ProgressSummary } from "./components/ProgressSummary.jsx";
import { ApiError, obtenerRecorrido, marcarArribo, marcarDescarga, iniciarSincronizacionOffline } from "./services/api.js";
import { iniciarReportePeriodico } from "./services/ubicacionPeriodica.js";
import { conectar as conectarMqtt } from "./services/mqttClient.js";

const INTERVALO_UBICACION_DEFAULT_MS = 60000;

function obtenerTokenDeUrl() {
  return new URLSearchParams(window.location.search).get("token");
}

function App() {
  const [token] = useState(obtenerTokenDeUrl);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState(null);
  const [recorrido, setRecorrido] = useState(null);
  const [procesandoPuntoId, setProcesandoPuntoId] = useState(null);

  const cargarRecorrido = useCallback(async () => {
    if (!token) {
      setError("enlace_invalido");
      setCargando(false);
      return;
    }
    try {
      const data = await obtenerRecorrido(token);
      setRecorrido(data);
      setError(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.codigo : "error_desconocido");
    } finally {
      setCargando(false);
    }
  }, [token]);

  useEffect(() => {
    cargarRecorrido();
  }, [cargarRecorrido]);

  // FR-010: reintento automático de la cola offline al recuperar conectividad.
  useEffect(() => {
    if (!token) return undefined;
    return iniciarSincronizacionOffline();
  }, [token]);

  // FR-001, FR-014: conecta al bróker MQTT con la config recibida de GET
  // /:token y arranca el reporte periódico de ubicación instantánea mientras
  // el recorrido está activo (003-mqtt-broker-fletes).
  const mqttConfig = recorrido?.recorrido?.mqtt;
  const intervaloUbicacionMs = mqttConfig?.intervaloUbicacionMs ?? INTERVALO_UBICACION_DEFAULT_MS;
  useEffect(() => {
    if (!token || !mqttConfig) return undefined;
    conectarMqtt(mqttConfig);
    return iniciarReportePeriodico(mqttConfig.ubicacionTopic, intervaloUbicacionMs);
  }, [token, mqttConfig, intervaloUbicacionMs]);

  const actualizarPuntoLocal = (puntoId, cambios) => {
    setRecorrido((actual) => {
      if (!actual) return actual;
      const puntos = actual.puntos.map((p) => (p.id === puntoId ? { ...p, ...cambios } : p));
      const progreso = { pendientes: 0, arribados: 0, completados: 0 };
      for (const p of puntos) {
        if (p.estado === "pendiente") progreso.pendientes += 1;
        else if (p.estado === "arribado") progreso.arribados += 1;
        else if (p.estado === "completado") progreso.completados += 1;
      }
      return { ...actual, puntos, progreso };
    });
  };

  // 003-mqtt-broker-fletes: publicar por MQTT no tiene una respuesta
  // síncrona con el nuevo estado del punto (a diferencia del POST HTTP que
  // reemplaza), así que la actualización optimista de abajo pasa a ser la
  // única fuente del estado mostrado; el backend aplica la transición real
  // de forma asíncrona al recibir el mensaje (descartando silenciosamente
  // cualquier transición inválida, FR-013 de spec.md).
  const ejecutarAccion = async (tipo, puntoId, estadoOptimista, enviar) => {
    setProcesandoPuntoId(puntoId);
    actualizarPuntoLocal(puntoId, { estado: estadoOptimista });
    try {
      await enviar(token, puntoId);
      // Si quedó encolada (offline), se deja igual el estado optimista: la
      // cola la sincroniza sola cuando vuelve la conectividad (FR-010).
    } finally {
      setProcesandoPuntoId(null);
    }
  };

  const handleMarcarArribo = (puntoId) => ejecutarAccion("arribo", puntoId, "arribado", marcarArribo);
  const handleMarcarDescarga = (puntoId) => ejecutarAccion("descarga", puntoId, "completado", marcarDescarga);

  if (cargando) {
    return <p role="status">Cargando recorrido…</p>;
  }

  if (error) {
    return <p role="alert">Este enlace no es válido o ya no está disponible.</p>;
  }

  return (
    <main className="app">
      <ProgressSummary progreso={recorrido.progreso} />
      <RouteView
        puntos={recorrido.puntos}
        onMarcarArribo={handleMarcarArribo}
        onMarcarDescarga={handleMarcarDescarga}
        procesandoPuntoId={procesandoPuntoId}
      />
    </main>
  );
}

createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
