// Smoke test STANDALONE contra la instancia Oracle real configurada en .env.
//
// Verifica conectividad básica (pool + SELECT 1 FROM DUAL) y, si las tablas de
// recorrido/punto ya existen (las precarga la futura feature de Central),
// reporta cuántas filas tiene cada una. No asume datos de prueba cargados.
//
// Uso: npm run smoke:oracle
// NO forma parte de `npm test`: vive en scripts/, que `node --test` no escanea.
// Nunca imprime user/password/connect string (solo nombres de tabla, que son
// configuración pública, no secretos).

import { pathToFileURL } from "node:url";
import { withConnection, closePool } from "../src/db/pool.js";

const IDENTIFIER_RE = /^[A-Za-z_][A-Za-z0-9_]*(\.[A-Za-z_][A-Za-z0-9_]*)?$/;

function tablaSegura(envVar, nombreDefault) {
  const nombre = process.env[envVar] || nombreDefault;
  return IDENTIFIER_RE.test(nombre) ? nombre : null;
}

export async function runSmoke({ print = console.log, error = console.error } = {}) {
  print("Smoke test conexión Oracle — vickytruck backend chofer");

  const faltantes = ["ORACLE_USER", "ORACLE_PASSWORD", "ORACLE_CONNECT_STRING"].filter(
    (k) => !process.env[k],
  );
  if (faltantes.length > 0) {
    error(`FALLO: faltan variables de entorno: ${faltantes.join(", ")} (ver backend/.env.example).`);
    return 4;
  }

  let ok = true;
  const t0 = Date.now();

  try {
    await withConnection(async (connection) => {
      const dual = await connection.execute("SELECT 1 AS OK FROM DUAL");
      if (dual.rows[0]?.OK !== 1) throw new Error("respuesta inesperada de DUAL");
    });
  } catch (err) {
    error(`FALLO: no se pudo conectar/consultar Oracle tras ${Date.now() - t0}ms: ${err.message}`);
    await closePool();
    return 1;
  }
  print(`  OK: conexión al pool y SELECT 1 FROM DUAL en ${Date.now() - t0}ms.`);

  const tablas = [
    ["ORACLE_TABLA_RECORRIDOS", "RECORRIDOS"],
    ["ORACLE_TABLA_PUNTOS", "PUNTOS_ENTREGA"],
  ];

  for (const [envVar, nombreDefault] of tablas) {
    const tabla = tablaSegura(envVar, nombreDefault);
    if (!tabla) {
      error(`  ${envVar}: valor inválido como identificador SQL (${process.env[envVar]}).`);
      ok = false;
      continue;
    }
    try {
      const resultado = await withConnection((connection) =>
        connection.execute(`SELECT COUNT(*) AS TOTAL FROM ${tabla}`),
      );
      print(`  ${tabla}: OK, ${resultado.rows[0].TOTAL} fila(s).`);
    } catch (err) {
      // Es normal que esto falle todavía: la feature de Central es la dueña
      // del esquema y puede no haberlo creado/precargado aún.
      print(`  ${tabla}: no disponible todavía (${err.message}).`);
    }
  }

  print(ok ? "Smoke test: ÉXITO." : "Smoke test: FALLÓ (ver detalles arriba).");
  await closePool();
  return ok ? 0 : 1;
}

const isMainModule = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMainModule) {
  runSmoke()
    .then((code) => {
      process.exitCode = code;
    })
    .catch((err) => {
      console.error(`Error fatal del smoke test: ${err.message}`);
      process.exitCode = 1;
    });
}
