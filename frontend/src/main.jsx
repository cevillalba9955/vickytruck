import React, { useCallback, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import "./styles.css";
import { RouteView } from "./components/RouteView.jsx";
import { ProgressSummary } from "./components/ProgressSummary.jsx";
import {
  ApiError,
  obtenerRecorrido,
  iniciarViaje,
  marcarLlegue,
  marcarDescargaCompleta,
  irPrimero,
  cancelarUltimaOperacion,
  descartarAccionEncolada,
  iniciarSincronizacionOffline,
} from "./services/api.js";
import { iniciarReportePeriodico } from "./services/ubicacionPeriodica.js";

const INTERVALO_UBICACION_DEFAULT_MS = 60000;

function obtenerTokenDeUrl() {
  return new URLSearchParams(window.location.search).get("token");
}

// Réplica client-side de moverPrimero (integracionStore.js) para la
// actualización optimista de IR PRIMERO (FR-014): el objetivo pasa al menor
// `orden` entre pendientes, el resto se corre una posición. El servidor es
// quien decide de verdad (research.md, Decisión 7); esto solo evita el
// parpadeo hasta que responde.
function calcularOrdenTrasIrPrimero(puntos, puntoId) {
  const pendientes = puntos.filter((p) => p.estado === "pendiente").sort((a, b) => a.orden - b.orden);
  const objetivo = pendientes.find((p) => p.id === puntoId);
  if (!objetivo) return null;
  const ordenesDisponibles = pendientes.map((p) => p.orden).sort((a, b) => a - b);
  const resto = pendientes.filter((p) => p.id !== puntoId);
  return [{ id: objetivo.id, orden: ordenesDisponibles[0] }, ...resto.map((p, i) => ({ id: p.id, orden: ordenesDisponibles[i + 1] }))];
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
  // Acción de viaje que quedó encolada offline (nunca llegó al servidor):
  // CANCELAR sobre ella es 100% local (FR-020a) — a diferencia de una
  // acción ya aplicada en el servidor, cuyo botón CANCELAR depende de
  // `recorrido.recorrido.puedeCancelar` (persistido server-side, FR-019).
  const [ultimaAccionEncolada, setUltimaAccionEncolada] = useState(null);

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

  const actualizarOrdenLocal = (puntosConOrden) => {
    setRecorrido((actual) => {
      if (!actual) return actual;
      const ordenPorId = new Map(puntosConOrden.map((p) => [p.id, p.orden]));
      const puntos = actual.puntos.map((p) => (ordenPorId.has(p.id) ? { ...p, orden: ordenPorId.get(p.id) } : p));
      return { ...actual, puntos };
    });
  };

  // Ciclo guiado (US2): aplica el cambio de estado de viaje (y, si corresponde,
  // el cambio de estado del punto activo) de forma optimista, reusando el
  // mismo patrón optimista + resync-en-409 que ya usaba el marcado libre.
  // Si la acción queda encolada offline, guarda el snapshot previo para que
  // CANCELAR (US4) pueda revertirla localmente sin esperar al servidor.
  const ejecutarAccionViaje = async (viajeEstadoOptimista, puntoActivoOptimista, cambiosPuntoOptimista, enviar) => {
    const viajeEstadoAntes = recorrido?.recorrido?.viajeEstado ?? "detenido";
    const puntoActivoAntes = recorrido?.recorrido?.puntoActivoId ?? null;
    const puntoAntes = recorrido?.puntos?.find((p) => p.id === puntoActivoAntes) ?? null;

    setProcesandoViaje(true);
    setUltimaAccionEncolada(null); // cualquier acción nueva reemplaza el rastro de la anterior (FR-018)
    actualizarViajeLocal({ viajeEstado: viajeEstadoOptimista, puntoActivoId: puntoActivoOptimista });
    if (cambiosPuntoOptimista && puntoActivoAntes) {
      actualizarPuntoLocal(puntoActivoAntes, cambiosPuntoOptimista);
    }
    try {
      const resultado = await enviar(token);
      if (resultado.queued) {
        setUltimaAccionEncolada({
          id: resultado.id,
          snapshotViaje: { viajeEstado: viajeEstadoAntes, puntoActivoId: puntoActivoAntes },
          puntoId: puntoActivoAntes,
          snapshotPunto: puntoAntes ? { estado: puntoAntes.estado, arriboEn: puntoAntes.arriboEn, descargaEn: puntoAntes.descargaEn } : null,
        });
      } else {
        actualizarViajeLocal({
          viajeEstado: resultado.data.viajeEstado,
          puntoActivoId: resultado.data.puntoActivoId,
          puedeCancelar: resultado.data.puedeCancelar,
        });
        if (resultado.data.puntoEstado && puntoActivoAntes) {
          actualizarPuntoLocal(puntoActivoAntes, {
            estado: resultado.data.puntoEstado,
            arriboEn: resultado.data.arriboEn,
            descargaEn: resultado.data.descargaEn,
          });
        }
      }
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

  const handleIrPrimero = async (puntoId) => {
    const ordenPrevio = (recorrido?.puntos ?? [])
      .filter((p) => p.estado === "pendiente")
      .map((p) => ({ id: p.id, orden: p.orden }));
    const puntosConOrden = calcularOrdenTrasIrPrimero(recorrido?.puntos ?? [], puntoId);
    if (!puntosConOrden) return;

    setProcesandoViaje(true);
    setUltimaAccionEncolada(null);
    actualizarOrdenLocal(puntosConOrden);
    try {
      const resultado = await irPrimero(token, puntoId);
      if (resultado.queued) {
        setUltimaAccionEncolada({ id: resultado.id, ordenPrevio });
      } else {
        actualizarOrdenLocal(resultado.data.puntos);
        actualizarViajeLocal({ puedeCancelar: resultado.data.puedeCancelar });
      }
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        await cargarRecorrido();
      }
    } finally {
      setProcesandoViaje(false);
    }
  };

  // CANCELAR (US4): si la última acción sigue encolada offline, se descarta
  // localmente sin red (FR-020a); si no, se revierte contra el servidor
  // (FR-017 a FR-020) y se resincroniza el recorrido completo — más simple
  // y confiable que reconstruir a mano el snapshot restaurado (que para
  // IR PRIMERO afecta el orden de varios puntos a la vez).
  const handleCancelar = async () => {
    if (ultimaAccionEncolada) {
      descartarAccionEncolada(ultimaAccionEncolada.id);
      if ("ordenPrevio" in ultimaAccionEncolada) {
        actualizarOrdenLocal(ultimaAccionEncolada.ordenPrevio);
      } else {
        actualizarViajeLocal(ultimaAccionEncolada.snapshotViaje);
        if (ultimaAccionEncolada.puntoId && ultimaAccionEncolada.snapshotPunto) {
          actualizarPuntoLocal(ultimaAccionEncolada.puntoId, ultimaAccionEncolada.snapshotPunto);
        }
      }
      setUltimaAccionEncolada(null);
      return;
    }

    setProcesandoViaje(true);
    try {
      await cancelarUltimaOperacion(token);
      await cargarRecorrido();
    } catch {
      // 409 nada_para_cancelar: el botón no debería haberse mostrado; no hay
      // nada que corregir en la UI, se ignora.
    } finally {
      setProcesandoViaje(false);
    }
  };

  const puedeCancelar = ultimaAccionEncolada != null || (recorrido?.recorrido?.puedeCancelar ?? false);

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
        onIrPrimero={handleIrPrimero}
        onLlegue={handleLlegue}
        onDescargaCompleta={handleDescargaCompleta}
        onCancelar={handleCancelar}
        puedeCancelar={puedeCancelar}
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
