import React, { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import "./styles.css";
import { RouteView } from "./components/RouteView.jsx";
import { ProgressSummary } from "./components/ProgressSummary.jsx";
import { ConnectionBanner } from "./components/ConnectionBanner.jsx";
import { marcarArribo, marcarDescarga, iniciarSincronizacionOffline } from "./services/api.js";
import { leerPayloadDeUrl } from "./services/enlacePayload.js";
import { iniciarReportePeriodico } from "./services/ubicacionPeriodica.js";
import { conectar as conectarMqtt, onEstadoCambio } from "./services/mqttClient.js";
import { obtenerDeviceId } from "./services/deviceId.js";

const INTERVALO_UBICACION_DEFAULT_MS = 60000;

function App() {
  // 004-chofer-cloud-broker: el payload (puntos + config MQTT) llega
  // embebido en el fragmento de la URL (FR-002a) — se lee una sola vez, de
  // forma síncrona, al montar; no hay ningún `fetch` involucrado en mostrar
  // el recorrido (a diferencia del `GET /api/recorridos/:token` retirado).
  const [payloadInicial] = useState(leerPayloadDeUrl);
  const [recorrido, setRecorrido] = useState(payloadInicial);
  const [procesandoPuntoId, setProcesandoPuntoId] = useState(null);

  const token = recorrido?.recorrido?.mqtt?.username ?? null;
  const error = payloadInicial ? null : "enlace_invalido";

  // FR-010: reintento automático de la cola offline al recuperar conectividad.
  useEffect(() => {
    if (!token) return undefined;
    return iniciarSincronizacionOffline();
  }, [token]);

  // FR-004: conecta al bróker MQTT con la config ya recibida en el payload
  // embebido y arranca el reporte periódico de ubicación instantánea
  // mientras el recorrido está activo (003-mqtt-broker-fletes). El estado
  // "cargando" ya no cubre la obtención del recorrido (no hay red
  // involucrada en eso): cubre solo esta conexión al bróker.
  const [cargando, setCargando] = useState(() => Boolean(payloadInicial));
  const [estadoConexion, setEstadoConexion] = useState(null);
  const mqttConfig = recorrido?.recorrido?.mqtt;
  const intervaloUbicacionMs = mqttConfig?.intervaloUbicacionMs ?? INTERVALO_UBICACION_DEFAULT_MS;
  useEffect(() => {
    if (!token || !mqttConfig) return undefined;
    const desuscribir = onEstadoCambio(setEstadoConexion);
    conectarMqtt({ ...mqttConfig, clientId: obtenerDeviceId() });
    setCargando(false);
    const detenerReporte = iniciarReportePeriodico(mqttConfig.ubicacionTopic, intervaloUbicacionMs);
    return () => {
      desuscribir();
      detenerReporte();
    };
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
      <ConnectionBanner estadoConexion={estadoConexion} />
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
