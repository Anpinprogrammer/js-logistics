/* Cuentas de la app (reemplaza usuarios, admins y vinculos de Firestore). */
import { query } from "../config/db.js";
import { filaAObjeto, armarSet } from "../helpers/sql.js";
import { nuevoId } from "../helpers/ids.js";

// Nunca se devuelve clave_hash fuera del modelo, salvo en buscarParaIngreso.
const COLUMNAS = `id, email, nombre, rol, cliente_id, mensajero_id, activo, version_sesion, ultimo_ingreso, creado, actualizado, status`;

export async function buscarPorId(id, db = { query }) {
  const { rows } = await db.query(`SELECT ${COLUMNAS} FROM usuarios WHERE id = $1`, [id]);
  return filaAObjeto(rows[0]);
}

export async function buscarPorEmail(email, db = { query }) {
  const { rows } = await db.query(`SELECT ${COLUMNAS} FROM usuarios WHERE lower(email) = lower($1)`, [email]);
  return filaAObjeto(rows[0]);
}

/** Incluye el hash de la contraseña: solo para el login. */
export async function buscarParaIngreso(email) {
  const { rows } = await query(`SELECT ${COLUMNAS}, clave_hash FROM usuarios WHERE lower(email) = lower($1)`, [email]);
  return filaAObjeto(rows[0]);
}

/** Bloquea la cuenta al verificar la contraseña antes de cambiar su correo. El hash nunca sale de aquí a la API. */
export async function bloquearParaPerfil(id, db) {
  const { rows } = await db.query(`SELECT id, email, clave_hash FROM usuarios WHERE id = $1 FOR UPDATE`, [id]);
  return filaAObjeto(rows[0]);
}

export async function actualizarEmail(id, email, db = { query }) {
  const { rows } = await db.query(
    `UPDATE usuarios SET email = $2, actualizado = now() WHERE id = $1 RETURNING ${COLUMNAS}`,
    [id, email]
  );
  return filaAObjeto(rows[0]);
}

/** Para pedir un enlace: dice si la cuenta ya tiene contraseña (si no, el enlace es de activación). */
export async function buscarParaEnlace(email) {
  const { rows } = await query(
    `SELECT ${COLUMNAS}, (clave_hash IS NOT NULL) AS tiene_clave
       FROM usuarios WHERE lower(email) = lower($1)`,
    [email]
  );
  return filaAObjeto(rows[0]);
}

/** Igual que buscarParaEnlace pero por id: dice si la cuenta ya tiene contraseña. */
export async function buscarParaEnlacePorId(id) {
  const { rows } = await query(
    `SELECT ${COLUMNAS}, (clave_hash IS NOT NULL) AS tiene_clave
       FROM usuarios WHERE id = $1`,
    [id]
  );
  return filaAObjeto(rows[0]);
}

export async function listar() {
  const { rows } = await query(`SELECT ${COLUMNAS} FROM usuarios ORDER BY lower(nombre), lower(email)`);
  return rows.map(filaAObjeto);
}

export async function crear({ email, nombre = "", rol, claveHash = null, clienteId = null, mensajeroId = null }, db = { query }) {
  const { rows } = await db.query(
    `INSERT INTO usuarios (id, email, nombre, rol, clave_hash, cliente_id, mensajero_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING ${COLUMNAS}`,
    [nuevoId(20), email.trim().toLowerCase(), nombre.trim(), rol, claveHash, clienteId, mensajeroId]
  );
  return filaAObjeto(rows[0]);
}

const EDITABLES = ["nombre", "rol", "clienteId", "mensajeroId", "activo"];

/** Cambia datos de la cuenta. Si cambia el rol o se desactiva, se cierran sus sesiones abiertas. */
export async function actualizar(id, datos) {
  const set = armarSet(datos, EDITABLES, 2);
  if (!set) return buscarPorId(id);
  const cierraSesiones = datos.rol !== undefined || datos.activo === false;
  const { rows } = await query(
    `UPDATE usuarios SET ${set.sql}, actualizado = now()${cierraSesiones ? ", version_sesion = version_sesion + 1" : ""}
     WHERE id = $1 RETURNING ${COLUMNAS}`,
    [id, ...set.valores]
  );
  return filaAObjeto(rows[0]);
}

/** Nueva contraseña; cierra todas las sesiones abiertas de la cuenta. */
export async function cambiarClave(id, claveHash, db = { query }) {
  const { rows } = await db.query(
    `UPDATE usuarios SET clave_hash = $2, version_sesion = version_sesion + 1, actualizado = now()
     WHERE id = $1 RETURNING ${COLUMNAS}`,
    [id, claveHash]
  );
  return filaAObjeto(rows[0]);
}

/** Cierra todas las sesiones de la cuenta (el JWT guardado deja de servir). */
export async function cerrarSesiones(id) {
  await query(`UPDATE usuarios SET version_sesion = version_sesion + 1 WHERE id = $1`, [id]);
}

export async function marcarIngreso(id) {
  await query(`UPDATE usuarios SET ultimo_ingreso = now() WHERE id = $1`, [id]);
}

export async function eliminar(id) {
  const { rowCount } = await query(`DELETE FROM usuarios WHERE id = $1`, [id]);
  return rowCount > 0;
}
