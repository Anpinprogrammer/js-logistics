/* Pedidos (guías), sus intentos fallidos y el consecutivo. */
import { query, transaccion } from "../config/db.js";
import { filaAObjeto, armarSet } from "../helpers/sql.js";
import { formatoGuia } from "../helpers/ids.js";

const CON_INTENTOS = `
  SELECT p.*, c.nombre AS cliente_nombre, m.nombre AS mensajero_nombre,
    COALESCE((SELECT json_agg(json_build_object('fecha', i.fecha, 'motivo', i.motivo, 'nota', i.nota) ORDER BY i.fecha)
              FROM pedido_intentos i WHERE i.guia = p.guia), '[]'::json) AS intentos,
    (SELECT a.ruta FROM pedido_archivos a WHERE a.guia = p.guia AND a.tipo = 'mini' ORDER BY a.creado DESC LIMIT 1) AS mini_ruta
  FROM pedidos p
  LEFT JOIN clientes c ON c.id = p.cliente_id
  LEFT JOIN mensajeros m ON m.id = p.mensajero_id`;

/**
 * Lista con filtros. `alcance` lo pone el controlador según el rol: { mensajeroId } o { clienteId }
 * para que cada quien vea solo lo suyo, igual que firestore.rules.
 */
export async function listar({ estado, mensajeroId, clienteId, desde, hasta, buscar, conDiferencia, limite = 100, cursor } = {}) {
  const cond = [], valores = [];
  const agregar = (sql, v) => { valores.push(v); cond.push(sql.replace("?", `$${valores.length}`)); };
  if (estado) agregar("p.estado = ?", estado);
  if (mensajeroId) agregar("p.mensajero_id = ?", mensajeroId);
  if (clienteId) agregar("p.cliente_id = ?", clienteId);
  if (desde) agregar("p.creado >= ?", desde);
  if (hasta) agregar("p.creado < ?", hasta);
  if (buscar) {
    valores.push(`%${buscar.replace(/[\\%_]/g, c => "\\" + c)}%`);
    cond.push(`(p.guia ILIKE $${valores.length} OR p.destinatario ILIKE $${valores.length})`);
  }
  if (conDiferencia) cond.push("p.dif_cobro <> 0 AND NOT p.dif_revisada");
  if (cursor) agregar("p.n < ?", cursor); // paginación: el `n` más bajo de la página anterior
  valores.push(limite);
  const { rows } = await query(
    `${CON_INTENTOS} ${cond.length ? "WHERE " + cond.join(" AND ") : ""} ORDER BY p.n DESC LIMIT $${valores.length}`,
    valores
  );
  return rows.map(filaAObjeto);
}

export async function buscarPorGuia(guia, db = { query }) {
  const { rows } = await db.query(`${CON_INTENTOS} WHERE p.guia = $1`, [guia]);
  return filaAObjeto(rows[0]);
}

/** Bloquea la fila hasta el fin de la transacción, para validar y cambiar sin carreras. */
export async function bloquear(guia, db) {
  const { rows } = await db.query(`SELECT * FROM pedidos WHERE guia = $1 FOR UPDATE`, [guia]);
  return filaAObjeto(rows[0]);
}

/**
 * Crea la guía con el siguiente consecutivo, en una transacción: dos mensajeros a la vez nunca reciben
 * el mismo número y, si algo falla, el contador no avanza (no quedan huecos).
 */
export async function crear({ mensajeroId, clienteId = null, valorServicio = 0, aCobrar = 0, creadoPor }) {
  return transaccion(async db => {
    const { rows: [c] } = await db.query(`UPDATE contadores SET n = n + 1 WHERE nombre = 'guia' RETURNING n`);
    const n = c.n, guia = formatoGuia(n);
    await db.query(
      `INSERT INTO pedidos (guia, n, mensajero_id, cliente_id, valor_servicio, a_cobrar, creado_por)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [guia, n, mensajeroId, clienteId, valorServicio, aCobrar, creadoPor]
    );
    return buscarPorGuia(guia, db);
  });
}

// Columnas que se pueden cambiar con actualizar(). La lista la fija el código, no la petición.
const CAMPOS = [
  "estado", "mensajeroId", "clienteId", "valorServicio", "aCobrar", "entregado", "destinatario", "valorCobrado",
  "metodo", "cuentaJs", "difCobro", "difRevisada", "entregoUid", "motivoDev", "notaDev", "cobrarDev", "cambio",
  "cambioRecibido", "cambioConfirmo", "gasto", "gastoNota", "domiPagado", "domiPagoMedio", "domiPagoValor",
  "domiPagoFecha", "domiPagoUid", "fotosBorradas"
];

export async function actualizar(guia, datos, db = { query }) {
  const set = armarSet(datos, CAMPOS, 2);
  if (!set) return buscarPorGuia(guia, db);
  const { rowCount } = await db.query(`UPDATE pedidos SET ${set.sql}, actualizado = now() WHERE guia = $1`, [guia, ...set.valores]);
  return rowCount ? buscarPorGuia(guia, db) : null;
}

export async function agregarIntento(guia, { motivo, nota = "", por }, db = { query }) {
  await db.query(`INSERT INTO pedido_intentos (guia, motivo, nota, por) VALUES ($1, $2, $3, $4)`, [guia, motivo, nota, por]);
}

export async function eliminar(guia, db) {
  const { rows } = await db.query(`DELETE FROM pedidos WHERE guia = $1 RETURNING *`, [guia]);
  return filaAObjeto(rows[0]);
}

/** Fotos y firmas vigentes del pedido (las "previas" solo las ve la oficina). */
export async function listarArchivos(guia, { incluirPrevias = false } = {}) {
  const { rows } = await query(
    `SELECT DISTINCT ON (tipo, CASE WHEN tipo = 'previa' THEN id END) id, tipo, ruta, creado
     FROM pedido_archivos WHERE guia = $1 AND tipo <> 'mini' ${incluirPrevias ? "" : "AND tipo <> 'previa'"}
     ORDER BY tipo, CASE WHEN tipo = 'previa' THEN id END, creado DESC`,
    [guia]
  );
  return rows.map(filaAObjeto);
}
