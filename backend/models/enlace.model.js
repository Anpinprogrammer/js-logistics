/* Enlaces de un solo uso que se mandan por correo (activar la cuenta y reiniciar la contraseña).
   El token en claro nunca se guarda: en la base queda solo su hash SHA-256. */
import { query } from "../config/db.js";
import { filaAObjeto } from "../helpers/sql.js";
import { nuevoId } from "../helpers/ids.js";

const COLUMNAS = `id, usuario_id, tipo, token_hash, expira, usado, creado, creado_por`;

/**
 * Crea el enlace y anula los anteriores sin usar del mismo tipo. Antes limpia los vencidos y los ya usados
 * de esa cuenta: así la tabla no crece con cada solicitud.
 */
export async function crear({ usuarioId, tipo, tokenHash, expira, creadoPor = null }, db = { query }) {
  await db.query(
    `DELETE FROM enlaces WHERE usuario_id = $1 AND (usado IS NOT NULL OR expira < now())`,
    [usuarioId]
  );
  await db.query(
    `UPDATE enlaces SET usado = now() WHERE usuario_id = $1 AND tipo = $2 AND usado IS NULL`,
    [usuarioId, tipo]
  );
  const { rows } = await db.query(
    `INSERT INTO enlaces (id, usuario_id, tipo, token_hash, expira, creado_por)
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING ${COLUMNAS}`,
    [nuevoId(20), usuarioId, tipo, tokenHash, expira, creadoPor]
  );
  return filaAObjeto(rows[0]);
}

/**
 * Busca el enlace por el hash del token y trae los datos de la cuenta.
 * Con `bloquear` la fila queda fija hasta que termine la transacción (para que dos usos simultáneos no sirvan).
 */
export async function buscarPorToken(tokenHash, { bloquear = false, db = { query } } = {}) {
  const { rows } = await db.query(
    `SELECT e.id, e.usuario_id, e.tipo, e.expira, e.usado,
            u.email, u.nombre, u.rol, u.activo, u.cliente_id, u.mensajero_id
       FROM enlaces e
       JOIN usuarios u ON u.id = e.usuario_id
      WHERE e.token_hash = $1${bloquear ? " FOR UPDATE OF e" : ""}`,
    [tokenHash]
  );
  return filaAObjeto(rows[0]);
}

export async function marcarUsado(id, db = { query }) {
  await db.query(`UPDATE enlaces SET usado = now() WHERE id = $1`, [id]);
}

/** Anula todos los enlaces pendientes de la cuenta (por ejemplo, al cambiar la contraseña o desactivarla). */
export async function invalidarDeUsuario(usuarioId, db = { query }) {
  await db.query(`UPDATE enlaces SET usado = now() WHERE usuario_id = $1 AND usado IS NULL`, [usuarioId]);
}
