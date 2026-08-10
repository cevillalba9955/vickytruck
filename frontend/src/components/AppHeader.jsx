/**
 * Encabezado fijo de la app: título a la izquierda, botón CANCELAR (rojo,
 * chico) a la derecha. El botón permanece en el DOM incluso cuando no
 * corresponde mostrarlo (`visibility: hidden`, no `display: none`) para que
 * aparecer/desaparecer nunca desplace el título ni el contenido de abajo.
 */
export function AppHeader({ puedeCancelar, onCancelar, procesando }) {
  return (
    <header className="app__header">
      <h1 className="app__titulo">VICKYTRUCK</h1>
      <button
        type="button"
        className="app__cancelar"
        style={{ visibility: puedeCancelar ? "visible" : "hidden" }}
        disabled={procesando}
        onClick={onCancelar}
      >
        CANCELAR
      </button>
    </header>
  );
}
