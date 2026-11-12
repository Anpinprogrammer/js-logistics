/* Solicitudes de envío que llegan del formulario público de la landing. */
import { query } from "../config/db.js";
import { filaAObjeto, armarSet } from "../helpers/sql.js";
import { nuevoId } from "../helpers/ids.js";

// NUMERIC llega como texto desde pg: el peso se devuelve como número (o null).
const aObjeto = fila => {
  const o = filaAObjeto(fila);
  if (o) o.pesoKg = o.pesoKg == null ? null : Number(o.pesoKg);
  // Domicilio que tiene asignado el cliente (solo si la solicitud ya está ligada a una ficha).
  if (o && "clienteTarifa" in o) o.clienteTarifa = o.clienteTarifa == null ? null : Number(o.clienteTarifa);
  return o;
};

const CON_NOMBRES = `
  SELECT s.*, m.nombre AS mensajero_nombre, c.nombre AS cliente_nombre, c.tarifa AS cliente_tarifa
  FROM solicitudes s
  LEFT JOIN mensajeros m ON m.id = s.mensajero_id
  LEFT JOIN clientes c ON c.id = s.cliente_id`;

/** `origen` y `clienteId` los pone el controlador (nunca la petición): 'portal' trae la ficha del cliente que pidió. */
export async function crear(d) {
  const { rows } = await query(
    `INSERT INTO solicitudes (id, nombre, telefono, email, direccion_recogida, paquetes, peso_kg,
       destinatario_nombre, destinatario_telefono, direccion_entrega, origen, cliente_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12) RETURNING id`,
    [nuevoId(), d.nombre, d.telefono, d.email, d.direccionRecogida, d.paquetes, d.pesoKg ?? null,
      d.destinatarioNombre, d.destinatarioTelefono || "", d.direccionEntrega, d.origen || "publico", d.clienteId || null]
  );
  return buscarPorId(rows[0].id);
}

/** Cuántas solicitudes sin revisar tiene un cliente desde su portal: tope para que una cuenta no llene la campanita. */
export async function contarPendientesDeCliente(clienteId) {
  const { rows } = await query(`SELECT count(*)::int AS n FROM solicitudes WHERE estado = 'pendiente' AND cliente_id = $1`, [clienteId]);
  return rows[0].n;
}

/** ¿Ya hay una solicitud igual sin revisar, enviada hace poco? Evita repetidas por doble clic o reintentos. */
export async function hayRepetidaReciente({ telefono, direccionRecogida, direccionEntrega }, minutos = 30) {
  const { rows } = await query(
    `SELECT 1 FROM solicitudes
     WHERE estado = 'pendiente' AND telefono = $1 AND lower(direccion_recogida) = lower($2) AND lower(direccion_entrega) = lower($3)
       AND creado > now() - make_interval(mins => $4) LIMIT 1`,
    [telefono, direccionRecogida, direccionEntrega, minutos]
  );
  return rows.length > 0;
}

/** Cuántas solicitudes siguen sin revisar en total: tope de seguridad contra el llenado masivo. */
export async function contarPendientes() {
  const { rows } = await query(`SELECT count(*)::int AS n FROM solicitudes WHERE estado = 'pendiente'`);
  return rows[0].n;
}

export async function buscarPorId(id, db = { query }) {
  const { rows } = await db.query(`${CON_NOMBRES} WHERE s.id = $1`, [id]);
  return aObjeto(rows[0]);
}

/** Bloquea la fila hasta el fin de la transacción. Trae también el domicilio actual del cliente ligado. */
export async function bloquear(id, db) {
  const { rows } = await db.query(
    `SELECT s.*, c.tarifa AS cliente_tarifa FROM solicitudes s LEFT JOIN clientes c ON c.id = s.cliente_id
     WHERE s.id = $1 FOR UPDATE OF s`, [id]);
  return aObjeto(rows[0]);
}

/** Por atender (pendiente, cotizada, confirmada) o un estado en particular; las más nuevas primero. */
export async function listar({ estado, abiertas, limite = 50 } = {}) {
  const cond = [], valores = [];
  if (estado) { valores.push(estado); cond.push(`s.estado = $${valores.length}`); }
  else if (abiertas) cond.push(`s.estado IN ('pendiente', 'cotizada', 'confirmada')`);
  valores.push(limite);
  const { rows } = await query(
    `${CON_NOMBRES} ${cond.length ? "WHERE " + cond.join(" AND ") : ""} ORDER BY s.creado DESC LIMIT $${valores.length}`,
    valores
  );
  return rows.map(aObjeto);
}

// Filtros de la pantalla de Solicitudes → estados que incluyen. "Aceptadas" es lo que la oficina ya aprobó (con o sin guía).
export const GRUPOS = {
  pendientes: ["pendiente"],
  "por-confirmar": ["cotizada"],
  aceptadas: ["confirmada", "asignada"],
  rechazadas: ["rechazada"]
};

/** Una página de la lista (paginador de pantalla, con OFFSET). `grupo` omitido o "todas" = todas. */
export async function listarPagina({ grupo, pagina = 1, porPagina = 20 } = {}) {
  const estados = GRUPOS[grupo];
  const valores = [];
  if (estados) valores.push(estados);
  const donde = estados ? "WHERE s.estado = ANY($1)" : "";
  const { rows: [{ n }] } = await query(`SELECT count(*)::int AS n FROM solicitudes s ${donde}`, valores);
  const { rows } = await query(
    `${CON_NOMBRES} ${donde} ORDER BY s.creado DESC LIMIT $${valores.length + 1} OFFSET $${valores.length + 2}`,
    [...valores, porPagina, (pagina - 1) * porPagina]
  );
  return { solicitudes: rows.map(aObjeto), total: n, paginas: Math.max(1, Math.ceil(n / porPagina)) };
}

/** Cuántas hay en cada filtro de la pantalla. */
export async function contarGrupos() {
  const { rows } = await query(`SELECT estado, count(*)::int AS n FROM solicitudes GROUP BY estado`);
  const por = Object.fromEntries(rows.map(f => [f.estado, f.n]));
  const suma = estados => estados.reduce((t, e) => t + (por[e] || 0), 0);
  return {
    todas: suma(["pendiente", "cotizada", "confirmada", "asignada", "rechazada"]),
    pendientes: suma(GRUPOS.pendientes), porConfirmar: suma(GRUPOS["por-confirmar"]),
    aceptadas: suma(GRUPOS.aceptadas), rechazadas: suma(GRUPOS.rechazadas)
  };
}

/** Cuántas hay en cada estado abierto (para la campanita). */
export async function contarAbiertas() {
  const { rows } = await query(
    `SELECT estado, count(*)::int AS n FROM solicitudes WHERE estado IN ('pendiente', 'cotizada', 'confirmada') GROUP BY estado`
  );
  const c = { pendiente: 0, cotizada: 0, confirmada: 0 };
  for (const f of rows) c[f.estado] = f.n;
  return c;
}

/** Las solicitudes de un cliente, para su portal ("Mis solicitudes"). Solo las ligadas a su ficha (cliente_id lo pone
    el servidor desde la sesión) y solo los campos que le sirven: nada de quién la revisó ni datos internos.
    `pedidoEstado` es el estado de la guía que salió de la solicitud, si ya se asignó.
    Con `sinTotal` no consulta el total: trae una fila extra y responde `hayMas`. */
export async function listarDeCliente(clienteId, { pagina = 1, porPagina = 20, sinTotal = false } = {}) {
  let actual = pagina, total, paginas;
  if (!sinTotal) {
    const { rows: [{ n }] } = await query(`SELECT count(*)::int AS n FROM solicitudes WHERE cliente_id = $1`, [clienteId]);
    total = n;
    paginas = Math.max(1, Math.ceil(n / porPagina));
    actual = Math.min(pagina, paginas);
  }
  const limite = sinTotal ? porPagina + 1 : porPagina;
  const { rows } = await query(
    `SELECT s.id, s.estado, s.origen, s.direccion_recogida, s.paquetes, s.peso_kg, s.destinatario_nombre, s.destinatario_telefono,
       s.direccion_entrega, s.valor, s.motivo_rechazo, s.guia, s.creado, s.actualizado, p.estado AS pedido_estado
     FROM solicitudes s LEFT JOIN pedidos p ON p.guia = s.guia
     WHERE s.cliente_id = $1 ORDER BY s.creado DESC LIMIT $2 OFFSET $3`,
    [clienteId, limite, (actual - 1) * porPagina]
  );
  const hayMas = sinTotal ? rows.length > porPagina : undefined;
  return {
    solicitudes: (hayMas ? rows.slice(0, porPagina) : rows).map(aObjeto),
    pagina: actual,
    porPagina,
    ...(sinTotal ? { hayMas } : { total, paginas })
  };
}

// Columnas que se pueden cambiar. La lista la fija el código, no la petición.
const CAMPOS = ["estado", "valor", "motivoRechazo", "clienteId", "mensajeroId", "guia", "revisadoPor"];

export async function actualizar(id, datos, db = { query }) {
  const set = armarSet(datos, CAMPOS, 2);
  if (set) await db.query(`UPDATE solicitudes SET ${set.sql}, actualizado = now() WHERE id = $1`, [id, ...set.valores]);
  return buscarPorId(id, db);
}
