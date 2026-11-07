/* Movimientos de la cuenta de cada cliente (pagos, cargos, abonos…). */
import { query } from "../config/db.js";
import { filaAObjeto } from "../helpers/sql.js";

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
