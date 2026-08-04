// Vínculo de un token de publicación al primer dispositivo que lo usa
// (004-chofer-cloud-broker, FR-005a): estado efímero en memoria, mismo
// patrón que ubicacionEnMemoria.js — no persiste en Oracle, se pierde sin
// problema ante un reinicio del proceso (Principio VII; ver
// specs/004-chofer-cloud-broker/data-model.md).
//
// `conexionWatcher.js` llama `registrarConexion(token, clientId)` por cada
// evento de conexión observado en el bróker; según el resultado decide si
// debe expulsar la sesión entrante. Se exporta como factory (para tests
// aislados) más un singleton compartido en producción, igual que
// ubicacionEnMemoria.js.
export function createVinculoDispositivo() {
  const vinculos = new Map(); // token -> clientId del primer dispositivo

  return {
    /**
     * Devuelve `{ accion: "vinculado" }` la primera vez que se ve ese token;
     * `{ accion: "reconexion" }` si el `clientId` coincide con el ya
     * vinculado; `{ accion: "expulsar", clientId }` si es un `clientId`
     * distinto (el vínculo original NO se reemplaza).
     */
    registrarConexion(token, clientId) {
      const vinculado = vinculos.get(token);
      if (!vinculado) {
        vinculos.set(token, clientId);
        return { accion: "vinculado" };
      }
      if (vinculado === clientId) {
        return { accion: "reconexion" };
      }
      return { accion: "expulsar", clientId };
    },

    /** Limpia el vínculo de un token (recorrido finalizado/reasignado). No-op si no había vínculo. */
    liberar(token) {
      vinculos.delete(token);
    },
  };
}

export const vinculoDispositivoCompartido = createVinculoDispositivo();
