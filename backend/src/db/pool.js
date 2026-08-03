import oracledb from "oracledb";

oracledb.outFormat = oracledb.OUT_FORMAT_OBJECT;
oracledb.autoCommit = false;

let poolPromise = null;

// Pool único de conexiones Oracle (Principio IV: Oracle es la única fuente de
// verdad, no se cachea nada de esto localmente entre requests).
export function getPool() {
  if (!poolPromise) {
    poolPromise = oracledb.createPool({
      user: process.env.ORACLE_USER,
      password: process.env.ORACLE_PASSWORD,
      connectString: process.env.ORACLE_CONNECT_STRING,
      poolMax: Number(process.env.ORACLE_POOL_MAX || 4),
      poolMin: 0,
    });
  }
  return poolPromise;
}

export async function withConnection(fn) {
  const pool = await getPool();
  const connection = await pool.getConnection();
  try {
    return await fn(connection);
  } finally {
    await connection.close();
  }
}

export async function closePool() {
  if (poolPromise) {
    const pool = await poolPromise;
    await pool.close(0);
    poolPromise = null;
  }
}
