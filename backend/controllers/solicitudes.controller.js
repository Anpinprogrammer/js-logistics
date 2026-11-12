/* Solicitudes de envío: el visitante las crea desde la landing (sin sesión), o un cliente con cuenta desde su
   portal (origen 'portal', ligada a su ficha), y la oficina las atiende.
   Flujo: pendiente → (aceptar con valor) cotizada → (el cliente confirma por WhatsApp) confirmada
   → (asignar mensajero) asignada, con su guía (en estado "aceptado", por recoger). En cualquier punto antes de asignar
   se puede rechazar, siempre con la razón: el cliente la ve en su portal (GET /solicitudes/mias). */
import * as Solicitud from "../models/solicitud.model.js";
import * as Pedido from "../models/pedido.model.js";
import * as Mensajero from "../models/mensajero.model.js";
import * as Cliente from "../models/cliente.model.js";
import * as Auditoria from "../models/auditoria.model.js";
import { transaccion } from "../config/db.js";
import { env } from "../config/env.js";
import { HttpError, conflicto, invalido, noEncontrado, prohibido } from "../helpers/errores.js";
import { limpiarTexto } from "../helpers/textoSeguro.js";
import { nuevoId } from "../helpers/ids.js";
import { filaAObjeto } from "../helpers/sql.js";
import { eventos } from "../servicios/eventos.js";

// Texto libre de un visitante: sin caracteres invisibles ni espacios de más.
const limpio = t => limpiarTexto(t).replace(/\s+/g, " ").trim();
const ABIERTAS = ["pendiente", "cotizada", "confirmada"];

/** Formulario público. Responde lo mismo en todos los casos aceptados, sin devolver datos guardados. */
export async function crear(req, res) {
  const b = req.valido.body;
  const recibida = () => res.status(201).json({ solicitud: { recibida: true } });
  if (!env.SOLICITUDES_ACTIVO) {
    throw new HttpError(503, "SOLICITUDES_APAGADAS", "En este momento no recibimos solicitudes por aquí. Escríbenos por WhatsApp.");
  }
  // Un robot llenó el campo trampa: se le responde igual para no darle pistas, pero no se guarda nada.
  if (b.sitio) return recibida();
  const d = {
    nombre: limpio(b.nombre), telefono: limpio(b.telefono), email: b.email,
    direccionRecogida: limpio(b.direccionRecogida), paquetes: b.paquetes, pesoKg: b.pesoKg,
    destinatarioNombre: limpio(b.destinatarioNombre), destinatarioTelefono: limpio(b.destinatarioTelefono),
    direccionEntrega: limpio(b.direccionEntrega)
  };
  if (!d.nombre || !d.direccionRecogida || !d.destinatarioNombre || !d.direccionEntrega) throw invalido("Completa los campos obligatorios");
  if (await Solicitud.hayRepetidaReciente(d)) return recibida(); // doble clic o reintento: ya la tenemos
  // Tope global: si alguien logra saltarse los límites por IP, no llena la base ni la campanita.
  if ((await Solicitud.contarPendientes()) >= env.SOLICITUDES_MAX_PENDIENTES) {
    throw new HttpError(503, "SOLICITUDES_SATURADAS", "Tenemos muchas solicitudes por revisar. Escríbenos por WhatsApp y te atendemos.");
  }
  await Solicitud.crear(d);
  eventos.emitir(["solicitudes"]);
  recibida();
}

// Tope de solicitudes sin revisar por cliente desde el portal: evita que una cuenta llene la campanita.
const MAX_PENDIENTES_CLIENTE = 20;

/** Desde el portal: un cliente con sesión pide un envío. La ficha sale de la sesión (req.usuario.clienteId),
    nunca del cuerpo; así la oficina sabe que es un cliente que ya existe y le propone su domicilio de siempre. */
export async function crearDesdePortal(req, res) {
  const clienteId = req.usuario.clienteId;
  if (!clienteId) throw prohibido("Tu cuenta no está vinculada con un cliente. Escríbenos por WhatsApp.");
  if (!(await Cliente.buscarPorId(clienteId))) throw prohibido("Tu ficha de cliente ya no existe. Escríbenos por WhatsApp.");
  const b = req.valido.body;
  const d = {
    nombre: limpio(b.nombre), telefono: limpio(b.telefono), email: b.email || req.usuario.email || "",
    direccionRecogida: limpio(b.direccionRecogida), paquetes: b.paquetes, pesoKg: b.pesoKg,
    destinatarioNombre: limpio(b.destinatarioNombre), destinatarioTelefono: limpio(b.destinatarioTelefono),
    direccionEntrega: limpio(b.direccionEntrega), origen: "portal", clienteId
  };
  if (!d.nombre || !d.direccionRecogida || !d.destinatarioNombre || !d.direccionEntrega) throw invalido("Completa los campos obligatorios");
  if (await Solicitud.hayRepetidaReciente(d)) return res.status(201).json({ solicitud: { recibida: true } });
  if ((await Solicitud.contarPendientesDeCliente(clienteId)) >= MAX_PENDIENTES_CLIENTE) {
    throw new HttpError(429, "DEMASIADAS_SOLICITUDES", "Tienes muchas solicitudes sin revisar. Espera a que la oficina las atienda o escríbenos por WhatsApp.");
  }
  const s = await Solicitud.crear(d);
  await Auditoria.registrar({ uid: req.usuario.id, accion: `Pidió un envío desde su portal (${d.direccionRecogida} → ${d.direccionEntrega})`, tabla: "solicitudes", registro: s.id });
  eventos.emitir(["solicitudes"]);
  res.status(201).json({ solicitud: { recibida: true } });
}

/** "Mis solicitudes" del portal: solo las del cliente de la sesión, nunca las de otro (el filtro no sale de la petición). */
export async function listarMias(req, res) {
  const clienteId = req.usuario.clienteId;
  if (!clienteId) throw prohibido("Tu cuenta no está vinculada con un cliente. Escríbenos por WhatsApp.");
  const { pagina, porPagina } = req.valido.query;
  res.json(await Solicitud.listarDeCliente(clienteId, { pagina, porPagina }));
}

export async function listar(req, res) {
  const q = req.valido.query;
  if (q.pagina || q.grupo) {
    const pagina = q.pagina || 1;
    const [r, grupos] = await Promise.all([Solicitud.listarPagina({ grupo: q.grupo, pagina, porPagina: q.porPagina }), Solicitud.contarGrupos()]);
    return res.json({ ...r, pagina, porPagina: q.porPagina, grupos });
  }
  const [solicitudes, conteo] = await Promise.all([Solicitud.listar(req.valido.query), Solicitud.contarAbiertas()]);
  res.json({ solicitudes, conteo });
}

export async function obtener(req, res) {
  const s = await Solicitud.buscarPorId(req.valido.params.id);
  if (!s) throw noEncontrado("La solicitud no existe");
  res.json({ solicitud: s });
}

/** Lee y bloquea la solicitud, y exige que esté en uno de los estados permitidos. */
async function bloquearEn(db, id, estados, mensaje) {
  const s = await Solicitud.bloquear(id, db);
  if (!s) throw noEncontrado("La solicitud no existe");
  if (!estados.includes(s.estado)) throw conflicto(mensaje(s), "ESTADO_SOLICITUD");
  return s;
}
const ESTADO_TXT = { pendiente: "pendiente", cotizada: "esperando la confirmación del cliente", confirmada: "confirmada", asignada: "asignada", rechazada: "rechazada" };
const yaEsta = s => `Esta solicitud ya está ${ESTADO_TXT[s.estado]}. Actualiza la lista.`;

/** Aceptar: la oficina pone el valor del domicilio. Se puede cambiar el valor mientras no esté asignada.
    Si la pidió un cliente desde su portal y el valor es el domicilio que ya tiene asignado, no hay nada que consultarle:
    queda confirmada y lista para asignar. Si la oficina propone otro valor, se le pregunta por WhatsApp como siempre. */
export async function aceptar(req, res) {
  const { id } = req.valido.params, { valor } = req.valido.body;
  const s = await transaccion(async db => {
    const antes = await bloquearEn(db, id, ABIERTAS, yaEsta);
    const suTarifa = antes.origen === "portal" && antes.clienteId && antes.clienteTarifa > 0 && valor === antes.clienteTarifa;
    const s = await Solicitud.actualizar(id, { estado: suTarifa ? "confirmada" : "cotizada", valor, revisadoPor: req.usuario.id }, db);
    await Auditoria.registrar({ uid: req.usuario.id, accion: suTarifa
      ? `Aceptó la solicitud de ${antes.nombre} con su domicilio de siempre (${valor})`
      : `Aceptó la solicitud de ${antes.nombre} con domicilio de ${valor}`, tabla: "solicitudes", registro: id }, db);
    return s;
  });
  eventos.emitir(["solicitudes"]);
  res.json({ solicitud: s });
}

/** El cliente respondió por WhatsApp que está de acuerdo con el valor. */
export async function confirmar(req, res) {
  const { id } = req.valido.params;
  const s = await transaccion(async db => {
    const antes = await bloquearEn(db, id, ["cotizada"], s => s.estado === "pendiente" ? "Primero acepta la solicitud y ponle el valor del domicilio." : yaEsta(s));
    const s = await Solicitud.actualizar(id, { estado: "confirmada" }, db);
    await Auditoria.registrar({ uid: req.usuario.id, accion: `Marcó como confirmada por el cliente la solicitud de ${antes.nombre}`, tabla: "solicitudes", registro: id }, db);
    return s;
  });
  eventos.emitir(["solicitudes"]);
  res.json({ solicitud: s });
}

export async function rechazar(req, res) {
  const { id } = req.valido.params, { motivo } = req.valido.body;
  const s = await transaccion(async db => {
    const antes = await bloquearEn(db, id, ABIERTAS, yaEsta);
    const s = await Solicitud.actualizar(id, { estado: "rechazada", motivoRechazo: motivo, revisadoPor: req.usuario.id }, db);
    await Auditoria.registrar({ uid: req.usuario.id, accion: `Rechazó la solicitud de ${antes.nombre}`, tabla: "solicitudes", registro: id }, db);
    return s;
  });
  eventos.emitir(["solicitudes"]);
  res.json({ solicitud: s });
}

/** Asignar a un mensajero: crea la guía (con el domicilio acordado) y, si no se eligió uno, el cliente. */
export async function asignar(req, res) {
  const { id } = req.valido.params, { mensajeroId, clienteId } = req.valido.body;
  const { solicitud, pedido } = await transaccion(async db => {
    const s = await bloquearEn(db, id, ["confirmada"], s => ["pendiente", "cotizada"].includes(s.estado)
      ? "Antes de asignarla, el cliente tiene que confirmar el valor del domicilio." : yaEsta(s));
    const m = await Mensajero.buscarPorId(mensajeroId, db);
    if (!m || !m.activo) throw invalido("El mensajero no existe", [{ campo: "mensajeroId", mensaje: "Elige un mensajero" }]);
    // Si la pidió un cliente desde su portal, el remitente es él (salvo que la oficina elija otro).
    let cid = clienteId || (s.origen === "portal" ? s.clienteId : null);
    if (cid) {
      if (!(await Cliente.buscarPorId(cid, db))) throw invalido("El cliente no existe", [{ campo: "clienteId", mensaje: "Elige un cliente" }]);
    } else {
      const { rows } = await db.query(
        `INSERT INTO clientes (id, nombre, telefono, direccion_recogida, tarifa) VALUES ($1, $2, $3, $4, $5) RETURNING *`,
        [nuevoId(), s.nombre, s.telefono, s.direccionRecogida, s.valor || 0]
      );
      cid = filaAObjeto(rows[0]).id;
      await Auditoria.registrar({ uid: req.usuario.id, accion: `Creó el cliente ${s.nombre} desde una solicitud`, tabla: "clientes", registro: cid }, db);
    }
    // La guía nace "aceptado": el mensajero la ve en "Por recoger" y pasa a en ruta cuando le toma la foto al paquete.
    const pedido = await Pedido.crear({ mensajeroId, clienteId: cid, valorServicio: s.valor || 0, aCobrar: 0, creadoPor: req.usuario.id, estado: "aceptado" }, db);
    const solicitud = await Solicitud.actualizar(id, { estado: "asignada", mensajeroId, clienteId: cid, guia: pedido.guia }, db);
    await Auditoria.registrar({ uid: req.usuario.id, accion: `Asignó la solicitud de ${s.nombre} a ${m.nombre} (guía ${pedido.guia})`, tabla: "solicitudes", registro: id }, db);
    return { solicitud, pedido };
  });
  eventos.emitir(["solicitudes", "pedidos", "clientes"]);
  res.json({ solicitud, pedido });
}
