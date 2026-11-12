/* Pedidos (guías), sus intentos fallidos y el consecutivo. */
import { query, transaccion } from "../config/db.js";
import { filaAObjeto, armarSet } from "../helpers/sql.js";
import { formatoGuia } from "../helpers/ids.js";

const CON_INTENTOS = `
  SELECT p.*, c.nombre AS cliente_nombre, m.nombre AS mensajero_nombre,
    COALESCE((SELECT json_agg(json_build_object('fecha', i.fecha, 'motivo', i.motivo, 'nota', i.nota) ORDER BY i.fecha)
              FROM pedido_intentos i WHERE i.guia = p.guia), '[]'::json) AS intentos,
    (SELECT a.ruta FROM pedido_archivos a WHERE a.guia = p.guia AND a.tipo = 'mini' ORDER BY a.creado DESC LIMIT 1) AS mini_ruta,
    -- Si la guía salió de una solicitud: dónde recoger y a quién entregar (lo necesita el mensajero para "Recoger").
    -- Solo lo ve quien puede ver la guía; no trae los datos de contacto del remitente.
    (SELECT json_build_object('direccionRecogida', s.direccion_recogida, 'direccionEntrega', s.direccion_entrega,
       'destinatarioNombre', s.destinatario_nombre, 'destinatarioTelefono', s.destinatario_telefono, 'paquetes', s.paquetes)
     FROM solicitudes s WHERE s.guia = p.guia LIMIT 1) AS solicitud,
    -- Reintentos de un devuelto: las guías nuevas que apuntan a esta (para ver la cadena completa).
    COALESCE((SELECT json_agg(json_build_object('guia', r.guia, 'estado', r.estado) ORDER BY r.n)
              FROM pedidos r WHERE r.reintento_de = p.guia), '[]'::json) AS reintentos
  FROM pedidos p
  LEFT JOIN clientes c ON c.id = p.cliente_id
  LEFT JOIN mensajeros m ON m.id = p.mensajero_id`;

/** Inicio y fin (exclusivo) de un día de Colombia, que siempre es UTC−5. */
const limitesDia = dia => { const ini = new Date(dia + "T00:00:00-05:00"); return [ini, new Date(ini.getTime() + 864e5)]; };

/**
 * Arma el WHERE de los filtros. `mensajeroId` o `clienteId` los pone el controlador según el rol,
 * para que cada quien vea solo lo suyo, igual que firestore.rules.
 */
function filtrosSql({ estado, cerrados, mensajeroId, clienteId, desde, hasta, entregadoDesde, entregadoHasta, buscar, conDiferencia, diferencia,
  sinRemitente, cambioPendiente, sinServicio, dia } = {}) {
  const cond = [], valores = [];
  const agregar = (sql, v) => { valores.push(v); cond.push(sql.replace("?", `$${valores.length}`)); };
  if (estado) agregar("p.estado = ?", estado);
  if (mensajeroId) agregar("p.mensajero_id = ?", mensajeroId);
  if (clienteId) agregar("p.cliente_id = ?", clienteId);
  if (desde) agregar("p.creado >= ?", desde);
  if (hasta) agregar("p.creado < ?", hasta);
  if (cerrados) cond.push("p.estado IN ('entregado', 'devuelto')");
  if (entregadoDesde) agregar("p.entregado >= ?", entregadoDesde); // por hora de entrega o devolución
  if (entregadoHasta) agregar("p.entregado < ?", entregadoHasta);
  if (buscar) { // guía, quien recibió, remitente o mensajero, como el buscador de la app
    valores.push(`%${buscar.replace(/[\\%_]/g, c => "\\" + c)}%`);
    const $ = `$${valores.length}`;
    cond.push(`(p.guia ILIKE ${$} OR p.destinatario ILIKE ${$} OR c.nombre ILIKE ${$} OR m.nombre ILIKE ${$})`);
  }
  if (conDiferencia || diferencia === "sinRevisar") cond.push("p.dif_cobro <> 0 AND NOT p.dif_revisada");
  else if (diferencia === "todas") cond.push("p.dif_cobro <> 0");
  if (sinRemitente) cond.push("p.cliente_id IS NULL");
  if (cambioPendiente) cond.push("p.cambio AND p.cambio_recibido IS NULL");
  if (sinServicio) cond.push("p.estado = 'entregado' AND p.cliente_id IS NOT NULL AND p.valor_servicio = 0");
  if (dia) { // como delDia() de la app: salió ese día, o se entregó o devolvió ese día
    const [ini, fin] = limitesDia(dia);
    valores.push(ini, fin);
    const a = `$${valores.length - 1}`, b = `$${valores.length}`;
    cond.push(`((p.creado >= ${a} AND p.creado < ${b}) OR (p.entregado >= ${a} AND p.entregado < ${b}))`);
  }
  return { cond, valores };
}

const donde = cond => (cond.length ? "WHERE " + cond.join(" AND ") : "");

/** Lista por cursor: los `limite` pedidos siguientes, del más nuevo al más viejo. */
export async function listar({ limite = 100, cursor, ...filtros } = {}) {
  const { cond, valores } = filtrosSql(filtros);
  if (cursor) { valores.push(cursor); cond.push(`p.n < $${valores.length}`); } // el `n` más bajo de la página anterior
  valores.push(limite);
  const { rows } = await query(`${CON_INTENTOS} ${donde(cond)} ORDER BY p.n DESC LIMIT $${valores.length}`, valores);
  return rows.map(filaAObjeto);
}

/**
 * Lista por páginas numeradas, para el paginador de las pantallas. Si la página pedida ya no existe
 * (por ejemplo, porque se borraron pedidos o cambió el filtro), devuelve la última y dice cuál mandó.
 * Usa OFFSET: la pantalla salta a cualquier página, y con 20 por página el costo es bajo.
 */
export async function listarPagina({ pagina = 1, porPagina = 20, ...filtros } = {}) {
  const { cond, valores } = filtrosSql(filtros);
  const { rows: [c] } = await query(
    `SELECT count(*)::int AS total FROM pedidos p
     LEFT JOIN clientes c ON c.id = p.cliente_id LEFT JOIN mensajeros m ON m.id = p.mensajero_id ${donde(cond)}`,
    valores
  );
  const total = c.total, paginas = Math.max(1, Math.ceil(total / porPagina));
  const actual = Math.min(pagina, paginas);
  const { rows } = await query(
    `${CON_INTENTOS} ${donde(cond)} ORDER BY p.n DESC LIMIT $${valores.length + 1} OFFSET $${valores.length + 2}`,
    [...valores, porPagina, (actual - 1) * porPagina]
  );
  return { pedidos: rows.map(filaAObjeto), pagina: actual, porPagina, total, paginas };
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
/** Crea una guía con el siguiente consecutivo. Con `db` participa en una transacción que ya está abierta.
    `estado` "aceptado" es para las guías de una solicitud: quedan por recoger hasta que el mensajero les toma la foto. */
export async function crear({ mensajeroId, clienteId = null, valorServicio = 0, aCobrar = 0, creadoPor, estado = "pendiente", reintentoDe = null }, dbExterno) {
  const enDb = fn => (dbExterno ? fn(dbExterno) : transaccion(fn));
  return enDb(async db => {
    const { rows: [c] } = await db.query(`UPDATE contadores SET n = n + 1 WHERE nombre = 'guia' RETURNING n`);
    const n = c.n, guia = formatoGuia(n);
    await db.query(
      `INSERT INTO pedidos (guia, n, mensajero_id, cliente_id, valor_servicio, a_cobrar, creado_por, estado, reintento_de)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [guia, n, mensajeroId, clienteId, valorServicio, aCobrar, creadoPor, estado, reintentoDe]
    );
    return buscarPorGuia(guia, db);
  });
}

// Columnas que se pueden cambiar con actualizar(). La lista la fija el código, no la petición.
const CAMPOS = [
  "estado", "mensajeroId", "clienteId", "valorServicio", "aCobrar", "entregado", "destinatario", "valorCobrado",
  "metodo", "cuentaJs", "difCobro", "difRevisada", "entregoUid", "motivoDev", "notaDev", "cobrarDev", "cambio",
  "cambioRecibido", "cambioConfirmo", "gasto", "gastoNota", "domiPagado", "domiPagoMedio", "domiPagoValor",
  "domiPagoFecha", "domiPagoUid", "fotosBorradas", "destinoDev", "reintentoPedido"
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

/** Registra una foto o firma ya subida al bucket. La vigente de cada tipo es la más reciente. */
export async function agregarArchivo({ guia, tipo, ruta, por }, db = { query }) {
  const { rows } = await db.query(
    `INSERT INTO pedido_archivos (guia, tipo, ruta, por) VALUES ($1, $2, $3, $4) RETURNING id, tipo, ruta, creado`,
    [guia, tipo, ruta, por]
  );
  return filaAObjeto(rows[0]);
}
