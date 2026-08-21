import { createApp } from "../../src/server.js";

/**
 * Levanta la app Express en un puerto efímero para tests de
 * contrato/integración. `centralRepository` es opcional (los tests de
 * 001-chofer-recorrido solo pasan `recorridoRepository` y nunca ejercitan
 * `/api/central`); `centralBaseUrl` queda disponible para los tests de
 * 002-panel-control-central. `ubicacionStore` es opcional: permite pasar una
 * instancia aislada (`createUbicacionEnMemoria()`) para no compartir estado
 * con otros tests vía el singleton compartido.
 */
export async function iniciarServidorDePrueba(recorridoRepository, centralRepository, ubicacionStore, integracionStore, emqxProvisioning, mqttBridge) {
  const app = createApp(recorridoRepository, centralRepository, ubicacionStore, integracionStore, emqxProvisioning, mqttBridge);
  const server = app.listen(0);
  await new Promise((resolve) => server.once("listening", resolve));
  const { port } = server.address();
  return {
    baseUrl: `http://127.0.0.1:${port}/api/recorridos`,
    centralBaseUrl: `http://127.0.0.1:${port}/api/central`,
    integracionBaseUrl: `http://127.0.0.1:${port}/api/integracion`,
    async cerrar() {
      await new Promise((resolve) => server.close(resolve));
    },
  };
}
