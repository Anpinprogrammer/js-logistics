/* Solicitudes de envío que llegan del formulario público de la landing. */
import { query } from "../config/db.js";
import { filaAObjeto, armarSet } from "../helpers/sql.js";
import { nuevoId } from "../helpers/ids.js";

// NUMERIC llega como texto desde pg: el peso se devuelve como número (o null).
const aObjeto = fila => {
  const o = filaAObjeto(fila);
  if (o) o.pesoKg = o.pesoKg == null ? null : Number(o.pesoKg);
  return o;
};

const CON_NOMBRES = `
  SELECT s.*, m.nombre AS mensajero_nombre, c.nombre AS cliente_nombre
  FROM solicitudes s
  LEFT JOIN mensajeros m ON m.id = s.mensajero_id
  LEFT JOIN clientes c ON c.id = s.cliente_id`;

export async function crear(d) {
  const { rows } = await query(
    `INSERT INTO solicitudes (id, nombre, telefono, email, direccion_recogida, paquetes, peso_kg,
       destinatario_nombre, destinatario_telefono, direccion_entrega)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING *`,
    [nuevoId(), d.nombre, d.telefono, d.email, d.direccionRecogida, d.paquetes, d.pesoKg ?? null,
      d.destinatarioNombre, d.destinatarioTelefono || "", d.direccionEntrega]
  );
  return aObjeto(rows[0]);
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

/** Bloquea la fila hasta el fin de la transacción. */
export async function bloquear(id, db) {
  const { rows } = await db.query(`SELECT * FROM solicitudes WHERE id = $1 FOR UPDATE`, [id]);
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

/** Cuántas hay en cada estado abierto (para la campanita). */
export async function contarAbiertas() {
  const { rows } = await query(
    `SELECT estado, count(*)::int AS n FROM solicitudes WHERE estado IN ('pendiente', 'cotizada', 'confirmada') GROUP BY estado`
  );
  const c = { pendiente: 0, cotizada: 0, confirmada: 0 };
  for (const f of rows) c[f.estado] = f.n;
  return c;
}

// Columnas que se pueden cambiar. La lista la fija el código, no la petición.
const CAMPOS = ["estado", "valor", "motivoRechazo", "clienteId", "mensajeroId", "guia", "revisadoPor"];

export async function actualizar(id, datos, db = { query }) {
  const set = armarSet(datos, CAMPOS, 2);
  if (set) await db.query(`UPDATE solicitudes SET ${set.sql}, actualizado = now() WHERE id = $1`, [id, ...set.valores]);
  return buscarPorId(id, db);
}
