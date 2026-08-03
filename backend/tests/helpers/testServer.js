import { createApp } from "../../src/server.js";

/** Levanta la app Express en un puerto efímero para tests de contrato/integración. */
export async function iniciarServidorDePrueba(repository) {
  const app = createApp(repository);
  const server = app.listen(0);
  await new Promise((resolve) => server.once("listening", resolve));
  const { port } = server.address();
  return {
    baseUrl: `http://127.0.0.1:${port}/api/recorridos`,
    async cerrar() {
      await new Promise((resolve) => server.close(resolve));
    },
  };
}
