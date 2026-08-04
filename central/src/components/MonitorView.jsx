function formatearUbicacion(ultimaUbicacion) {
  if (!ultimaUbicacion || ultimaUbicacion.en == null) return "Sin ubicación reportada";
  return ultimaUbicacion.reciente ? "Ubicación reciente" : "Ubicación no reciente";
}

/**
 * Vista de monitoreo en vivo (Historia 1, FR-001, FR-002): un renglón por
 * recorrido activo, con su flete, progreso y última ubicación conocida.
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
          <th>Última ubicación</th>
          <th aria-hidden="true" />
        </tr>
      </thead>
      <tbody>
        {recorridos.map((r) => (
          <tr key={r.id} data-ubicacion-reciente={r.ultimaUbicacion?.reciente ?? false}>
            <td>{r.id}</td>
            <td>{r.flete?.nombre ?? "—"}</td>
            <td>
              {r.progreso.completados} completados / {r.progreso.arribados} en curso / {r.progreso.pendientes}{" "}
              pendientes
            </td>
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
