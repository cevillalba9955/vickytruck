import { createApp } from "../../src/server.js";

/**
 * Levanta la app Express en un puerto efímero para tests de contrato/
 * integración de `/api/central` (el único router HTTP restante desde
 * 004-chofer-cloud-broker; `GET /api/recorridos/:token` se retiró).
 * `recorridoRepository` y `emqxProvisioning` son opcionales: solo hacen
 * falta para ejercitar la construcción del `enlace` en las respuestas de
 * `/asignar`/`/reasignar` (ver tests/contract/post-asignar.test.js); el
 * resto de los tests de `/api/central` pasan `undefined` en esos dos
 * lugares. `emqxProvisioning` puede ser un fake (ver
 * tests/helpers/fakeEmqxProvisioning.js) para no llamar a la API real de
 * EMQX Cloud desde los tests (003-mqtt-broker-fletes).
 */
export async function iniciarServidorDePrueba(recorridoRepository, centralRepository, emqxProvisioning) {
  const app = createApp(recorridoRepository, centralRepository, emqxProvisioning);
  const server = app.listen(0);
  await new Promise((resolve) => server.once("listening", resolve));
  const { port } = server.address();
  return {
    centralBaseUrl: `http://127.0.0.1:${port}/api/central`,
    async cerrar() {
      await new Promise((resolve) => server.close(resolve));
    },
  };
}
