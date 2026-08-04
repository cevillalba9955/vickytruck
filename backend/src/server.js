import { pathToFileURL } from "node:url";
import express from "express";
import { createRecorridoRouter } from "./routes/recorrido.js";
import { createCentralRouter } from "./routes/central.js";
import { createOracleRecorridoRepository } from "./db/recorridoRepository.js";
import { createOracleCentralRepository } from "./db/centralRepository.js";
import { getBackendMqttClient, closeBackendMqttClient } from "./mqtt/client.js";
import { createSubscriber } from "./mqtt/subscriber.js";
import { ubicacionEnMemoriaCompartida } from "./state/ubicacionEnMemoria.js";
import { createEmqxProvisioning } from "./mqtt/emqxProvisioning.js";

// `centralRepository` y `emqxProvisioning` son opcionales para no romper los
// tests existentes de 001-chofer-recorrido que llaman a createApp(repository)
// con un solo argumento (nunca ejercitan las rutas /api/central ni necesitan
// una instancia fake de aprovisionamiento MQTT).
export function createApp(repository, centralRepository, emqxProvisioning) {
  const app = express();
  app.use(express.json());

  app.use("/api/recorridos", createRecorridoRouter(repository, emqxProvisioning));
  app.use("/api/central", createCentralRouter(centralRepository));

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

// Solo arranca el servidor real (con Oracle) cuando este módulo se ejecuta
// directamente — permite importar createApp() en tests sin abrir el pool.
// Comparación vía pathToFileURL (no `file://${process.argv[1]}`): en Windows
// process.argv[1] usa backslashes y el drive letter, que no matchean con
// import.meta.url por simple concatenación de string.
const esModuloPrincipal = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (esModuloPrincipal) {
  // Instancia única de aprovisionamiento MQTT (003-mqtt-broker-fletes),
  // compartida entre GET /:token (provisiona), centralRepository.reasignar
  // (revoca el token anterior) y mqtt/subscriber.js (revoca al completar).
  const emqxProvisioning = createEmqxProvisioning();
  const repository = createOracleRecorridoRepository();
  const centralRepository = createOracleCentralRepository(ubicacionEnMemoriaCompartida, emqxProvisioning);
  const app = createApp(repository, centralRepository, emqxProvisioning);
  const port = Number(process.env.PORT || 3001);
  const server = app.listen(port, () => {
    console.log(`[vickytruck-chofer] API escuchando en http://localhost:${port}`);
  });

  // Conexión saliente al bróker MQTT — el arranque del cliente es
  // independiente de Express. `ubicacionStore` es el mismo singleton que ya
  // usa `centralRepository` para "última ubicación conocida".
  const mqttClient = getBackendMqttClient();
  mqttClient.on("connect", () => console.log("[mqtt] conectado al bróker"));
  createSubscriber({
    client: mqttClient,
    repository,
    ubicacionStore: ubicacionEnMemoriaCompartida,
    emqxProvisioning,
  }).iniciar();

  async function cerrarOrdenadamente() {
    await closeBackendMqttClient();
    server.close(() => process.exit(0));
  }
  process.on("SIGTERM", cerrarOrdenadamente);
  process.on("SIGINT", cerrarOrdenadamente);
}
