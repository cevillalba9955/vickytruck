import oracledb from "oracledb";
import { withConnection } from "./pool.js";

// Los nombres de tabla/vista/package vienen de configuración (operador del
// servidor), no de input de usuario, pero igual se validan como identificador
// SQL simple (con soporte a `esquema.objeto`) antes de interpolarlos en las
// queries/bloques PL/SQL.
const IDENTIFIER_RE = /^[A-Za-z_][A-Za-z0-9_]*(\.[A-Za-z_][A-Za-z0-9_]*)?$/;

function tablaRecorridos() {
  const nombre = process.env.ORACLE_TABLA_RECORRIDOS || "RECORRIDOS";
  if (!IDENTIFIER_RE.test(nombre)) {
    throw new Error(`ORACLE_TABLA_RECORRIDOS inválido: ${nombre}`);
  }
  return nombre;
}

function tablaPuntos() {
  const nombre = process.env.ORACLE_TABLA_PUNTOS || "PUNTOS_ENTREGA";
  if (!IDENTIFIER_RE.test(nombre)) {
    throw new Error(`ORACLE_TABLA_PUNTOS inválido: ${nombre}`);
  }
  return nombre;
}

// Package PL/SQL que hace de única vía de escritura sobre los puntos de
// entrega (las vistas V_RECORRIDOS/V_PUNTOS_ENTREGA son de solo lectura,
// generadas — ver backend/sql/recorrido_api.pks.sql para el contrato acordado
// el 2026-08-03).
function paqueteRecorridoApi() {
  const nombre = process.env.ORACLE_PACKAGE_RECORRIDO_API || "RECORRIDO_API";
  if (!IDENTIFIER_RE.test(nombre)) {
    throw new Error(`ORACLE_PACKAGE_RECORRIDO_API inválido: ${nombre}`);
  }
  return nombre;
}

function mapPuntoRow(row) {
  return {
    id: String(row.ID),
    orden: row.ORDEN,
    latitud: row.LATITUD,
    longitud: row.LONGITUD,
    estado: row.ESTADO,
    arriboEn: row.ARRIBO_EN ? new Date(row.ARRIBO_EN).toISOString() : null,
    descargaEn: row.DESCARGA_EN ? new Date(row.DESCARGA_EN).toISOString() : null,
  };
}

function calcularProgreso(puntos) {
  const progreso = { pendientes: 0, arribados: 0, completados: 0 };
  for (const p of puntos) {
    if (p.estado === "pendiente") progreso.pendientes += 1;
    else if (p.estado === "arribado") progreso.arribados += 1;
    else if (p.estado === "completado") progreso.completados += 1;
  }
  return progreso;
}

/**
 * Repositorio de recorridos respaldado por Oracle (Principio IV: única fuente
 * de verdad). Lecturas: vistas V_RECORRIDOS/V_PUNTOS_ENTREGA (solo lectura).
 * Escrituras: package PL/SQL RECORRIDO_API (las vistas no son actualizables).
 * Ver research.md §6 para la semántica de idempotencia de las transiciones.
 */
export function createOracleRecorridoRepository() {
  return {
    async obtenerPorToken(token) {
      return withConnection(async (connection) => {
        const recorridoResult = await connection.execute(
          `SELECT id, estado FROM ${tablaRecorridos()} WHERE token = :token`,
          { token },
        );
        const recorridoRow = recorridoResult.rows[0];
        if (!recorridoRow) return null;

        const puntosResult = await connection.execute(
          `SELECT id, orden, latitud, longitud, estado, arribo_en, descarga_en
           FROM ${tablaPuntos()}
           WHERE recorrido_id = :recorridoId
           ORDER BY orden`,
          { recorridoId: recorridoRow.ID },
        );
        const puntos = puntosResult.rows.map(mapPuntoRow);
        return {
          id: String(recorridoRow.ID),
          estado: recorridoRow.ESTADO,
          puntos,
          progreso: calcularProgreso(puntos),
        };
      });
    },

    async marcarArribo(token, puntoId, ubicacion = {}) {
      return invocarProcedimiento("marcar_arribo", token, puntoId, ubicacion);
    },

    async marcarDescarga(token, puntoId, ubicacion = {}) {
      return invocarProcedimiento("marcar_descarga", token, puntoId, ubicacion);
    },
  };
}

const RESULTADOS = {
  OK: "ok",
  INVALID_TOKEN: "invalid_token",
  NOT_FOUND: "not_found",
  CONFLICT: "conflict",
};

// Invoca RECORRIDO_API.marcar_arribo / marcar_descarga (backend/sql/recorrido_api.pks.sql).
// El package valida token + pertenencia del punto y aplica la transición de
// forma atómica; acá solo interpretamos el resultado y, si corresponde,
// releemos el punto completo desde la vista para la respuesta HTTP.
async function invocarProcedimiento(procedimiento, token, puntoId, ubicacion) {
  return withConnection(async (connection) => {
    const result = await connection.execute(
      `BEGIN ${paqueteRecorridoApi()}.${procedimiento}(
         :token, :puntoId, :lat, :lon, :resultado, :estado, :eventoEn
       ); END;`,
      {
        token,
        puntoId: Number(puntoId),
        lat: ubicacion.lat ?? null,
        lon: ubicacion.lon ?? null,
        resultado: { dir: oracledb.BIND_OUT, type: oracledb.STRING, maxSize: 40 },
        estado: { dir: oracledb.BIND_OUT, type: oracledb.STRING, maxSize: 40 },
        eventoEn: { dir: oracledb.BIND_OUT, type: oracledb.DATE },
      },
    );
    await connection.commit();

    const crudo = (result.outBinds.resultado || "").trim().toUpperCase();
    const outcome = RESULTADOS[crudo] ?? "not_found";

    if (outcome === "invalid_token" || outcome === "not_found") {
      return { outcome };
    }

    // 'ok' o 'conflict': releer el punto completo (arriboEn Y descargaEn)
    // desde la vista, ya que el package solo informa el timestamp del evento
    // que él mismo procesó.
    const punto = await leerPuntoDesdeVista(connection, puntoId);
    if (!punto) return { outcome: "not_found" };
    return { outcome, punto };
  });
}

async function leerPuntoDesdeVista(connection, puntoId) {
  const result = await connection.execute(
    `SELECT id, orden, latitud, longitud, estado, arribo_en, descarga_en
     FROM ${tablaPuntos()}
     WHERE id = :puntoId`,
    { puntoId: Number(puntoId) },
  );
  const row = result.rows[0];
  return row ? mapPuntoRow(row) : null;
}
