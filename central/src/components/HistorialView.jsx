import { useEffect, useState } from "react";
import { listarHistorial } from "../services/api.js";
import { RecorridoDetalle } from "./RecorridoDetalle.jsx";

/** Historial de recorridos finalizados (Historia 5, FR-010). */
export function HistorialView() {
  const [historial, setHistorial] = useState([]);
  const [seleccionado, setSeleccionado] = useState(null);

  useEffect(() => {
    listarHistorial().then(setHistorial);
  }, []);

  if (seleccionado) {
    return (
      <div className="historial-view">
        <button type="button" onClick={() => setSeleccionado(null)}>
          ← Volver al historial
        </button>
        <RecorridoDetalle detalle={seleccionado} />
      </div>
    );
  }

  if (historial.length === 0) {
    return <p role="status">Todavía no hay recorridos finalizados.</p>;
  }

  return (
    <table className="historial-view">
      <thead>
        <tr>
          <th>Recorrido</th>
          <th>Flete</th>
          <th>Puntos</th>
          <th aria-hidden="true" />
        </tr>
      </thead>
      <tbody>
        {historial.map((h) => (
          <tr key={h.id}>
            <td>{h.id}</td>
            <td>{h.fleteId}</td>
            <td>{h.puntos.length}</td>
            <td>
              <button
                type="button"
                onClick={() =>
                  setSeleccionado({
                    recorrido: { id: h.id, estado: "finalizado", fleteId: h.fleteId },
                    puntos: h.puntos,
                  })
                }
              >
                Ver línea de tiempo
              </button>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
