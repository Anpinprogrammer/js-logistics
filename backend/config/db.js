/* Pool de conexiones a Postgres compartido por toda la app. */
import pg from "pg";
import { env } from "./env.js";

// BIGINT (int8) llega como texto por defecto; los montos en pesos caben de sobra en un Number.
pg.types.setTypeParser(20, v => Number(v));
// DATE llega como texto AAAA-MM-DD (los "días" del negocio), sin pasar por la zona horaria del servidor.
pg.types.setTypeParser(1082, v => v);

/* Un solo pool por proceso: todo el backend importa este `pool` (nunca se crea otro por petición).
   Los usuarios conectados NO abren conexiones propias a Postgres: todos comparten estas pocas, y cada
   consulta ocupa una solo unos milisegundos. Lo que cuenta contra el cupo de Supabase son los procesos
   (cada `npm run dev` en un computador, cada instancia de Render, cada script) por DATABASE_POOL_MAX. */

// Los scripts de base (db:migrar, db:importar, db:demo) arrancan con `--import ./db/conexion-migraciones.js`
// y usan DATABASE_URL_MIGRACIONES si existe: sentencias largas y de varias líneas van mejor en session mode.
const paraMigraciones = process.env.JSL_CONEXION === "migraciones" && env.DATABASE_URL_MIGRACIONES;
const url = paraMigraciones ? env.DATABASE_URL_MIGRACIONES : env.DATABASE_URL;

/** Cómo se llama la conexión en los registros, sin usuario ni clave. */
export function describirConexion(cadena = url) {
  try {
    const u = new URL(cadena);
    const puerto = u.port || "5432";
    const supabase = u.hostname.endsWith(".pooler.supabase.com");
    const modo = supabase ? (puerto === "6543" ? "Transaction pooler" : "Session pooler")
      : u.hostname.endsWith(".supabase.co") ? "conexión directa de Supabase" : "Postgres";
    return { host: u.hostname, puerto, modo, transaccion: supabase && puerto === "6543" };
  } catch {
    return { host: "?", puerto: "?", modo: "Postgres", transaccion: false };
  }
}

export const pool = new pg.Pool({
  connectionString: url,
  // Con DATABASE_CA se verifica el certificado del servidor; sin él, la conexión va cifrada pero sin verificar.
  ssl: !env.DATABASE_SSL ? false : env.DATABASE_CA ? { ca: env.DATABASE_CA } : { rejectUnauthorized: false },
  // Bajo a propósito (5 por defecto). Con el Transaction pooler alcanza para muchos usuarios a la vez;
  // en session mode el cupo es 15 para todo el proyecto y lo comparten todos los procesos.
  // Los scripts de base casi siempre usan una o dos conexiones: con 3 no le quitan cupo a la app.
  max: process.env.JSL_CONEXION === "migraciones" ? Math.min(3, env.DATABASE_POOL_MAX) : env.DATABASE_POOL_MAX,
  idleTimeoutMillis: env.DATABASE_POOL_IDLE_MS,
  connectionTimeoutMillis: env.DATABASE_CONNECT_TIMEOUT_MS,
  // Evita que una conexión inactiva quede colgada si Supabase/NAT corta el socket (read ETIMEDOUT).
  keepAlive: true,
  keepAliveInitialDelayMillis: 10_000,
  // Renueva cada conexión a los 10 minutos: si el pooler la cortó por dentro, no se queda en el pool.
  maxLifetimeSeconds: 600,
  application_name: "js-logistics-backend"
});

pool.on("error", e => console.error(
  `Error en una conexión inactiva de Postgres: ${e.message} ` +
  `(pool: ${pool.totalCount} abiertas, ${pool.idleCount} inactivas, ${pool.waitingCount} esperando)`
));

/* Compatible con el Transaction pooler (Supavisor, puerto 6543): no se usan sentencias preparadas con nombre
   (`{ name }` en pg), ni LISTEN/NOTIFY, ni SET de sesión, ni bloqueos asesores de sesión. Los bloqueos son
   pg_advisory_xact_lock y los SET son SET LOCAL, que viven solo dentro de la transacción. Si agregas algo
   así, hazlo dentro de `transaccion()`. */

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
