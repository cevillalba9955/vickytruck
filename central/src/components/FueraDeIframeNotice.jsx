/**
 * FR-011/FR-012: mensaje mostrado cuando Central se abre fuera del iframe
 * de Oracle APEX, en vez de operar como si fuera la ventana de nivel
 * superior o exponer datos sin ese contexto.
 */
export function FueraDeIframeNotice() {
  return (
    <main className="app fuera-de-iframe">
      <p role="alert">
        Este panel debe abrirse embebido dentro de Oracle APEX. Accedé desde la página
        de Central correspondiente en vez de esta URL directa.
      </p>
    </main>
  );
}
