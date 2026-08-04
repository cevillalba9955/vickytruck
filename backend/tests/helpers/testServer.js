import { createApp } from "../../src/server.js";

/**
 * Levanta la app Express en un puerto efímero para tests de
 * contrato/integración. `centralRepository` es opcional (los tests de
 * 001-chofer-recorrido solo pasan `recorridoRepository` y nunca ejercitan
 * `/api/central`); `centralBaseUrl` queda disponible para los tests de
 * 002-panel-control-central.
 */
export async function iniciarServidorDePrueba(recorridoRepository, centralRepository) {
  const app = createApp(recorridoRepository, centralRepository);
  const server = app.listen(0);
  await new Promise((resolve) => server.once("listening", resolve));
  const { port } = server.address();
  return {
    baseUrl: `http://127.0.0.1:${port}/api/recorridos`,
    centralBaseUrl: `http://127.0.0.1:${port}/api/central`,
    async cerrar() {
      await new Promise((resolve) => server.close(resolve));
    },
  };
}
