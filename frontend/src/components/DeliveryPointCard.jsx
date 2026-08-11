import { formatearHoraLocal } from "../services/tiempo.js";

const ETIQUETAS_ESTADO = {
  pendiente: "Pendiente",
  arribado: "Arribado",
  completado: "Completado",
};

function enlaceMapa(latitud, longitud) {
  return `https://www.google.com/maps?q=${latitud},${longitud}`;
}

function IconoMapa() {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polygon points="1 6 1 22 8 18 16 22 23 18 23 2 16 6 8 2 1 6" />
      <line x1="8" y1="2" x2="8" y2="18" />
      <line x1="16" y1="6" x2="16" y2="22" />
    </svg>
  );
}

/**
 * Tarjeta de un punto de entrega. Los botones disponibles dependen del
 * estado de viaje guiado (005-chofer-estados-viaje, US2) y del rol del
 * punto dentro de ese estado — reemplaza el modelo de "marcado libre" de
 * 001-chofer-recorrido (cualquier punto pendiente/arribado en cualquier
 * momento):
 *  - Detenido: el primer punto pendiente (`esPrimeroPendiente`) muestra
 *    INICIAR; el resto muestra IR PRIMERO (FR-006, FR-014).
 *  - Manejando/Descargando: solo el punto activo (`esActivo`) muestra
 *    LLEGUE/DESCARGA COMPLETA; los demás pendientes se renderizan
 *    `reducido` (desactivados y en tamaño menor, FR-008).
 */
export function DeliveryPointCard({
  punto,
  viajeEstado,
  esPrimeroPendiente = false,
  esActivo = false,
  reducido = false,
  onIniciar = () => {},
  onIrPrimero = () => {},
  onLlegue = () => {},
  onDescargaCompleta = () => {},
  procesando,
}) {
  const clases = ["delivery-point-card"];
  if (reducido) clases.push("delivery-point-card--reducido");

  return (
    <li className={clases.join(" ")} data-estado={punto.estado} aria-busy={procesando || undefined}>
      <div className="delivery-point-card__header">
        <span className="delivery-point-card__orden">
          {punto.orden}
          {punto.cliente ? ` - ${punto.cliente}` : ""}
        </span>
        <span className="delivery-point-card__estado">{ETIQUETAS_ESTADO[punto.estado] ?? punto.estado}</span>
      </div>

      {/* Info provista por Central vía sincronizar_recorrido (005-chofer-estados-viaje,
          FR-002); el nombre del cliente ya se muestra arriba, en el encabezado. Cada
          campo se omite con normalidad si no vino (FR-004); remitoIds NUNCA llega
          hasta acá — ver serializePunto en recorrido.js (FR-003). */}
      {!reducido && (punto.direccion || punto.rangoHorario || punto.notasEntrega) && (
        <dl className="delivery-point-card__info">
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

      {/* 006-normalizar-formato-horario, US1: hora de arribo/descarga en
          HH24:MM:SS local — funciona igual para timestamps nuevos (-03:00)
          e históricos (Z, sin migrar, FR-006). rangoHorario (arriba) no se
          toca: es texto libre fuera de este alcance. */}
      {!reducido && (punto.arriboEn || punto.descargaEn) && (
        <dl className="delivery-point-card__horarios">
          {punto.arriboEn && (
            <div className="delivery-point-card__info-fila">
              <dt>Arribo</dt>
              <dd>{formatearHoraLocal(punto.arriboEn)}</dd>
            </div>
          )}
          {punto.descargaEn && (
            <div className="delivery-point-card__info-fila">
              <dt>Descarga</dt>
              <dd>{formatearHoraLocal(punto.descargaEn)}</dd>
            </div>
          )}
        </dl>
      )}

      {!reducido && (
        <div className="delivery-point-card__fila-acciones">
          <div className="delivery-point-card__acciones">
            {viajeEstado === "detenido" && esPrimeroPendiente && (
              <button type="button" disabled={procesando} onClick={onIniciar}>
                INICIAR
              </button>
            )}
            {viajeEstado === "detenido" && !esPrimeroPendiente && (
              <button type="button" disabled={procesando} onClick={() => onIrPrimero(punto.id)}>
                IR PRIMERO
              </button>
            )}
            {viajeEstado === "manejando" && esActivo && (
              <button type="button" disabled={procesando} onClick={onLlegue}>
                LLEGUE
              </button>
            )}
            {viajeEstado === "descargando" && esActivo && (
              <button type="button" disabled={procesando} onClick={onDescargaCompleta}>
                DESCARGA COMPLETA
              </button>
            )}
            {punto.estado === "completado" && <span className="delivery-point-card__ok">Completado ✓</span>}
          </div>
          <a
            className="delivery-point-card__boton-mapa"
            href={enlaceMapa(punto.latitud, punto.longitud)}
            target="_blank"
            rel="noreferrer"
            aria-label="Ver ubicación en el mapa"
          >
            <IconoMapa />
          </a>
        </div>
      )}
    </li>
  );
}
