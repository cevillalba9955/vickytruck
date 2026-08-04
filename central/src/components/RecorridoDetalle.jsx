import { useEffect, useState } from "react";
import { listarFletesDisponibles, reasignarRecorrido } from "../services/api.js";

const ETIQUETAS_ESTADO = {
  pendiente: "Pendiente",
  arribado: "Arribado",
  completado: "Completado",
};

/**
 * Detalle de un recorrido (Historia 3, FR-008): puntos en orden, estado y
 * eventos registrados. Si el recorrido sigue activo, permite reasignarlo a
 * otro flete disponible (Historia 4, FR-009).
 */
export function RecorridoDetalle({ detalle, onReasignado }) {
  const [fletes, setFletes] = useState([]);
  const [fleteId, setFleteId] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState(null);

  const puedeReasignar = detalle?.recorrido.estado === "activo";

  useEffect(() => {
    if (!puedeReasignar) return;
    listarFletesDisponibles().then(setFletes);
  }, [puedeReasignar, detalle?.recorrido.id]);

  if (!detalle) return null;
  const { recorrido, puntos } = detalle;

  const handleReasignar = async (evt) => {
    evt.preventDefault();
    if (!fleteId) return;
    setEnviando(true);
    setError(null);
    try {
      const data = await reasignarRecorrido(recorrido.id, fleteId);
      setFleteId("");
      onReasignado?.(data);
    } catch (err) {
      setError(err.codigo === "flete_ocupado" ? "flete_ocupado" : "error_desconocido");
    } finally {
      setEnviando(false);
    }
  };

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

      {puedeReasignar && (
        <form onSubmit={handleReasignar}>
          <h3>Reasignar a otro flete</h3>
          <label className="asignacion-form__campo">
            Flete disponible
            <select value={fleteId} onChange={(e) => setFleteId(e.target.value)}>
              <option value="">Elegir…</option>
              {fletes.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.nombre}
                </option>
              ))}
            </select>
          </label>
          <button type="submit" disabled={enviando || !fleteId}>
            Reasignar
          </button>
          {error === "flete_ocupado" && <p role="alert">Ese flete ya tiene otro recorrido activo.</p>}
          {error === "error_desconocido" && <p role="alert">No se pudo reasignar el recorrido.</p>}
        </form>
      )}
    </section>
  );
}
