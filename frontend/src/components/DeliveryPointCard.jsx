const ETIQUETAS_ESTADO = {
  pendiente: "Pendiente",
  arribado: "Arribado",
  completado: "Completado",
};

function enlaceMapa(latitud, longitud) {
  return `https://www.google.com/maps?q=${latitud},${longitud}`;
}

/**
 * Tarjeta de un punto de entrega. El chofer puede marcar arribo (US2) o
 * descarga completa (US3) desde acá; ambas acciones están disponibles para
 * cualquier punto pendiente/arribado, sin depender del orden de los demás
 * puntos (marcado libre, ver Clarifications de spec.md).
 */
export function DeliveryPointCard({ punto, onMarcarArribo, onMarcarDescarga, procesando }) {
  return (
    <li className="delivery-point-card" data-estado={punto.estado} aria-busy={procesando || undefined}>
      <div className="delivery-point-card__header">
        <span className="delivery-point-card__orden">
          {punto.orden} de {punto.totalPuntos}
        </span>
        <span className="delivery-point-card__estado">{ETIQUETAS_ESTADO[punto.estado] ?? punto.estado}</span>
      </div>

      <a
        className="delivery-point-card__ubicacion"
        href={enlaceMapa(punto.latitud, punto.longitud)}
        target="_blank"
        rel="noreferrer"
      >
        Ver ubicación en el mapa
      </a>

      {/* Info provista por Central vía sincronizar_recorrido (005-chofer-estados-viaje,
          FR-002). Cada campo se omite con normalidad si no vino (FR-004);
          remitoIds NUNCA llega hasta acá — ver serializePunto en recorrido.js (FR-003). */}
      {(punto.cliente || punto.direccion || punto.rangoHorario || punto.notasEntrega) && (
        <dl className="delivery-point-card__info">
          {punto.cliente && (
            <div className="delivery-point-card__info-fila">
              <dt>Cliente</dt>
              <dd>{punto.cliente}</dd>
            </div>
          )}
          {punto.direccion && (
            <div className="delivery-point-card__info-fila">
              <dt>Dirección</dt>
              <dd>{punto.direccion}</dd>
            </div>
          )}
          {punto.rangoHorario && (
            <div className="delivery-point-card__info-fila">
              <dt>Horario</dt>
              <dd>{punto.rangoHorario}</dd>
            </div>
          )}
          {punto.notasEntrega && (
            <div className="delivery-point-card__info-fila">
              <dt>Notas</dt>
              <dd>{punto.notasEntrega}</dd>
            </div>
          )}
        </dl>
      )}

      <div className="delivery-point-card__acciones">
        {punto.estado === "pendiente" && (
          <button type="button" disabled={procesando} onClick={() => onMarcarArribo(punto.id)}>
            Llegué
          </button>
        )}
        {punto.estado === "arribado" && (
          <button type="button" disabled={procesando} onClick={() => onMarcarDescarga(punto.id)}>
            Descarga completa
          </button>
        )}
        {punto.estado === "completado" && <span className="delivery-point-card__ok">Completado ✓</span>}
      </div>
    </li>
  );
}
