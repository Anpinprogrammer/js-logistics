/* Accesos a la app: solo administración. Crear una cuenta manda un enlace de activación por correo. */
import * as Usuario from "../models/usuario.model.js";
import * as Enlace from "../models/enlace.model.js";
import * as Enlaces from "../servicios/enlaces.js";
import * as Auditoria from "../models/auditoria.model.js";
import * as Accesos from "../servicios/usuarios.js";
import * as Mensajero from "../models/mensajero.model.js";
import * as Cliente from "../models/cliente.model.js";
import { hashClave } from "../helpers/claves.js";
import { conflicto, noEncontrado, prohibido, invalido, correoFallo, correoNoConfigurado } from "../helpers/errores.js";
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
  const b = req.valido.body;
  const rol = b.rol || b.role;
  let nombre = b.nombre?.trim() || "", clienteId = b.clienteId || null, mensajeroId = b.mensajeroId || null, ficha = null;

  // La API nueva manda { role, entityId, email }: el nombre sale de la ficha vinculada.
  if (b.entityId) {
    if (rol === "cliente") {
      ficha = await Cliente.buscarPorId(b.entityId);
      if (!ficha) throw noEncontrado("El cliente no existe");
      clienteId = ficha.id; mensajeroId = null; nombre = ficha.nombre;
    } else {
      ficha = await Mensajero.buscarPorId(b.entityId);
      if (!ficha) throw noEncontrado("La persona no existe");
      mensajeroId = ficha.id; clienteId = null; nombre = ficha.nombre;
    }
  }

  // La caja del patinador se lleva sobre su ficha: tiene que ser un patinador de Personal.
  if (rol === "patinador") {
    const f = ficha || (mensajeroId ? await Mensajero.buscarPorId(mensajeroId) : null);
    if (!f || f.tipo !== "patinador") throw invalido("Elige un patinador de Personal (o créalo con el tipo Patinador)", { entityId: "Elige un patinador de Personal" });
  }

  if (await Usuario.buscarPorEmail(b.email)) throw conflicto("Ese correo ya tiene una cuenta", "EMAIL_EN_USO");
  const u = await Usuario.crear({ email: b.email, nombre, rol, clienteId, mensajeroId, claveHash: b.clave ? await hashClave(b.clave) : null });
  await Auditoria.registrar({ uid: req.usuario.id, accion: `Creó el acceso de ${u.email} (${u.rol})`, tabla: "usuarios", registro: u.id });

  // La cuenta ya quedó creada aunque el correo falle: administración puede reenviar la activación.
  const correo = await Enlaces.crearYEnviar({ usuario: u, tipo: "activacion", creadoPor: req.usuario.id });
  // El teléfono sale de su ficha en Personal o del cliente, para ofrecer el envío por WhatsApp.
  const fichaFinal = ficha || (u.mensajeroId ? await Mensajero.buscarPorId(u.mensajeroId) : u.clienteId ? await Cliente.buscarPorId(u.clienteId) : null);
  res.status(201).json({
    message: "Acceso creado correctamente",
    usuario: publico(u),
    user: { ...publico(u), telefono: fichaFinal?.telefono || "", activationUrl: correo.url || "" },
    correo: estadoCorreo(correo)
  });
}

export async function actualizar(req, res) {
  const { id } = req.valido.params, datos = req.valido.body;
  const antes = await Usuario.buscarPorId(id);
  if (!antes) throw noEncontrado("La cuenta no existe");

  // Nadie se cambia su propio rol ni se desactiva a sí mismo (igual que firestore.rules).
  if (id === req.usuario.id && (datos.rol !== undefined && datos.rol !== req.usuario.rol || datos.activo === false))
    throw prohibido("No puedes cambiar tu propio rol ni desactivar tu cuenta");

  // Un patinador siempre va vinculado a una ficha de tipo patinador (ahí vive su caja).
  const rolFinal = datos.rol ?? antes.rol, mensajeroFinal = datos.mensajeroId !== undefined ? datos.mensajeroId : antes.mensajeroId;
  if (rolFinal === "patinador" && (datos.rol !== undefined || datos.mensajeroId !== undefined)) {
    const f = mensajeroFinal ? await Mensajero.buscarPorId(mensajeroFinal) : null;
    if (!f || f.tipo !== "patinador") throw invalido("Un patinador debe estar vinculado a una persona de Personal de tipo Patinador");
  }

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
