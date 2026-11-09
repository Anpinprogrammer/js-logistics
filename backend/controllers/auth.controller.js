/* Ingreso, salida, sesión actual y enlaces de correo (activación y cambio de contraseña). */
import * as Usuario from "../models/usuario.model.js";
import * as Enlace from "../models/enlace.model.js";
import * as Enlaces from "../servicios/enlaces.js";
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
  await Enlace.invalidarDeUsuario(u.id); // los enlaces pendientes dejan de servir
  ponerSesion(res, firmarToken(actualizado)); // las demás sesiones se cierran; esta sigue abierta
  res.status(204).end();
}

/**
 * Pide un enlace de contraseña por correo. La respuesta es siempre 204, exista o no la cuenta:
 * así nadie puede usar esta ruta para averiguar qué correos tienen acceso.
 */
export async function recuperar(req, res) {
  const u = await Usuario.buscarParaEnlace(req.valido.body.email);
  if (u?.activo) {
    await Enlaces.crearYEnviar({
      usuario: u,
      // Si la cuenta se creó y nunca se activó, el enlace es de activación; si ya tiene contraseña, de reinicio.
      tipo: u.tieneClave ? "clave" : "activacion",
      origen: "autoservicio"
    });
  }
  res.status(204).end();
}

/** Cambia la contraseña con el token de un correo de recuperación. */
export async function restablecer(req, res) {
  const { token, clave } = req.valido.body;
  await Enlaces.consumir({ token, clave, tipo: "clave" });
  res.status(204).end();
}

/** Crea la contraseña de una cuenta nueva con el token del correo de activación. */
export async function activar(req, res) {
  const { token, clave } = req.valido.body;
  await Enlaces.consumir({ token, clave, tipo: "activacion" });
  res.status(204).end();
}

/** Revisa el enlace antes de mostrar el formulario. Devuelve el correo tapado, no el completo. */
export async function verEnlace(req, res) {
  const e = await Enlaces.leer(req.valido.params.token);
  res.json({
    enlace: {
      tipo: e.tipo,
      nombre: e.nombre,
      email: ocultarCorreo(e.email),
      expira: e.expira
    }
  });
}

const ocultarCorreo = email => {
  const [usuario, dominio] = String(email ?? "").split("@");
  if (!dominio) return "";
  return `${usuario.slice(0, 1)}${"*".repeat(Math.max(3, Math.min(6, usuario.length - 1)))}@${dominio}`;
};
