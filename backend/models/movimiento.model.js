/* Movimientos de la cuenta de cada cliente (pagos, cargos, abonos…). */
import { query } from "../config/db.js";
import { filaAObjeto, paginaEnParalelo } from "../helpers/sql.js";

export async function listarDeCliente(clienteId, { desde, hasta, limite = 200 } = {}) {
  const cond = ["cliente_id = $1"], valores = [clienteId];
  if (desde) { valores.push(desde); cond.push(`fecha >= $${valores.length}`); }
  if (hasta) { valores.push(hasta); cond.push(`fecha < $${valores.length}`); }
  valores.push(limite);
  const { rows } = await query(
    `SELECT id, cliente_id, tipo, valor, medio, nota, fecha, por_nombre, reverso_de
     FROM movimientos WHERE ${cond.join(" AND ")} ORDER BY fecha DESC LIMIT $${valores.length}`,
    valores
  );
  return rows.map(filaAObjeto);
}

/* ---- Recepción → Recibir dinero: pagos de clientes que recibió un mensajero en la calle ---- */
const RECIBIDOS = `
  SELECT m.id, m.mensajero_id, m.cliente_id, c.nombre AS cliente_nombre, m.nota AS concepto, m.valor, coalesce(m.medio, 'efectivo') AS medio, m.fecha
  FROM movimientos m JOIN clientes c ON c.id = m.cliente_id
  WHERE m.mensajero_id = $1 AND m.tipo = 'pago_de_cliente'`;
// "Hoy" es el día de Colombia, no el del servidor (que corre en UTC).
const ES_HOY = `(fecha AT TIME ZONE 'America/Bogota')::date = (now() AT TIME ZONE 'America/Bogota')::date`;

/** Total y lo de hoy de lo que recibió un mensajero, con cuántos pagos tiene cada uno. */
export async function resumenRecibidos(mensajeroId) {
  const { rows } = await query(
    `SELECT coalesce(sum(valor), 0)::bigint AS total, count(*)::int AS registros,
            coalesce(sum(valor) FILTER (WHERE ${ES_HOY}), 0)::bigint AS total_hoy,
            (count(*) FILTER (WHERE ${ES_HOY}))::int AS registros_hoy
     FROM movimientos WHERE mensajero_id = $1 AND tipo = 'pago_de_cliente'`,
    [mensajeroId]
  );
  return filaAObjeto(rows[0]);
}

/** Lo que recibió un mensajero, lo más nuevo primero, por páginas (paginador de pantalla). */
export async function recibidosPagina({ mensajeroId, pagina = 1, porPagina = 8 }) {
  const r = await paginaEnParalelo({
    pagina, porPagina,
    contar: async () => (await query(`SELECT count(*)::int AS total FROM movimientos WHERE mensajero_id = $1 AND tipo = 'pago_de_cliente'`, [mensajeroId])).rows[0].total,
    traer: async offset => (await query(`${RECIBIDOS} ORDER BY m.fecha DESC, m.id LIMIT $2 OFFSET $3`, [mensajeroId, porPagina, offset])).rows
  });
  return { registros: r.filas.map(filaAObjeto), pagina: r.pagina, porPagina, total: r.total, paginas: r.paginas };
}
