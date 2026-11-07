/* Personal: mensajeros, oficina, patinadores, dueño y empresa. */
import { query } from "../config/db.js";
import { filaAObjeto, armarSet } from "../helpers/sql.js";
import { nuevoId } from "../helpers/ids.js";

export async function listar({ incluirInactivos = false } = {}) {
  const { rows } = await query(
    `SELECT * FROM mensajeros ${incluirInactivos ? "" : "WHERE activo"} ORDER BY lower(nombre)`
  );
  return rows.map(filaAObjeto);
}

export async function buscarPorId(id, db = { query }) {
  const { rows } = await db.query(`SELECT * FROM mensajeros WHERE id = $1`, [id]);
  return filaAObjeto(rows[0]);
}

export async function crear({ nombre, telefono = "", tipo = "mensajero", tarifa = 0 }) {
  const { rows } = await query(
    `INSERT INTO mensajeros (id, nombre, telefono, tipo, tarifa) VALUES ($1, $2, $3, $4, $5) RETURNING *`,
    [nuevoId(), nombre.trim(), telefono.trim(), tipo, tarifa]
  );
  return filaAObjeto(rows[0]);
}

export async function actualizar(id, datos) {
  const set = armarSet(datos, ["nombre", "telefono", "tipo", "tarifa", "activo"], 2);
  if (!set) return buscarPorId(id);
  const { rows } = await query(`UPDATE mensajeros SET ${set.sql}, actualizado = now() WHERE id = $1 RETURNING *`, [id, ...set.valores]);
  return filaAObjeto(rows[0]);
}

export async function eliminar(id, db = { query }) {
  const { rows } = await db.query(`DELETE FROM mensajeros WHERE id = $1 RETURNING *`, [id]);
  return filaAObjeto(rows[0]);
}
