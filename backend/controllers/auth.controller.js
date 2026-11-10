/* Ingreso, salida, sesión actual y enlaces de correo (activación y cambio de contraseña). */
import * as Usuario from "../models/usuario.model.js";
import * as Enlace from "../models/enlace.model.js";
import * as Enlaces from "../servicios/enlaces.js";
import * as Auditoria from "../models/auditoria.model.js";
import { encolarCorreosReset } from "../queues/emailQueue.js";
import { compararClave, hashClave } from "../helpers/claves.js";
import { firmarToken } from "../helpers/jwt.js";
import { ponerSesion, quitarSesion } from "../helpers/cookies.js";
import { noAutenticado, invalido, noEncontrado, conflicto, correoNoConfigurado, correoFallo } from "../helpers/errores.js";

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

/**
 * Administración manda el enlace de restablecimiento a una cuenta concreta, por id o por correo.
 * Usa el mismo token de un solo uso (guardado como hash en `enlaces`) que el resto de correos.
 */
export async function enviarReset(req, res) {
  const { usuarioId, email } = req.valido.body;
  const u = usuarioId ? await Usuario.buscarParaEnlacePorId(usuarioId) : await Usuario.buscarParaEnlace(email);
  if (!u) throw noEncontrado("La cuenta no existe");
  if (!u.activo) throw conflicto("Activa la cuenta primero", "CUENTA_INACTIVA");
  const correo = await Enlaces.crearYEnviar({ usuario: u, tipo: u.tieneClave ? "clave" : "activacion", origen: "admin", creadoPor: req.usuario.id });
  if (!correo.enviado) {
    if (correo.motivo === "SIN_CONFIGURAR") throw correoNoConfigurado();
    throw correoFallo();
  }
  await Auditoria.registrar({ uid: req.usuario.id, accion: `Envió el enlace de contraseña a ${u.email}`, tabla: "usuarios", registro: u.id });
  res.json({ enviado: true, email: u.email });
}

/** Administración: encola el envío masivo y responde de inmediato (el worker manda los correos). */
export async function enviarResetsMasivo(req, res) {
  const { emails } = req.valido.body;
  const r = await encolarCorreosReset({ emails, porUid: req.usuario.id });
  await Auditoria.registrar({ uid: req.usuario.id, accion: `Encoló el restablecimiento de contraseña para ${emails.length} cuentas`, tabla: "usuarios" });
  res.status(202).json({
    mensaje: `Procesando el envío masivo de ${r.total} correos en segundo plano.`,
    total: r.total,
    modo: r.modo
  });
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
