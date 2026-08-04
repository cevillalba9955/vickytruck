import { pathToFileURL } from "node:url";
import express from "express";
import { createRecorridoRouter } from "./routes/recorrido.js";
import { createCentralRouter } from "./routes/central.js";
import { createOracleRecorridoRepository } from "./db/recorridoRepository.js";
import { createOracleCentralRepository } from "./db/centralRepository.js";

// `centralRepository` es opcional para no romper los tests existentes de
// 001-chofer-recorrido que llaman a createApp(repository) con un solo
// argumento (nunca ejercitan las rutas /api/central).
export function createApp(repository, centralRepository) {
  const app = express();
  app.use(express.json());

  app.use("/api/recorridos", createRecorridoRouter(repository));
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
  const repository = createOracleRecorridoRepository();
  const centralRepository = createOracleCentralRepository();
  const app = createApp(repository, centralRepository);
  const port = Number(process.env.PORT || 3001);
  app.listen(port, () => {
    console.log(`[vickytruck-chofer] API escuchando en http://localhost:${port}`);
  });
}
