// Aviso visible de estado de conexión al bróker (004-chofer-cloud-broker,
// FR-008: sin internet/bróker no disponible; FR-005a: token de publicación
// expulsado por conectarse desde otro dispositivo).
export function ConnectionBanner({ estadoConexion }) {
  if (!estadoConexion || estadoConexion.estado === "conectado") return null;

  if (estadoConexion.estado === "desconectado" && estadoConexion.motivo === "expulsado") {
    return (
      <p role="alert" className="connection-banner connection-banner--expulsado">
        Este dispositivo ya no puede publicar en este recorrido. Pedí un enlace nuevo a Central.
      </p>
    );
  }

  return (
    <p role="status" className="connection-banner">
      Sin conexión al bróker, reintentando…
    </p>
  );
}
