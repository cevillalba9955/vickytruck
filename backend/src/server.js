import express from "express";
import { createRecorridoRouter } from "./routes/recorrido.js";
import { createOracleRecorridoRepository } from "./db/recorridoRepository.js";

export function createApp(repository) {
  const app = express();
  app.use(express.json());

  app.use("/api/recorridos", createRecorridoRouter(repository));

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
if (import.meta.url === `file://${process.argv[1]}`) {
  const repository = createOracleRecorridoRepository();
  const app = createApp(repository);
  const port = Number(process.env.PORT || 3001);
  app.listen(port, () => {
    console.log(`[vickytruck-chofer] API escuchando en http://localhost:${port}`);
  });
}
