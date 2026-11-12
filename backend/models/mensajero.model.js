/* Personal: mensajeros, oficina, patinadores, dueño y empresa. */
import { query } from "../config/db.js";
import { filaAObjeto, armarSet, paginaEnParalelo } from "../helpers/sql.js";
import { nuevoId } from "../helpers/ids.js";

export async function listar({ incluirInactivos = false } = {}) {
  const { rows } = await query(
    `SELECT * FROM mensajeros ${incluirInactivos ? "" : "WHERE activo"} ORDER BY lower(nombre)`
  );
  return rows.map(filaAObjeto);
}

/** Una página de Personal con búsqueda por nombre/teléfono y filtro por tipo. */
export async function paginar({ buscar = "", tipo = "", pagina = 1, porPagina = 7 } = {}) {
  const params = [], cond = ["activo"];
  if (buscar) { params.push(`%${buscar}%`); cond.push(`(nombre ILIKE $${params.length} OR telefono ILIKE $${params.length})`); }
  if (tipo) { params.push(tipo); cond.push(`tipo = $${params.length}`); }
  const where = "WHERE " + cond.join(" AND ");
  const tam = Math.max(1, Math.min(100, Number(porPagina) || 7));
  const r = await paginaEnParalelo({
    pagina, porPagina: tam,
    contar: async () => (await query(`SELECT count(*)::int AS total FROM mensajeros ${where}`, params)).rows[0]?.total || 0,
    traer: async offset => (await query(
      `SELECT * FROM mensajeros ${where}
       ORDER BY CASE tipo WHEN 'mensajero' THEN 0 WHEN 'dueno' THEN 1 WHEN 'oficina' THEN 2 WHEN 'patinador' THEN 3 ELSE 4 END, lower(nombre)
       LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, tam, offset]
    )).rows
  });
  return { filas: r.filas.map(filaAObjeto), total: r.total, pagina: r.pagina, porPagina: tam, paginas: r.paginas };
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
