import { useState } from "react";
import { DeliveryPointCard } from "./DeliveryPointCard.jsx";

/**
 * Vista del recorrido guiada por el estado de viaje (005-chofer-estados-viaje,
 * US2): en Detenido muestra la lista completa de puntos pendientes (el
 * primero con INICIAR, el resto con IR PRIMERO — FR-006); en Manejando o
 * Descargando muestra el punto activo destacado y el resto de pendientes
 * reducidos (FR-008). Reemplaza el modelo de "marcado libre" de
 * 001-chofer-recorrido, que mostraba todos los puntos con sus botones de
 * arribo/descarga simultáneamente sin importar el orden.
 */
export function RouteView({ puntos, viajeEstado, puntoActivoId, onIniciar, onIrPrimero, onLlegue, onDescargaCompleta, procesando }) {
  // FINALIZAR (US5, FR-012/FR-013): puramente client-side — el recorrido ya
  // queda `finalizado` a nivel de datos apenas se completa el último punto
  // (regla derivada de 001-chofer-recorrido); este estado solo controla si
  // ya se mostró la confirmación explícita al chofer.
  const [finalizarConfirmado, setFinalizarConfirmado] = useState(false);

  const puntosOrdenados = [...puntos].sort((a, b) => a.orden - b.orden);
  const recorridoFinalizado = puntosOrdenados.length > 0 && puntosOrdenados.every((p) => p.estado === "completado");

  if (recorridoFinalizado) {
    if (finalizarConfirmado) {
      return (
        <p className="route-view__finalizado" role="status">
          Recorrido finalizado — todas las entregas fueron completadas.
        </p>
      );
    }
    return (
      <button type="button" className="route-view__finalizar" onClick={() => setFinalizarConfirmado(true)}>
        FINALIZAR
      </button>
    );
  }

  if (viajeEstado !== "manejando" && viajeEstado !== "descargando") {
    const pendientes = puntosOrdenados.filter((p) => p.estado === "pendiente");
    return (
      <ul className="route-view__lista">
        {pendientes.map((punto, index) => (
          <DeliveryPointCard
            key={punto.id}
            punto={punto}
            viajeEstado="detenido"
            esPrimeroPendiente={index === 0}
            onIniciar={onIniciar}
            onIrPrimero={onIrPrimero}
            procesando={procesando}
          />
        ))}
      </ul>
    );
  }

  const activo = puntosOrdenados.find((p) => p.id === puntoActivoId);
  const otrosPendientes = puntosOrdenados.filter((p) => p.estado === "pendiente" && p.id !== puntoActivoId);

  return (
    <ul className="route-view__lista">
      {activo && (
        <DeliveryPointCard
          key={activo.id}
          punto={activo}
          viajeEstado={viajeEstado}
          esActivo
          onLlegue={onLlegue}
          onDescargaCompleta={onDescargaCompleta}
          procesando={procesando}
        />
      )}
      {otrosPendientes.map((punto) => (
        <DeliveryPointCard key={punto.id} punto={punto} viajeEstado={viajeEstado} reducido procesando={procesando} />
      ))}
    </ul>
  );
}
