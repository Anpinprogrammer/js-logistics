/* Accesos a la app: solo administración. */
import * as Usuario from "../models/usuario.model.js";
import * as Auditoria from "../models/auditoria.model.js";
import { hashClave } from "../helpers/claves.js";
import { conflicto, noEncontrado, prohibido } from "../helpers/errores.js";
import { publico } from "./auth.controller.js";

export async function listar(_req, res) {
  const usuarios = await Usuario.listar();
  res.json({ usuarios: usuarios.map(u => ({ ...publico(u), activo: u.activo, ultimoIngreso: u.ultimoIngreso })) });
}

export async function crear(req, res) {
  const { clave, ...datos } = req.valido.body;
  if (await Usuario.buscarPorEmail(datos.email)) throw conflicto("Ese correo ya tiene una cuenta", "EMAIL_EN_USO");
  const u = await Usuario.crear({ ...datos, claveHash: await hashClave(clave) });
  await Auditoria.registrar({ uid: req.usuario.id, accion: `Creó el acceso de ${u.email} (${u.rol})`, tabla: "usuarios", registro: u.id });
  res.status(201).json({ usuario: publico(u) });
}

export async function actualizar(req, res) {
  const { id } = req.valido.params, datos = req.valido.body;
  // Nadie se cambia su propio rol ni se desactiva a sí mismo (igual que firestore.rules).
  if (id === req.usuario.id && (datos.rol !== undefined && datos.rol !== req.usuario.rol || datos.activo === false))
    throw prohibido("No puedes cambiar tu propio rol ni desactivar tu cuenta");
  const u = await Usuario.actualizar(id, datos);
  if (!u) throw noEncontrado("La cuenta no existe");
  await Auditoria.registrar({ uid: req.usuario.id, accion: `Cambió el acceso de ${u.email}`, tabla: "usuarios", registro: id, datos });
  res.json({ usuario: publico(u) });
}

export async function cambiarClave(req, res) {
  const { id } = req.valido.params;
  const u = await Usuario.cambiarClave(id, await hashClave(req.valido.body.clave));
  if (!u) throw noEncontrado("La cuenta no existe");
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
