const ETIQUETAS_ESTADO = {
  pendiente: "Pendiente",
  arribado: "Arribado",
  completado: "Completado",
};

/**
 * Detalle de un recorrido (Historia 3, FR-008): puntos en orden, estado y
 * eventos registrados. Solo lectura — la asignación/reasignación de flete
 * ocurre en Oracle/APEX antes del push a cloud (ver
 * specs/003-arquitectura-cloud-mqtt/contracts/integracion-api.md).
 */
export function RecorridoDetalle({ detalle }) {
  if (!detalle) return null;
  const { recorrido, puntos } = detalle;

  return (
    <section className="detalle-view" aria-label={`Detalle del recorrido ${recorrido.id}`}>
      <h2>Recorrido {recorrido.id}</h2>
      <p>
        Estado: <strong>{recorrido.estado}</strong>
        {recorrido.fleteId && <> — Flete asignado: {recorrido.fleteId}</>}
      </p>

      <ol className="detalle-view__lista">
        {puntos.map((p) => (
          <li key={p.id}>
            <strong>
              {p.orden} de {puntos.length}
            </strong>{" "}
            — {ETIQUETAS_ESTADO[p.estado] ?? p.estado}
            {p.arriboEn && <div>Arribo: {p.arriboEn}</div>}
            {p.descargaEn && <div>Descarga: {p.descargaEn}</div>}
          </li>
        ))}
      </ol>
    </section>
  );
}
