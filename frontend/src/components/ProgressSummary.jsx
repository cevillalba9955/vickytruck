/** Resumen de progreso del recorrido (US4, FR-008). */
export function ProgressSummary({ progreso }) {
  if (!progreso) return null;
  const { pendientes, arribados, completados } = progreso;
  const total = pendientes + arribados + completados;

  return (
    <div className="progress-summary" role="group" aria-label="Progreso del recorrido">
      <span className="progress-summary__item">
        {completados} de {total} completados
      </span>
      <span className="progress-summary__item">{arribados} en curso</span>
      <span className="progress-summary__item">{pendientes} pendientes</span>
    </div>
  );
}
