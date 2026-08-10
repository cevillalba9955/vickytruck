function formatearUbicacion(ultimaUbicacion) {
  if (!ultimaUbicacion || ultimaUbicacion.en == null) return "Sin ubicación reportada";
  return ultimaUbicacion.reciente ? "Ubicación reciente" : "Ubicación no reciente";
}

const ETIQUETAS_VIAJE_ESTADO = {
  detenido: "Detenido",
  manejando: "Manejando",
  descargando: "Descargando",
};

// Estado de viaje del chofer (005-chofer-estados-viaje, FR-021), visible en
// (casi) tiempo real vía el mismo polling que ya trae `progreso`/`ultimaUbicacion`.
function formatearViajeEstado(r) {
  const etiqueta = ETIQUETAS_VIAJE_ESTADO[r.viajeEstado] ?? "—";
  if (r.puntoActivoId == null) return etiqueta;
  return `${etiqueta} (punto ${r.puntoActivoId})`;
}

/**
 * Vista de monitoreo en vivo (Historia 1, FR-001, FR-002): un renglón por
 * recorrido activo, con su flete, progreso, estado de viaje y última
 * ubicación conocida.
 */
export function MonitorView({ recorridos, onSeleccionar }) {
  if (!recorridos || recorridos.length === 0) {
    return <p role="status">No hay recorridos activos en este momento.</p>;
  }

  return (
    <table className="monitor-view">
      <thead>
        <tr>
          <th>Recorrido</th>
          <th>Flete</th>
          <th>Progreso</th>
          <th>Estado de viaje</th>
          <th>Última ubicación</th>
          <th aria-hidden="true" />
        </tr>
      </thead>
      <tbody>
        {recorridos.map((r) => (
          <tr key={r.id} data-ubicacion-reciente={r.ultimaUbicacion?.reciente ?? false} data-viaje-estado={r.viajeEstado ?? "detenido"}>
            <td>{r.id}</td>
            <td>{r.flete?.nombre ?? "—"}</td>
            <td>
              {r.progreso.completados} completados / {r.progreso.arribados} en curso / {r.progreso.pendientes}{" "}
              pendientes
            </td>
            <td>{formatearViajeEstado(r)}</td>
            <td>{formatearUbicacion(r.ultimaUbicacion)}</td>
            <td>
              {onSeleccionar && (
                <button type="button" onClick={() => onSeleccionar(r.id)}>
                  Ver detalle
                </button>
              )}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
