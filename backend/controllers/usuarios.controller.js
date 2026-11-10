/* Accesos a la app: solo administración. Crear una cuenta manda un enlace de activación por correo. */
import * as Usuario from "../models/usuario.model.js";
import * as Enlace from "../models/enlace.model.js";
import * as Enlaces from "../servicios/enlaces.js";
import * as Auditoria from "../models/auditoria.model.js";
import * as Accesos from "../servicios/usuarios.js";
import { hashClave } from "../helpers/claves.js";
import { conflicto, noEncontrado, prohibido, correoFallo, correoNoConfigurado } from "../helpers/errores.js";
import { publico } from "./auth.controller.js";
import { responder } from "./accion.js";

const estadoCorreo = r => (r.enviado ? { enviado: true } : { enviado: false, motivo: r.motivo });

/** En las acciones que solo existen para mandar el correo, un fallo sí se le muestra a administración. */
function correoObligatorio(r) {
  if (r.enviado) return { enviado: true };
  if (r.motivo === "SIN_CONFIGURAR") throw correoNoConfigurado();
  throw correoFallo();
}

const paraLista = u => ({ ...publico(u), activo: u.activo, ultimoIngreso: u.ultimoIngreso });

export async function listar(_req, res) {
  const usuarios = await Usuario.listar();
  res.json({ usuarios: usuarios.map(paraLista) });
}

/** GET /usuarios/pagina: la misma lista, por páginas (5 en celular y 10 en computador). */
export const listarPagina = responder(async (ctx, req) => {
  const p = await Accesos.paginaAccesos(ctx, req.valido.query);
  return { ...p, usuarios: p.usuarios.map(paraLista) };
});

export async function crear(req, res) {
  const { clave, ...datos } = req.valido.body;
  if (await Usuario.buscarPorEmail(datos.email)) throw conflicto("Ese correo ya tiene una cuenta", "EMAIL_EN_USO");
  const u = await Usuario.crear({ ...datos, claveHash: clave ? await hashClave(clave) : null });
  await Auditoria.registrar({ uid: req.usuario.id, accion: `Creó el acceso de ${u.email} (${u.rol})`, tabla: "usuarios", registro: u.id });

  // La cuenta ya quedó creada aunque el correo falle: administración puede reenviar la activación.
  const correo = await Enlaces.crearYEnviar({ usuario: u, tipo: "activacion", creadoPor: req.usuario.id });
  res.status(201).json({ usuario: publico(u), correo: estadoCorreo(correo) });
}

export async function actualizar(req, res) {
  const { id } = req.valido.params, datos = req.valido.body;
  const antes = await Usuario.buscarPorId(id);
  if (!antes) throw noEncontrado("La cuenta no existe");

  // Nadie se cambia su propio rol ni se desactiva a sí mismo (igual que firestore.rules).
  if (id === req.usuario.id && (datos.rol !== undefined && datos.rol !== req.usuario.rol || datos.activo === false))
    throw prohibido("No puedes cambiar tu propio rol ni desactivar tu cuenta");

  const u = await Usuario.actualizar(id, datos);
  if (!u) throw noEncontrado("La cuenta no existe");

  // Desactivar anula los enlaces pendientes; reactivar manda uno nuevo para que pueda entrar.
  if (antes.activo && !u.activo) await Enlace.invalidarDeUsuario(id);
  if (datos.rol !== undefined && datos.rol !== antes.rol) await Enlace.invalidarDeUsuario(id);

  let correo;
  if (!antes.activo && u.activo) {
    correo = estadoCorreo(await Enlaces.crearYEnviar({ usuario: u, tipo: "activacion", creadoPor: req.usuario.id }));
  }

  await Auditoria.registrar({ uid: req.usuario.id, accion: `Cambió el acceso de ${u.email}`, tabla: "usuarios", registro: id, datos });
  res.json({ usuario: publico(u), ...(correo ? { correo } : {}) });
}

/** Reenvía el enlace para que la persona cree su contraseña (cuenta nueva o correo que no llegó). */
export async function reenviarActivacion(req, res) {
  const { id } = req.valido.params;
  const u = await Usuario.buscarPorId(id);
  if (!u) throw noEncontrado("La cuenta no existe");
  if (!u.activo) throw conflicto("Activa la cuenta primero", "CUENTA_INACTIVA");
  const correo = correoObligatorio(await Enlaces.crearYEnviar({ usuario: u, tipo: "activacion", creadoPor: req.usuario.id }));
  await Auditoria.registrar({ uid: req.usuario.id, accion: `Reenvió la activación a ${u.email}`, tabla: "usuarios", registro: id });
  res.json({ correo });
}

/** Manda un enlace para que la persona cambie su contraseña sin que administración la vea. */
export async function enviarRecuperacion(req, res) {
  const { id } = req.valido.params;
  const u = await Usuario.buscarPorId(id);
  if (!u) throw noEncontrado("La cuenta no existe");
  if (!u.activo) throw conflicto("Activa la cuenta primero", "CUENTA_INACTIVA");
  const correo = correoObligatorio(await Enlaces.crearYEnviar({ usuario: u, tipo: "clave", creadoPor: req.usuario.id, origen: "admin" }));
  await Auditoria.registrar({ uid: req.usuario.id, accion: `Envió el enlace de contraseña a ${u.email}`, tabla: "usuarios", registro: id });
  res.json({ correo });
}

export async function cambiarClave(req, res) {
  const { id } = req.valido.params;
  const u = await Usuario.cambiarClave(id, await hashClave(req.valido.body.clave));
  if (!u) throw noEncontrado("La cuenta no existe");
  await Enlace.invalidarDeUsuario(id); // los enlaces pendientes dejan de servir
  await Auditoria.registrar({ uid: req.usuario.id, accion: `Cambió la contraseña de ${u.email}`, tabla: "usuarios", registro: id });
  res.status(204).end();
}

export async function eliminar(req, res) {
  const { id } = req.valido.params;
  if (id === req.usuario.id) throw prohibido("No puedes quitar tu propio acceso");
  const u = await Usuario.buscarPorId(id);
  if (!u) throw noEncontrado("La cuenta no existe");
  await Usuario.eliminar(id);
  await Auditoria.registrar({ uid: req.usuario.id, accion: `Quitó el acceso de ${u.email}`, tabla: "usuarios", registro: id });
  res.status(204).end();
}
