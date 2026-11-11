/* Historial de la cuenta de un cliente: pedidos cerrados + movimientos, paginado en SQL.
   El saldo se calcula con las mismas reglas de helpers/calculos.js, pero sin cargar todas las filas. */
import { query } from "../config/db.js";
import { filaAObjeto } from "../helpers/sql.js";
import { MOVS } from "../helpers/constantes.js";
import { metodoTxt, saldoPedido, signoMov, textoDomi } from "../helpers/calculos.js";
import { pesos } from "../helpers/texto.js";

const PEDIDOS_SQL = `
  SELECT guia, entregado, destinatario, estado, metodo, motivo_dev,
         valor_cobrado, valor_servicio, gasto, domi_pagado, domi_pago_valor, cobrar_dev
  FROM pedidos
  WHERE cliente_id = $1 AND estado IN ('entregado', 'devuelto')
  ORDER BY entregado DESC
  LIMIT $2`;

const MOVIMIENTOS_SQL = `
  SELECT id, tipo, valor, nota, fecha
  FROM movimientos
  WHERE cliente_id = $1
  ORDER BY fecha DESC
  LIMIT $2`;

const SALDO_SQL = `
  SELECT
    COALESCE((
      SELECT SUM(
        (CASE WHEN p.metodo = 'transf_cliente' OR p.estado = 'devuelto' THEN 0 ELSE COALESCE(p.valor_cobrado, 0) END)
        - (
            (CASE WHEN p.estado = 'devuelto' AND NOT p.cobrar_dev THEN 0 ELSE COALESCE(p.valor_servicio, 0) END)
            + COALESCE(p.gasto, 0)
          )
        + (CASE WHEN p.domi_pagado THEN COALESCE(p.domi_pago_valor,
              CASE WHEN p.estado = 'devuelto' AND NOT p.cobrar_dev THEN 0 ELSE COALESCE(p.valor_servicio, 0) END) ELSE 0 END)
      )
      FROM pedidos p
      WHERE p.cliente_id = $1 AND p.estado IN ('entregado', 'devuelto')
    ), 0)
    + COALESCE((
      SELECT SUM(CASE WHEN m.tipo IN ('abono', 'pago_de_cliente') THEN m.valor ELSE -m.valor END)
      FROM movimientos m
      WHERE m.cliente_id = $1
    ), 0) AS saldo`;

/** Historial paginado + saldo + pedidos en ruta. */
export async function historial(clienteId, { pagina = 1, porPagina = 10 } = {}) {
  const tam = Math.max(1, Math.min(50, Number(porPagina) || 10));
  const resumen = await query(`
    SELECT
      (SELECT count(*) FROM pedidos WHERE cliente_id = $1 AND estado IN ('entregado', 'devuelto'))
      + (SELECT count(*) FROM movimientos WHERE cliente_id = $1) AS total,
      (SELECT count(*) FROM pedidos WHERE cliente_id = $1 AND estado = 'pendiente') AS en_ruta`,
  [clienteId]);
  const total = Number(resumen.rows[0]?.total) || 0;
  const paginas = Math.max(1, Math.ceil(total / tam));
  const actual = Math.min(Math.max(1, Number(pagina) || 1), paginas);
  const limite = actual * tam;

  const [pedidos, movimientos, saldo] = await Promise.all([
    query(PEDIDOS_SQL, [clienteId, limite]),
    query(MOVIMIENTOS_SQL, [clienteId, limite]),
    query(SALDO_SQL, [clienteId])
  ]);

  const filas = [
    ...pedidos.rows.map(filaAObjeto).map(p => ({
      fecha: p.entregado,
      det: `${p.guia} · ${p.destinatario || ""} · ${metodoTxt(p)} · cobró ${pesos(p.valorCobrado)} · ${textoDomi(p)}`,
      v: saldoPedido(p),
      guia: p.guia,
      nom: p.destinatario || (p.estado === "devuelto" ? "Devolucion" : "")
    })),
    ...movimientos.rows.map(filaAObjeto).map(m => ({
      fecha: m.fecha,
      det: (MOVS[m.tipo]?.corto || "Movimiento") + (m.nota ? " · " + m.nota : ""),
      v: signoMov(m),
      nom: (MOVS[m.tipo]?.corto || "Movimiento") + (m.nota ? " " + m.nota : "")
    }))
  ].sort((a, b) => new Date(b.fecha) - new Date(a.fecha));

  return {
    filas: filas.slice((actual - 1) * tam, actual * tam),
    total, pagina: actual, porPagina: tam, paginas,
    saldo: Number(saldo.rows[0]?.saldo) || 0,
    enRuta: Number(resumen.rows[0]?.en_ruta) || 0
  };
}
