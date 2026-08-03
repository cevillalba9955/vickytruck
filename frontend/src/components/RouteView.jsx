import { DeliveryPointCard } from "./DeliveryPointCard.jsx";

/**
 * Lista ordenada de los puntos de entrega del recorrido (US1), con las
 * acciones de marcado (US2/US3) y la confirmación de recorrido finalizado
 * (FR-009) cuando todos los puntos quedan "completado".
 */
export function RouteView({ puntos, onMarcarArribo, onMarcarDescarga, procesandoPuntoId }) {
  const puntosOrdenados = [...puntos].sort((a, b) => a.orden - b.orden);
  const recorridoFinalizado = puntosOrdenados.length > 0 && puntosOrdenados.every((p) => p.estado === "completado");

  return (
    <section className="route-view">
      {recorridoFinalizado && (
        <p className="route-view__finalizado" role="status">
          Recorrido finalizado — todas las entregas fueron completadas.
        </p>
      )}
      <ul className="route-view__lista">
        {puntosOrdenados.map((punto) => (
          <DeliveryPointCard
            key={punto.id}
            punto={punto}
            onMarcarArribo={onMarcarArribo}
            onMarcarDescarga={onMarcarDescarga}
            procesando={procesandoPuntoId === punto.id}
          />
        ))}
      </ul>
    </section>
  );
}
