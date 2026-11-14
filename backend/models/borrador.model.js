/* Borradores de solicitud del asistente (JSBot): lo que el cliente describió, ya validado, esperando su "Confirmar". */
import { randomBytes } from "node:crypto";
import { query } from "../config/db.js";
import { filaAObjeto } from "../helpers/sql.js";

/** Deja un solo borrador vivo por cliente: crear uno nuevo cancela los anteriores sin confirmar. Devuelve { id, vence }. */
export async function crear({ usuarioId, clienteId, datos }, db) {
  await db.query(`UPDATE chatbot_borradores SET estado = 'cancelado' WHERE cliente_id = $1 AND estado = 'pendiente'`, [clienteId]);
  const id = randomBytes(24).toString("base64url");
  const { rows } = await db.query(
    `INSERT INTO chatbot_borradores (id, usuario_id, cliente_id, datos) VALUES ($1, $2, $3, $4) RETURNING id, vence`,
    [id, usuarioId, clienteId, JSON.stringify(datos)]
  );
  return filaAObjeto(rows[0]);
}

/** Cuántos borradores armó este cliente en las últimas horas (confirmados o no): tope contra el abuso. */
export async function contarRecientes(clienteId, horas = 1) {
  const { rows } = await query(
    `SELECT count(*)::int AS n FROM chatbot_borradores WHERE cliente_id = $1 AND creado > now() - make_interval(hours => $2)`,
    [clienteId, horas]
  );
  return rows[0].n;
}

/** Solicitudes que el asistente creó para este cliente en las últimas 24 horas. */
export async function contarSolicitudesDelDia(clienteId) {
  const { rows } = await query(
    `SELECT count(*)::int AS n FROM solicitudes WHERE cliente_id = $1 AND via_chatbot AND creado > now() - interval '24 hours'`,
    [clienteId]
  );
  return rows[0].n;
}

/** Bloquea el borrador SOLO si es de esta cuenta y de este cliente: para cualquier otro es como si no existiera. */
export async function bloquearDeUsuario(id, { usuarioId, clienteId }, db) {
  const { rows } = await db.query(
    `SELECT *, vence < now() AS vencido FROM chatbot_borradores WHERE id = $1 AND usuario_id = $2 AND cliente_id = $3 FOR UPDATE`,
    [id, usuarioId, clienteId]
  );
  return filaAObjeto(rows[0]);
}

export async function marcar(id, estado, solicitudId, db) {
  await db.query(`UPDATE chatbot_borradores SET estado = $2, solicitud_id = $3 WHERE id = $1`, [id, estado, solicitudId ?? null]);
}
