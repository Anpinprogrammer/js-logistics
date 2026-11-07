/* Historial de cambios y papelera (lo borrado se puede recuperar). */
import { query } from "../config/db.js";
import { filaAObjeto } from "../helpers/sql.js";

export async function registrar({ uid, accion, tabla = null, registro = null, datos = null }, db = { query }) {
  await db.query(
    `INSERT INTO historial (uid, accion, tabla, registro, datos) VALUES ($1, $2, $3, $4, $5)`,
    [uid, accion, tabla, registro, datos]
  );
}

export async function listarHistorial({ uid, desde, hasta, limite = 200 } = {}) {
  const cond = [], valores = [];
  if (uid) { valores.push(uid); cond.push(`uid = $${valores.length}`); }
  if (desde) { valores.push(desde); cond.push(`fecha >= $${valores.length}`); }
  if (hasta) { valores.push(hasta); cond.push(`fecha < $${valores.length}`); }
  valores.push(limite);
  const { rows } = await query(
    `SELECT * FROM historial ${cond.length ? "WHERE " + cond.join(" AND ") : ""} ORDER BY fecha DESC LIMIT $${valores.length}`,
    valores
  );
  return rows.map(filaAObjeto);
}

export async function aPapelera({ tabla, registro, datos, grupo = null, uid }, db = { query }) {
  await db.query(
    `INSERT INTO papelera (tabla, registro, datos, grupo, uid) VALUES ($1, $2, $3, $4, $5)`,
    [tabla, registro, datos, grupo, uid]
  );
}
