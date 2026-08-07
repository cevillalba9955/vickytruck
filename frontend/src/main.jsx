import React, { useCallback, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import "./styles.css";
import { RouteView } from "./components/RouteView.jsx";
import { ProgressSummary } from "./components/ProgressSummary.jsx";
import { ApiError, obtenerRecorrido, iniciarViaje, marcarLlegue, marcarDescargaCompleta, iniciarSincronizacionOffline } from "./services/api.js";
import { iniciarReportePeriodico } from "./services/ubicacionPeriodica.js";

const INTERVALO_UBICACION_DEFAULT_MS = 60000;

function obtenerTokenDeUrl() {
  return new URLSearchParams(window.location.search).get("token");
}

function App() {
  const [token] = useState(obtenerTokenDeUrl);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState(null);
  const [recorrido, setRecorrido] = useState(null);
  // Solo una acción de viaje puede estar en curso a la vez (un único punto
  // activo, 005-chofer-estados-viaje) — a diferencia del marcado libre de
  // 001-chofer-recorrido, no hace falta rastrear "procesando" por punto.
  const [procesandoViaje, setProcesandoViaje] = useState(false);

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

  // FR-014: reporte periódico de ubicación instantánea mientras el recorrido
  // está activo; el intervalo lo decide el backend (recorrido.intervaloUbicacionMs).
  const intervaloUbicacionMs = recorrido?.recorrido?.intervaloUbicacionMs ?? INTERVALO_UBICACION_DEFAULT_MS;
  const fleteId = recorrido?.recorrido?.fleteId ?? null;
  const mqttConfig = recorrido?.recorrido?.mqtt ?? null;
  useEffect(() => {
    if (!token || !fleteId) return undefined;
    return iniciarReportePeriodico(token, fleteId, mqttConfig, intervaloUbicacionMs);
  }, [token, fleteId, mqttConfig, intervaloUbicacionMs]);

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

  const actualizarViajeLocal = (cambios) => {
    setRecorrido((actual) => (actual ? { ...actual, recorrido: { ...actual.recorrido, ...cambios } } : actual));
  };

  // Ciclo guiado (US2): aplica el cambio de estado de viaje (y, si corresponde,
  // el cambio de estado del punto activo) de forma optimista, reusando el
  // mismo patrón optimista + resync-en-409 que ya usaba el marcado libre.
  const ejecutarAccionViaje = async (viajeEstadoOptimista, puntoActivoOptimista, cambiosPuntoOptimista, enviar) => {
    const puntoActivoAntes = recorrido?.recorrido?.puntoActivoId ?? null;
    setProcesandoViaje(true);
    actualizarViajeLocal({ viajeEstado: viajeEstadoOptimista, puntoActivoId: puntoActivoOptimista });
    if (cambiosPuntoOptimista && puntoActivoAntes) {
      actualizarPuntoLocal(puntoActivoAntes, cambiosPuntoOptimista);
    }
    try {
      const resultado = await enviar(token);
      if (!resultado.queued) {
        actualizarViajeLocal({ viajeEstado: resultado.data.viajeEstado, puntoActivoId: resultado.data.puntoActivoId });
        if (resultado.data.puntoEstado && puntoActivoAntes) {
          actualizarPuntoLocal(puntoActivoAntes, {
            estado: resultado.data.puntoEstado,
            arriboEn: resultado.data.arriboEn,
            descargaEn: resultado.data.descargaEn,
          });
        }
      }
      // Si quedó encolada (offline), se deja el estado optimista: la cola la
      // sincroniza sola cuando vuelve la conectividad.
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        // Nuestra vista optimista quedó desincronizada del servidor (otro
        // dispositivo ya actuó, o Central resincronizó): resincronizar.
        await cargarRecorrido();
      }
    } finally {
      setProcesandoViaje(false);
    }
  };

  const primerPendiente = [...(recorrido?.puntos ?? [])]
    .filter((p) => p.estado === "pendiente")
    .sort((a, b) => a.orden - b.orden)[0];

  const handleIniciar = () => {
    if (!primerPendiente) return;
    ejecutarAccionViaje("manejando", primerPendiente.id, null, iniciarViaje);
  };
  const handleLlegue = () => {
    const puntoActivoId = recorrido?.recorrido?.puntoActivoId ?? null;
    ejecutarAccionViaje("descargando", puntoActivoId, { estado: "arribado" }, marcarLlegue);
  };
  const handleDescargaCompleta = () => {
    ejecutarAccionViaje("detenido", null, { estado: "completado" }, marcarDescargaCompleta);
  };

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
        viajeEstado={recorrido.recorrido?.viajeEstado ?? "detenido"}
        puntoActivoId={recorrido.recorrido?.puntoActivoId ?? null}
        onIniciar={handleIniciar}
        onLlegue={handleLlegue}
        onDescargaCompleta={handleDescargaCompleta}
        procesando={procesandoViaje}
      />
    </main>
  );
}

createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
