/* Pool de conexiones a Postgres compartido por toda la app. */
import pg from "pg";
import { env } from "./env.js";

// BIGINT (int8) llega como texto por defecto; los montos en pesos caben de sobra en un Number.
pg.types.setTypeParser(20, v => Number(v));
// DATE llega como texto AAAA-MM-DD (los "días" del negocio), sin pasar por la zona horaria del servidor.
pg.types.setTypeParser(1082, v => v);

export const pool = new pg.Pool({
  connectionString: env.DATABASE_URL,
  // Con DATABASE_CA se verifica el certificado del servidor; sin él, la conexión va cifrada pero sin verificar.
  ssl: !env.DATABASE_SSL ? false : env.DATABASE_CA ? { ca: env.DATABASE_CA } : { rejectUnauthorized: false },
  // Bajo a propósito: el pooler de Supabase en session mode tiene 15 cupos por proyecto y varios
  // procesos (local + Render) comparten ese cupo. Con 5 por proceso no se agota.
  max: env.DATABASE_POOL_MAX,
  idleTimeoutMillis: env.DATABASE_POOL_IDLE_MS,
  connectionTimeoutMillis: env.DATABASE_CONNECT_TIMEOUT_MS,
  // Evita que una conexión inactiva quede colgada si Supabase/NAT corta el socket (read ETIMEDOUT).
  keepAlive: true,
  keepAliveInitialDelayMillis: 10_000,
  application_name: "js-logistics-backend"
});

pool.on("error", e => console.error(
  `Error en una conexión inactiva de Postgres: ${e.message} ` +
  `(pool: ${pool.totalCount} abiertas, ${pool.idleCount} inactivas, ${pool.waitingCount} esperando)`
));

/** Consulta simple con el pool. */
export const query = (texto, valores) => pool.query(texto, valores);

/**
 * Ejecuta fn(cliente) dentro de una transacción. Si fn lanza, se hace ROLLBACK.
 * Los modelos reciben el cliente opcional `db` para participar en la misma transacción.
 */
export async function transaccion(fn) {
  const cliente = await pool.connect();
  try {
    await cliente.query("BEGIN");
    const resultado = await fn(cliente);
    await cliente.query("COMMIT");
    return resultado;
  } catch (e) {
    await cliente.query("ROLLBACK").catch(() => {});
    throw e;
  } finally {
    cliente.release();
  }
}
