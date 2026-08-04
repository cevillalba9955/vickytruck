import { useEffect, useState } from "react";
import { listarDisponibles, listarFletesDisponibles, asignarRecorrido } from "../services/api.js";

/**
 * Formulario de asignación (Historia 2, FR-005, FR-006): elegir un recorrido
 * precargado disponible y un flete disponible, y confirmar la asignación.
 */
export function AsignacionForm({ onAsignado }) {
  const [disponibles, setDisponibles] = useState([]);
  const [fletes, setFletes] = useState([]);
  const [recorridoId, setRecorridoId] = useState("");
  const [fleteId, setFleteId] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [resultado, setResultado] = useState(null);
  const [error, setError] = useState(null);
  const [copiado, setCopiado] = useState(false);

  const cargarOpciones = async () => {
    const [recorridos, fletesDisponibles] = await Promise.all([listarDisponibles(), listarFletesDisponibles()]);
    setDisponibles(recorridos);
    setFletes(fletesDisponibles);
  };

  useEffect(() => {
    cargarOpciones();
  }, []);

  const handleSubmit = async (evt) => {
    evt.preventDefault();
    if (!recorridoId || !fleteId) return;
    setEnviando(true);
    setError(null);
    setResultado(null);
    setCopiado(false);
    try {
      const data = await asignarRecorrido(recorridoId, fleteId);
      setResultado(data);
      setRecorridoId("");
      setFleteId("");
      await cargarOpciones();
      onAsignado?.(data);
    } catch (err) {
      setError(err.codigo || "error_desconocido");
    } finally {
      setEnviando(false);
    }
  };

  // 004-chofer-cloud-broker (FR-006): copiar el enlace completo (con el
  // payload y el token de publicación ya embebidos) para pegarlo en el
  // canal externo elegido (ej. WhatsApp).
  const handleCopiarEnlace = async () => {
    try {
      await navigator.clipboard.writeText(resultado.enlace);
      setCopiado(true);
    } catch {
      setCopiado(false);
    }
  };

  return (
    <form className="asignacion-form" onSubmit={handleSubmit}>
      <h2>Asignar recorrido a un flete</h2>

      <label className="asignacion-form__campo">
        Recorrido disponible
        <select value={recorridoId} onChange={(e) => setRecorridoId(e.target.value)}>
          <option value="">Elegir…</option>
          {disponibles.map((r) => (
            <option key={r.id} value={r.id}>
              Recorrido {r.id} ({r.totalPuntos} puntos)
            </option>
          ))}
        </select>
      </label>

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

      <button type="submit" disabled={enviando || !recorridoId || !fleteId}>
        Asignar
      </button>

      {error === "ya_asignado" && <p role="alert">Ese recorrido ya tiene un flete asignado.</p>}
      {error === "flete_ocupado" && <p role="alert">Ese flete ya tiene otro recorrido activo.</p>}
      {error && error !== "ya_asignado" && error !== "flete_ocupado" && (
        <p role="alert">No se pudo asignar el recorrido.</p>
      )}
      {resultado && (
        <div className="asignacion-form__resultado" role="status">
          <p>Asignación confirmada. Enlace único para el flete:</p>
          <p>
            <code>{resultado.enlace ?? resultado.token}</code>
          </p>
          {resultado.enlace && (
            <button type="button" onClick={handleCopiarEnlace}>
              {copiado ? "¡Copiado!" : "Copiar enlace"}
            </button>
          )}
        </div>
      )}
    </form>
  );
}
