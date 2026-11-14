/* Códigos numéricos de un solo uso para recuperar la contraseña. En la base solo vive el HMAC del código. */
import { query } from "../config/db.js";
import { filaAObjeto } from "../helpers/sql.js";
import { nuevoId } from "../helpers/ids.js";

const COLUMNAS = `id, usuario_id, canal, codigo_hash, expira, intentos, usado, creado`;

/** Crea el código y anula los anteriores sin usar de la cuenta; limpia los vencidos o ya usados. */
export async function crear({ usuarioId, codigoHash, expira, canal = "correo" }, db = { query }) {
  await db.query(`DELETE FROM codigos_clave WHERE usuario_id = $1 AND (usado IS NOT NULL OR expira < now()) AND creado < now() - interval '1 hour'`, [usuarioId]);
  await db.query(`UPDATE codigos_clave SET usado = now() WHERE usuario_id = $1 AND usado IS NULL`, [usuarioId]);
  const { rows } = await db.query(
    `INSERT INTO codigos_clave (id, usuario_id, canal, codigo_hash, expira)
     VALUES ($1, $2, $3, $4, $5) RETURNING ${COLUMNAS}`,
    [nuevoId(20), usuarioId, canal, codigoHash, expira]
  );
  return filaAObjeto(rows[0]);
}

/** Cuántos códigos se le han mandado a la cuenta en la última hora (para el límite por cuenta). */
export async function contarUltimaHora(usuarioId, db = { query }) {
  const { rows } = await db.query(
    `SELECT count(*)::int AS n FROM codigos_clave WHERE usuario_id = $1 AND creado > now() - interval '1 hour'`,
    [usuarioId]
  );
  return rows[0].n;
}

/**
 * Suma un intento al código vigente de la cuenta y lo devuelve, en una sola sentencia: así dos
 * peticiones en paralelo no pueden probar más claves que las permitidas. Sin código vigente, devuelve null.
 */
export async function registrarIntento(usuarioId, db = { query }) {
  const { rows } = await db.query(
    `UPDATE codigos_clave SET intentos = intentos + 1
      WHERE id = (SELECT id FROM codigos_clave
                   WHERE usuario_id = $1 AND usado IS NULL AND expira > now()
                   ORDER BY creado DESC LIMIT 1)
      RETURNING ${COLUMNAS}`,
    [usuarioId]
  );
  return filaAObjeto(rows[0]);
}

/** Quema el código. Devuelve false si otra petición ya lo había usado. */
export async function marcarUsado(id, db = { query }) {
  const r = await db.query(`UPDATE codigos_clave SET usado = now() WHERE id = $1 AND usado IS NULL`, [id]);
  return r.rowCount === 1;
}

export async function invalidarDeUsuario(usuarioId, db = { query }) {
  await db.query(`UPDATE codigos_clave SET usado = now() WHERE usuario_id = $1 AND usado IS NULL`, [usuarioId]);
}
