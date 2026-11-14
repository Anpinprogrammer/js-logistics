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

/** Historial de dinero de un mensajero (Recepción → Historial): los pagos que recibió de clientes (`tipo: "pago"`) mezclados con
    el dinero que entregó a la oficina (`tipo: "entrega"`, de `recaudos`; la liquidación del período es una entrega con nota
    "Liquidación"). Lo más nuevo primero. En las entregas `clienteNombre` es el título y `concepto` el detalle. */
const HISTORIAL_RECIBIDOS = `
  SELECT m.id, m.mensajero_id, m.cliente_id, c.nombre AS cliente_nombre, m.nota AS concepto, m.valor, coalesce(m.medio, 'efectivo') AS medio, m.fecha, 'pago' AS tipo
  FROM movimientos m JOIN clientes c ON c.id = m.cliente_id WHERE m.mensajero_id = $1 AND m.tipo = 'pago_de_cliente'
  UNION ALL
  SELECT e.id, e.mensajero_id, NULL,
         CASE WHEN e.nota = 'Liquidación' THEN 'Liquidación de período' ELSE 'Entregado en oficina' END,
         CASE WHEN e.nota = 'Liquidación' THEN concat_ws(' · ', 'Cierre del período', nullif(e.por_nombre, ''))
              ELSE concat_ws(' · ', nullif(e.nota, ''), CASE WHEN e.por_nombre <> '' THEN 'Recibió ' || e.por_nombre END) END,
         e.valor, coalesce(e.medio, 'efectivo'), e.fecha, 'entrega'
  FROM recaudos e WHERE e.mensajero_id = $1`;

/** Filtros del historial: `tipo` (ingresos = pagos, salidas = entregas), `dia` (día de Colombia) y `buscar` (en el título o el detalle). */
function filtrosHistorial({ tipo = "todos", dia, buscar }, params) {
  const cond = [];
  if (tipo === "ingresos") cond.push(`h.tipo = 'pago'`);
  if (tipo === "salidas") cond.push(`h.tipo = 'entrega'`);
  if (dia) { params.push(dia); cond.push(`(h.fecha AT TIME ZONE 'America/Bogota')::date = $${params.length}::date`); }
  if (buscar) {
    params.push("%" + buscar.replaceAll("\\", "\\\\").replaceAll("%", "\\%").replaceAll("_", "\\_") + "%"); // % _ y \ del texto no son comodines
    cond.push(`(h.cliente_nombre ILIKE $${params.length} OR h.concepto ILIKE $${params.length})`);
  }
  return cond.length ? " WHERE " + cond.join(" AND ") : "";
}

export async function historialRecibidos({ mensajeroId, pagina = 1, porPagina = 8, tipo, dia, buscar }) {
  const r = await paginaEnParalelo({
    pagina, porPagina,
    contar: async () => {
      const params = [mensajeroId], donde = filtrosHistorial({ tipo, dia, buscar }, params);
      return (await query(`SELECT count(*)::int AS total FROM (${HISTORIAL_RECIBIDOS}) h${donde}`, params)).rows[0].total;
    },
    traer: async offset => {
      const params = [mensajeroId, porPagina, offset], donde = filtrosHistorial({ tipo, dia, buscar }, params);
      return (await query(`SELECT * FROM (${HISTORIAL_RECIBIDOS}) h${donde} ORDER BY h.fecha DESC, h.id LIMIT $2 OFFSET $3`, params)).rows;
    }
  });
  return { registros: r.filas.map(filaAObjeto), pagina: r.pagina, porPagina, total: r.total, paginas: r.paginas };
}
