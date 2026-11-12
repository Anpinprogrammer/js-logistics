/* Caja del patinador: cada pago que recibe de un cliente en su ruta (tabla caja_patinador). */
import { query } from "../config/db.js";
import { filaAObjeto, paginaEnParalelo } from "../helpers/sql.js";
import { nuevoId } from "../helpers/ids.js";

const CON_CLIENTE = `
  SELECT r.id, r.mensajero_id, r.cliente_id, c.nombre AS cliente_nombre, r.concepto, r.valor, r.fecha
  FROM caja_patinador r JOIN clientes c ON c.id = r.cliente_id`;

// "Hoy" es el día de Colombia, no el del servidor (que corre en UTC).
const ES_HOY = `(r.fecha AT TIME ZONE 'America/Bogota')::date = (now() AT TIME ZONE 'America/Bogota')::date`;

/** La fecha la pone la base (now()): el patinador no puede anotar un pago con otra hora. */
export async function crear({ mensajeroId, clienteId, concepto, valor, porUid }, db = { query }) {
  const id = nuevoId();
  await db.query(
    `INSERT INTO caja_patinador (id, mensajero_id, cliente_id, concepto, valor, por_uid) VALUES ($1, $2, $3, $4, $5, $6)`,
    [id, mensajeroId, clienteId, concepto, valor, porUid]
  );
  const { rows } = await db.query(`${CON_CLIENTE} WHERE r.id = $1`, [id]);
  return filaAObjeto(rows[0]);
}

/** Total acumulado y lo de hoy, con cuántos registros tiene cada uno. */
export async function resumen(mensajeroId, db = { query }) {
  const { rows } = await db.query(
    `SELECT coalesce(sum(r.valor), 0)::bigint AS total, count(*)::int AS registros,
            coalesce(sum(r.valor) FILTER (WHERE ${ES_HOY}), 0)::bigint AS total_hoy,
            (count(*) FILTER (WHERE ${ES_HOY}))::int AS registros_hoy
     FROM caja_patinador r WHERE r.mensajero_id = $1`,
    [mensajeroId]
  );
  return filaAObjeto(rows[0]);
}

/** Registros de un patinador, los más nuevos primero, por páginas (paginador de pantalla). */
export async function listarPagina({ mensajeroId, pagina = 1, porPagina = 8 }) {
  const r = await paginaEnParalelo({
    pagina, porPagina,
    contar: async () => (await query(`SELECT count(*)::int AS total FROM caja_patinador WHERE mensajero_id = $1`, [mensajeroId])).rows[0].total,
    traer: async offset => (await query(
      `${CON_CLIENTE} WHERE r.mensajero_id = $1 ORDER BY r.fecha DESC, r.id LIMIT $2 OFFSET $3`,
      [mensajeroId, porPagina, offset]
    )).rows
  });
  return { registros: r.filas.map(filaAObjeto), pagina: r.pagina, porPagina, total: r.total, paginas: r.paginas };
}
