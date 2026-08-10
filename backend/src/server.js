import { pathToFileURL } from "node:url";
import express from "express";
import { createRecorridoRouter } from "./routes/recorrido.js";
import { createViajeRouter } from "./routes/viaje.js";
import { createCentralRouter } from "./routes/central.js";
import { createIntegracionRouter } from "./routes/integracion.js";
import { integracionStoreCompartido } from "./state/integracionStore.js";
import { startMqttBridge } from "./services/mqttBridge.js";
import { cors } from "./middleware/cors.js";
import { emqxProvisioningCompartido } from "./mqtt/emqxProvisioning.js";

// `centralRepository` y `ubicacionStore` son opcionales para no romper los
// tests existentes de 001-chofer-recorrido que llaman a createApp(repository)
// con un solo argumento (nunca ejercitan las rutas /api/central ni necesitan
// una instancia aislada de la posición en memoria). `emqxProvisioning` es
// inyectable para poder testear el disparo del aprovisionamiento MQTT sin
// llamar a la API real de EMQX Cloud (ver tests/helpers/fakeEmqxProvisioning.js).
export function createApp(
  repository,
  centralRepository,
  ubicacionStore,
  integracionStore = integracionStoreCompartido,
  emqxProvisioning = emqxProvisioningCompartido,
) {
  const app = express();
  app.use(cors);
  app.use(express.json());

  app.use("/api/recorridos", createRecorridoRouter(repository, ubicacionStore));
  app.use("/api/recorridos", createViajeRouter(repository));
  app.use("/api/central", createCentralRouter(centralRepository));
  app.use("/api/integracion", createIntegracionRouter(integracionStore, emqxProvisioning));

  app.use((req, res) => {
    res.status(404).json({ error: "ruta_no_encontrada" });
  });

  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    console.error(err);
    res.status(500).json({ error: "error_interno" });
  });

  return app;
}

// Solo arranca el servidor real cuando este módulo se ejecuta directamente —
// permite importar createApp() en tests.
// Comparación vía pathToFileURL (no `file://${process.argv[1]}`): en Windows
// process.argv[1] usa backslashes y el drive letter, que no matchean con
// import.meta.url por simple concatenación de string.
const esModuloPrincipal = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (esModuloPrincipal) {
  // Sin acceso a Oracle (spec 003, FR-001): backend cloud solo expone
  // endpoints. Chofer, Central e integración leen/escriben todos contra la
  // misma instancia de `integracionStore`, poblada por los push de
  // Oracle/APEX vía /api/integracion y consultada después por polling (ver
  // specs/003-arquitectura-cloud-mqtt/contracts/integracion-api.md).
  const integracionStore = integracionStoreCompartido;
  startMqttBridge(integracionStore);
  const app = createApp(integracionStore, integracionStore, undefined, integracionStore);
  const port = Number(process.env.PORT || 3001);
  // Bind explícito a 0.0.0.0: en contenedores (Fly.io) el default de Node
  // puede quedar solo en IPv6, y el proxy externo espera IPv4.
  app.listen(port, "0.0.0.0", () => {
    console.log(`[vickytruck-chofer] API escuchando en http://localhost:${port}`);
  });
}
