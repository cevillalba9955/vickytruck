import { withConnection } from "./pool.js";

// Los nombres de tabla vienen de configuración (operador del servidor), no de
// input de usuario, pero igual se validan como identificador SQL simple
// (con soporte a `esquema.tabla`) antes de interpolarlos en las queries.
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
 * de verdad). Ver research.md §6 para la semántica de idempotencia de las
 * transiciones de estado.
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
      return transicionarPunto({
        token,
        puntoId,
        ubicacion,
        estadoOrigen: "pendiente",
        estadoDestino: "arribado",
        estadoIdempotente: "arribado",
        columnaTimestamp: "arribo_en",
        columnaLat: "arribo_lat",
        columnaLon: "arribo_lon",
      });
    },

    async marcarDescarga(token, puntoId, ubicacion = {}) {
      return transicionarPunto({
        token,
        puntoId,
        ubicacion,
        estadoOrigen: "arribado",
        estadoDestino: "completado",
        estadoIdempotente: "completado",
        columnaTimestamp: "descarga_en",
        columnaLat: "descarga_lat",
        columnaLon: "descarga_lon",
      });
    },
  };
}

// Aplica una transición de estado sobre un punto, con la semántica idempotente
// de research.md §6: repetir la misma transición ya aplicada es "ok", no error.
async function transicionarPunto({
  token,
  puntoId,
  ubicacion,
  estadoOrigen,
  estadoDestino,
  estadoIdempotente,
  columnaTimestamp,
  columnaLat,
  columnaLon,
}) {
  return withConnection(async (connection) => {
    const recorridoResult = await connection.execute(
      `SELECT id FROM ${tablaRecorridos()} WHERE token = :token`,
      { token },
    );
    const recorridoRow = recorridoResult.rows[0];
    if (!recorridoRow) return { outcome: "invalid_token" };

    const updateResult = await connection.execute(
      `UPDATE ${tablaPuntos()}
       SET estado = :estadoDestino, ${columnaTimestamp} = SYSTIMESTAMP,
           ${columnaLat} = :lat, ${columnaLon} = :lon
       WHERE id = :puntoId AND recorrido_id = :recorridoId AND estado = :estadoOrigen`,
      {
        estadoDestino,
        lat: ubicacion.lat ?? null,
        lon: ubicacion.lon ?? null,
        puntoId,
        recorridoId: recorridoRow.ID,
        estadoOrigen,
      },
    );

    if (updateResult.rowsAffected === 1) {
      await connection.commit();
      const punto = await leerPunto(connection, recorridoRow.ID, puntoId);
      return { outcome: "ok", punto };
    }

    const puntoActual = await leerPunto(connection, recorridoRow.ID, puntoId);
    if (!puntoActual) return { outcome: "not_found" };
    if (puntoActual.estado === estadoIdempotente) {
      return { outcome: "ok", punto: puntoActual };
    }
    return { outcome: "conflict", punto: puntoActual };
  });
}

async function leerPunto(connection, recorridoId, puntoId) {
  const result = await connection.execute(
    `SELECT id, orden, latitud, longitud, estado, arribo_en, descarga_en
     FROM ${tablaPuntos()}
     WHERE id = :puntoId AND recorrido_id = :recorridoId`,
    { puntoId, recorridoId },
  );
  const row = result.rows[0];
  return row ? mapPuntoRow(row) : null;
}
