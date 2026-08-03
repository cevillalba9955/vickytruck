import React, { useCallback, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import "./styles.css";
import { RouteView } from "./components/RouteView.jsx";
import { ProgressSummary } from "./components/ProgressSummary.jsx";
import { ApiError, obtenerRecorrido, marcarArribo, marcarDescarga, iniciarSincronizacionOffline } from "./services/api.js";

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

  const ejecutarAccion = async (tipo, puntoId, estadoOptimista, enviar) => {
    setProcesandoPuntoId(puntoId);
    actualizarPuntoLocal(puntoId, { estado: estadoOptimista });
    try {
      const resultado = await enviar(token, puntoId);
      if (!resultado.queued) {
        actualizarPuntoLocal(puntoId, {
          estado: resultado.data.estado,
          arriboEn: resultado.data.arriboEn,
          descargaEn: resultado.data.descargaEn,
        });
      }
      // Si quedó encolada (offline), se deja el estado optimista: la cola la
      // sincroniza sola cuando vuelve la conectividad (FR-010).
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        // Nuestra vista optimista quedó desincronizada del servidor: resincronizar.
        await cargarRecorrido();
      }
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
