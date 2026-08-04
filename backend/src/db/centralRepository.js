import oracledb from "oracledb";
import { withConnection } from "./pool.js";
import { obtenerRespaldoDesdeEventos, resolverUbicacion } from "./ubicacionResolver.js";
import { ubicacionEnMemoriaCompartida } from "../state/ubicacionEnMemoria.js";
import { createEmqxProvisioning } from "../mqtt/emqxProvisioning.js";

// Mismo patrón de validación de identificadores que recorridoRepository.js:
// los nombres vienen de configuración del operador, no de input de usuario,
// pero igual se validan antes de interpolarlos en las queries.
const IDENTIFIER_RE = /^[A-Za-z_][A-Za-z0-9_]*(\.[A-Za-z_][A-Za-z0-9_]*)?$/;

function validarIdentificador(nombre, variable) {
  if (!IDENTIFIER_RE.test(nombre)) {
    throw new Error(`${variable} inválido: ${nombre}`);
  }
  return nombre;
}

function tablaRecorridos() {
  return validarIdentificador(process.env.ORACLE_TABLA_RECORRIDOS || "RECORRIDOS", "ORACLE_TABLA_RECORRIDOS");
}

function tablaPuntos() {
  return validarIdentificador(process.env.ORACLE_TABLA_PUNTOS || "PUNTOS_ENTREGA", "ORACLE_TABLA_PUNTOS");
}

function tablaFletes() {
  return validarIdentificador(process.env.ORACLE_TABLA_FLETES || "V_FLETES", "ORACLE_TABLA_FLETES");
}

function paqueteCentralApi() {
  return validarIdentificador(process.env.ORACLE_PACKAGE_CENTRAL_API || "CENTRAL_API", "ORACLE_PACKAGE_CENTRAL_API");
}

function umbralUbicacionMs() {
  return Number(process.env.UBICACION_STALE_MS || 300000);
}

function mapPuntoRow(row) {
  return {
    id: String(row.ID),
    orden: row.ORDEN,
    estado: row.ESTADO,
    arriboEn: row.ARRIBO_EN ? new Date(row.ARRIBO_EN).toISOString() : null,
    arriboLat: row.ARRIBO_LAT ?? null,
    arriboLon: row.ARRIBO_LON ?? null,
    descargaEn: row.DESCARGA_EN ? new Date(row.DESCARGA_EN).toISOString() : null,
    descargaLat: row.DESCARGA_LAT ?? null,
    descargaLon: row.DESCARGA_LON ?? null,
  };
}

async function leerPuntosDelRecorrido(connection, recorridoId) {
  const result = await connection.execute(
    `SELECT id, orden, estado, arribo_en, arribo_lat, arribo_lon,
            descarga_en, descarga_lat, descarga_lon
     FROM ${tablaPuntos()}
     WHERE recorrido_id = :recorridoId
     ORDER BY orden`,
    { recorridoId: Number(recorridoId) },
  );
  return result.rows.map(mapPuntoRow);
}

async function leerDetalle(connection, recorridoId) {
  const recorridoResult = await connection.execute(
    `SELECT id, estado, flete_id FROM ${tablaRecorridos()} WHERE id = :id`,
    { id: Number(recorridoId) },
  );
  const row = recorridoResult.rows[0];
  if (!row) return null;
  const puntos = await leerPuntosDelRecorrido(connection, row.ID);
  return {
    recorrido: {
      id: String(row.ID),
      estado: row.ESTADO,
      fleteId: row.FLETE_ID != null ? String(row.FLETE_ID) : null,
    },
    puntos,
  };
}

const RESULTADOS_ASIGNACION = {
  OK: "ok",
  NOT_FOUND: "not_found",
  YA_ASIGNADO: "ya_asignado",
  FLETE_OCUPADO: "flete_ocupado",
};

async function invocarAsignacion(procedimiento, recorridoId, fleteId) {
  return withConnection(async (connection) => {
    const result = await connection.execute(
      `BEGIN ${paqueteCentralApi()}.${procedimiento}(
         :recorridoId, :fleteId, :resultado, :token, :asignadoEn
       ); END;`,
      {
        recorridoId: Number(recorridoId),
        fleteId: Number(fleteId),
        resultado: { dir: oracledb.BIND_OUT, type: oracledb.STRING, maxSize: 40 },
        token: { dir: oracledb.BIND_OUT, type: oracledb.STRING, maxSize: 64 },
        asignadoEn: { dir: oracledb.BIND_OUT, type: oracledb.DATE },
      },
    );
    await connection.commit();

    const crudo = (result.outBinds.resultado || "").trim().toUpperCase();
    const outcome = RESULTADOS_ASIGNACION[crudo] ?? "not_found";
    if (outcome !== "ok") return { outcome };

    return {
      outcome,
      recorrido: {
        recorridoId: String(recorridoId),
        fleteId: String(fleteId),
        token: result.outBinds.token,
        asignadoEn: result.outBinds.asignadoEn ? new Date(result.outBinds.asignadoEn).toISOString() : null,
      },
    };
  });
}

/**
 * Repositorio de Central respaldado por Oracle (Principio IV). Lecturas por
 * vistas de solo lectura (V_RECORRIDOS/V_PUNTOS_ENTREGA ya validadas por
 * 001-chofer-recorrido, más V_FLETES nueva para esta feature — puramente
 * estática, sin ubicación); escrituras de asignación/reasignación por el
 * package PL/SQL CENTRAL_API (ver backend/sql/central_api.pks.sql y
 * research.md §5-§6). La última ubicación conocida de un flete NO sale de
 * Oracle: sale de `ubicacionStore` (memoria compartida con 001-chofer-recorrido),
 * con respaldo en el último evento arribo/descarga ya persistido (research.md §8).
 */
export function createOracleCentralRepository(
  ubicacionStore = ubicacionEnMemoriaCompartida,
  emqxProvisioning = createEmqxProvisioning(),
) {
  async function leerTokenActual(recorridoId) {
    return withConnection(async (connection) => {
      const result = await connection.execute(
        `SELECT token FROM ${tablaRecorridos()} WHERE id = :id`,
        { id: Number(recorridoId) },
      );
      return result.rows[0]?.TOKEN ?? null;
    });
  }

  return {
    async listarActivos() {
      return withConnection(async (connection) => {
        const staleMs = umbralUbicacionMs();
        const ahora = Date.now();

        const recorridosResult = await connection.execute(
          `SELECT r.id, r.flete_id, r.token, f.nombre AS flete_nombre
           FROM ${tablaRecorridos()} r
           JOIN ${tablaFletes()} f ON f.id = r.flete_id
           WHERE r.estado = 'activo'`,
        );
        const recorridos = recorridosResult.rows;
        if (recorridos.length === 0) return [];

        const resultado = [];
        for (const r of recorridos) {
          const puntos = await leerPuntosDelRecorrido(connection, r.ID);
          const progreso = { pendientes: 0, arribados: 0, completados: 0 };
          for (const p of puntos) {
            if (p.estado === "pendiente") progreso.pendientes += 1;
            else if (p.estado === "arribado") progreso.arribados += 1;
            else if (p.estado === "completado") progreso.completados += 1;
          }

          const enMemoria = ubicacionStore.obtener(r.ID);
          const respaldoOracle = obtenerRespaldoDesdeEventos(puntos);

          resultado.push({
            id: String(r.ID),
            token: r.TOKEN,
            flete: { id: String(r.FLETE_ID), nombre: r.FLETE_NOMBRE },
            progreso,
            ultimaUbicacion: resolverUbicacion({ enMemoria, respaldoOracle, staleMs, ahora }),
          });
        }
        return resultado;
      });
    },

    async listarDisponibles() {
      return withConnection(async (connection) => {
        const recorridosResult = await connection.execute(
          `SELECT id FROM ${tablaRecorridos()} WHERE flete_id IS NULL`,
        );
        const disponibles = [];
        for (const row of recorridosResult.rows) {
          const puntos = await leerPuntosDelRecorrido(connection, row.ID);
          disponibles.push({ id: String(row.ID), totalPuntos: puntos.length });
        }
        return disponibles;
      });
    },

    async listarFletesDisponibles() {
      return withConnection(async (connection) => {
        const result = await connection.execute(
          `SELECT f.id, f.nombre
           FROM ${tablaFletes()} f
           WHERE NOT EXISTS (
             SELECT 1 FROM ${tablaRecorridos()} r
             WHERE r.flete_id = f.id AND r.estado = 'activo'
           )`,
        );
        return result.rows.map((row) => ({ id: String(row.ID), nombre: row.NOMBRE }));
      });
    },

    async asignar(recorridoId, fleteId) {
      return invocarAsignacion("asignar_recorrido", recorridoId, fleteId);
    },

    async reasignar(recorridoId, fleteId) {
      // Se lee el token vigente ANTES de reasignar para poder revocar su
      // credencial MQTT después (003-mqtt-broker-fletes, FR-008): la
      // invalidación del token en sí sigue siendo responsabilidad exclusiva
      // y atómica del package PL/SQL (FR-009 de 002), esto es solo un efecto
      // secundario de mejor esfuerzo sobre el bróker.
      const tokenAnterior = await leerTokenActual(recorridoId);
      const resultado = await invocarAsignacion("reasignar_recorrido", recorridoId, fleteId);
      if (resultado.outcome === "ok" && tokenAnterior) {
        await emqxProvisioning.revocarCredencial(tokenAnterior);
      }
      return resultado;
    },

    async obtenerDetalle(recorridoId) {
      return withConnection((connection) => leerDetalle(connection, recorridoId));
    },

    async listarHistorial() {
      return withConnection(async (connection) => {
        const result = await connection.execute(
          `SELECT id FROM ${tablaRecorridos()} WHERE estado = 'finalizado'`,
        );
        const historial = [];
        for (const row of result.rows) {
          const detalle = await leerDetalle(connection, row.ID);
          if (detalle) historial.push(detalle);
        }
        return historial;
      });
    },
  };
}
