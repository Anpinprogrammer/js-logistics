/* Ingreso, salida y sesión actual. */
import * as Usuario from "../models/usuario.model.js";
import { compararClave, hashClave } from "../helpers/claves.js";
import { firmarToken } from "../helpers/jwt.js";
import { ponerSesion, quitarSesion } from "../helpers/cookies.js";
import { noAutenticado, invalido } from "../helpers/errores.js";

/** Lo que el frontend necesita saber de la cuenta (nunca el hash ni la versión de sesión). */
export const publico = u => ({
  id: u.id,
  email: u.email,
  nombre: u.nombre,
  rol: u.rol,
  clienteId: u.clienteId ?? null,
  mensajeroId: u.mensajeroId ?? null
});

export async function ingresar(req, res) {
  const { email, clave } = req.valido.body;
  const u = await Usuario.buscarParaIngreso(email);
  // Siempre se compara (aunque no exista la cuenta) y el mensaje es el mismo: no se delata qué correos existen.
  const ok = await compararClave(clave, u?.claveHash);
  if (!u || !ok || !u.activo || !u.claveHash) throw noAutenticado("Correo o contraseña incorrectos");

  ponerSesion(res, firmarToken(u));
  await Usuario.marcarIngreso(u.id);
  res.json({ usuario: publico(u) });
}

export function salir(_req, res) {
  quitarSesion(res);
  res.status(204).end();
}

/** Cierra la sesión en todos los dispositivos. */
export async function salirDeTodo(req, res) {
  await Usuario.cerrarSesiones(req.usuario.id);
  quitarSesion(res);
  res.status(204).end();
}

export function yo(req, res) {
  res.json({ usuario: publico(req.usuario) });
}

export async function cambiarMiClave(req, res) {
  const { claveActual, claveNueva } = req.valido.body;
  const u = await Usuario.buscarParaIngreso(req.usuario.email);
  if (!(await compararClave(claveActual, u?.claveHash))) throw invalido("La contraseña actual no es correcta");
  const actualizado = await Usuario.cambiarClave(u.id, await hashClave(claveNueva));
  ponerSesion(res, firmarToken(actualizado)); // las demás sesiones se cierran; esta sigue abierta
  res.status(204).end();
}
