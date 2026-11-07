/* Clientes (remitentes). */
import { query } from "../config/db.js";
import { filaAObjeto, armarSet } from "../helpers/sql.js";
import { nuevoId } from "../helpers/ids.js";

export async function listar({ buscar, limite = 100, desde = 0 } = {}) {
  const valores = [];
  let donde = "";
  if (buscar) {
    // %, _ y \ se escapan para que se busquen como texto y no como comodines
    valores.push(`%${buscar.toLowerCase().replace(/[\\%_]/g, c => "\\" + c)}%`);
    donde = `WHERE lower(nombre) LIKE $1 OR telefono LIKE $1`;
  }
  valores.push(limite, desde);
  const { rows } = await query(
    `SELECT * FROM clientes ${donde} ORDER BY lower(nombre) LIMIT $${valores.length - 1} OFFSET $${valores.length}`,
    valores
  );
  return rows.map(filaAObjeto);
}

export async function buscarPorId(id, db = { query }) {
  const { rows } = await db.query(`SELECT * FROM clientes WHERE id = $1`, [id]);
  return filaAObjeto(rows[0]);
}

/** Posibles repetidos: mismo nombre (sin mayúsculas ni espacios de más) o mismos últimos 10 dígitos del teléfono. */
export async function parecidos({ nombre, telefono }) {
  const digitos = String(telefono || "").replace(/\D/g, "").slice(-10);
  const { rows } = await query(
    `SELECT * FROM clientes
     WHERE lower(regexp_replace(trim(nombre), '\\s+', ' ', 'g')) = lower(regexp_replace(trim($1), '\\s+', ' ', 'g'))
        OR ($2 <> '' AND right(regexp_replace(telefono, '\\D', '', 'g'), 10) = $2)`,
    [nombre || "", digitos]
  );
  return rows.map(filaAObjeto);
}

export async function crear({ nombre, telefono = "", tarifa = 0 }) {
  const { rows } = await query(
    `INSERT INTO clientes (id, nombre, telefono, tarifa) VALUES ($1, $2, $3, $4) RETURNING *`,
    [nuevoId(), nombre.trim(), telefono.trim(), tarifa]
  );
  return filaAObjeto(rows[0]);
}

export async function actualizar(id, datos) {
  const set = armarSet(datos, ["nombre", "telefono", "tarifa"], 2);
  if (!set) return buscarPorId(id);
  const { rows } = await query(`UPDATE clientes SET ${set.sql}, actualizado = now() WHERE id = $1 RETURNING *`, [id, ...set.valores]);
  return filaAObjeto(rows[0]);
}

export async function eliminar(id, db = { query }) {
  const { rows } = await db.query(`DELETE FROM clientes WHERE id = $1 RETURNING *`, [id]);
  return filaAObjeto(rows[0]);
}
