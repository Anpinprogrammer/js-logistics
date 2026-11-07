/* Pedidos. Reglas tomadas de firestore.rules y de la app:
   - Oficina (admin y asistente) ve y organiza todos; borrar solo administración.
   - El mensajero crea guías a su nombre y en cero, entrega o devuelve las suyas pendientes,
     y corrige algunos datos durante 24 horas.
   - El cliente solo ve sus pedidos y confirma que recibió una prenda de cambio. */
import * as Pedido from "../models/pedido.model.js";
import * as Cliente from "../models/cliente.model.js";
import * as Mensajero from "../models/mensajero.model.js";
import * as Auditoria from "../models/auditoria.model.js";
import { transaccion } from "../config/db.js";
import { noEncontrado, prohibido, conflicto, invalido } from "../helpers/errores.js";
import { diferenciaCobro, VENTANA_CORRECCION_MS } from "../helpers/negocio.js";
import { esOficina, esAdmin } from "../middleware/autorizar.js";

const pesos = v => "$ " + Number(v || 0).toLocaleString("es-CO");

/** ¿Puede esta cuenta ver el pedido? */
const puedeVer = (u, p) =>
  esOficina(u) || (u.rol === "mensajero" && u.mensajeroId && p.mensajeroId === u.mensajeroId)
  || (u.rol === "cliente" && u.clienteId && p.clienteId === u.clienteId);

const esMio = (u, p) => u.rol === "mensajero" && !!u.mensajeroId && p.mensajeroId === u.mensajeroId;

export async function listar(req, res) {
  const filtros = { ...req.valido.query };
  const u = req.usuario;
  // Cada rol ve solo lo suyo: el filtro lo pone el servidor, no la petición.
  if (u.rol === "mensajero") {
    if (!u.mensajeroId) throw prohibido("Tu cuenta no está vinculada con tu nombre en Personal");
    filtros.mensajeroId = u.mensajeroId;
  } else if (u.rol === "cliente") {
    if (!u.clienteId) throw prohibido("Tu cuenta no está vinculada con un cliente");
    filtros.clienteId = u.clienteId;
  }
  const pedidos = await Pedido.listar(filtros);
  const siguiente = pedidos.length === filtros.limite ? pedidos[pedidos.length - 1].n : null;
  res.json({ pedidos, siguiente });
}

export async function obtener(req, res) {
  const p = await Pedido.buscarPorGuia(req.valido.params.guia);
  if (!p || !puedeVer(req.usuario, p)) throw noEncontrado("La guía no existe"); // no se dice si existe a quien no la puede ver
  res.json({ pedido: p });
}

export async function crear(req, res) {
  const u = req.usuario, b = req.valido.body;
  let datos;
  if (u.rol === "mensajero") {
    if (!u.mensajeroId) throw prohibido("Tu cuenta no está vinculada con tu nombre en Personal");
    datos = { mensajeroId: u.mensajeroId, clienteId: null, valorServicio: 0, aCobrar: 0 }; // los valores los pone la oficina
  } else {
    if (!b.mensajeroId) throw invalido("Elige el mensajero", [{ campo: "mensajeroId", mensaje: "Obligatorio" }]);
    if (!(await Mensajero.buscarPorId(b.mensajeroId))) throw invalido("El mensajero no existe");
    if (b.clienteId && !(await Cliente.buscarPorId(b.clienteId))) throw invalido("El cliente no existe");
    datos = { mensajeroId: b.mensajeroId, clienteId: b.clienteId ?? null, valorServicio: b.valorServicio, aCobrar: b.aCobrar };
  }
  const p = await Pedido.crear({ ...datos, creadoPor: u.id });
  await Auditoria.registrar({ uid: u.id, accion: `Creó la guía ${p.guia}`, tabla: "pedidos", registro: p.guia });
  res.status(201).json({ pedido: p });
}

/** Lo que organiza la oficina: remitente, valores, mensajero, domicilio pagado. */
export async function actualizar(req, res) {
  const { guia } = req.valido.params, b = { ...req.valido.body }, u = req.usuario;
  const p = await transaccion(async db => {
    const actual = await Pedido.bloquear(guia, db);
    if (!actual) throw noEncontrado("La guía no existe");

    // Corregir lo cobrado es solo de administración, y la diferencia se recalcula igual que al entregar.
    const corrigeCobro = b.valorCobrado !== undefined || b.metodo !== undefined;
    if (corrigeCobro && !esAdmin(u)) throw prohibido("Solo administración corrige lo cobrado");
    if (corrigeCobro && actual.estado !== "entregado") throw conflicto("Solo se corrige lo cobrado de una guía entregada");
    // Si cambia lo cobrado o lo que debía cobrar de una guía entregada, la diferencia se vuelve a calcular.
    if (actual.estado === "entregado" && (corrigeCobro || b.aCobrar !== undefined)) {
      const metodo = b.metodo ?? actual.metodo, valorCobrado = b.valorCobrado ?? actual.valorCobrado;
      const aCobrar = b.aCobrar ?? actual.aCobrar;
      const dif = diferenciaCobro({ aCobrar, valorCobrado, metodo });
      Object.assign(b, { metodo, valorCobrado, difCobro: dif, cuentaJs: metodo === "transf_js" ? (b.cuentaJs ?? actual.cuentaJs) : "" });
      if (b.metodo === "transf_js" && !b.cuentaJs) throw invalido("Elige a qué cuenta llegó la transferencia");
      if (dif !== Number(actual.difCobro)) b.difRevisada = false;
    }
    if (b.domiPagado === true && !actual.domiPagado) Object.assign(b, { domiPagoFecha: new Date(), domiPagoUid: u.id });
    if (b.domiPagado === false) Object.assign(b, { domiPagoMedio: null, domiPagoValor: null, domiPagoFecha: null, domiPagoUid: null });
    if (b.clienteId && !(await Cliente.buscarPorId(b.clienteId, db))) throw invalido("El cliente no existe");
    if (b.mensajeroId && !(await Mensajero.buscarPorId(b.mensajeroId, db))) throw invalido("El mensajero no existe");

    const nuevo = await Pedido.actualizar(guia, b, db);
    await Auditoria.registrar({ uid: u.id, accion: `Editó la guía ${guia}`, tabla: "pedidos", registro: guia, datos: req.valido.body }, db);
    return nuevo;
  });
  res.json({ pedido: p });
}

/** El mensajero (o la oficina) registra la entrega de una guía pendiente. */
export async function entregar(req, res) {
  const { guia } = req.valido.params, b = req.valido.body, u = req.usuario;
  const p = await transaccion(async db => {
    const actual = await Pedido.bloquear(guia, db);
    if (!actual || !(esOficina(u) || esMio(u, actual))) throw noEncontrado("La guía no existe");
    if (actual.estado !== "pendiente") throw conflicto("La guía ya está cerrada", "YA_CERRADA");
    const difCobro = diferenciaCobro({ aCobrar: actual.aCobrar, valorCobrado: b.valorCobrado, metodo: b.metodo });
    const nuevo = await Pedido.actualizar(guia, {
      estado: "entregado", entregado: new Date(), destinatario: b.destinatario, valorCobrado: b.valorCobrado,
      metodo: b.metodo, cuentaJs: b.metodo === "transf_js" ? b.cuentaJs : "", difCobro, difRevisada: false,
      entregoUid: u.id, cambio: b.cambio, gasto: b.gasto, gastoNota: b.gasto > 0 ? b.gastoNota : ""
    }, db);
    await Auditoria.registrar({
      uid: u.id, tabla: "pedidos", registro: guia,
      accion: `Entregó ${guia}: cobró ${pesos(b.valorCobrado)} (${b.metodo})${difCobro ? " · diferencia " + pesos(difCobro) : ""}`
    }, db);
    return nuevo;
  });
  res.json({ pedido: p });
}

/** No se pudo entregar: "reprogramar" deja la guía en ruta y anota el intento; los demás motivos la devuelven. */
export async function noEntregado(req, res) {
  const { guia } = req.valido.params, { motivo, nota } = req.valido.body, u = req.usuario;
  const p = await transaccion(async db => {
    const actual = await Pedido.bloquear(guia, db);
    if (!actual || !(esOficina(u) || esMio(u, actual))) throw noEncontrado("La guía no existe");
    if (actual.estado !== "pendiente") throw conflicto("La guía ya está cerrada", "YA_CERRADA");
    await Pedido.agregarIntento(guia, { motivo, nota, por: u.id }, db);
    if (motivo === "reprogramar") {
      await Auditoria.registrar({ uid: u.id, accion: `Intento fallido en ${guia}: reprogramar${nota ? " · " + nota : ""}`, tabla: "pedidos", registro: guia }, db);
      return Pedido.buscarPorGuia(guia, db);
    }
    const nuevo = await Pedido.actualizar(guia, {
      estado: "devuelto", entregado: new Date(), motivoDev: motivo, notaDev: nota, valorCobrado: 0, metodo: "devuelto",
      cuentaJs: "", difCobro: 0, destinatario: "", cobrarDev: true, entregoUid: u.id
    }, db);
    await Auditoria.registrar({ uid: u.id, accion: `Devolución de ${guia}: ${motivo}${nota ? " · " + nota : ""}`, tabla: "pedidos", registro: guia }, db);
    return nuevo;
  });
  res.json({ pedido: p });
}

/** El mensajero corrige lo que registró, solo durante 24 horas. No cambia el estado ni la hora. */
export async function corregir(req, res) {
  const { guia } = req.valido.params, b = { ...req.valido.body }, u = req.usuario;
  const p = await transaccion(async db => {
    const actual = await Pedido.bloquear(guia, db);
    if (!actual || !esMio(u, actual)) throw noEncontrado("La guía no existe");
    if (actual.estado === "pendiente") throw conflicto("La guía todavía no está cerrada");
    if (Date.now() - new Date(actual.entregado).getTime() > VENTANA_CORRECCION_MS)
      throw prohibido("Ya pasaron 24 horas: pídele a administración que lo corrija");
    if (actual.estado === "devuelto") {
      // En una devolución solo se corrige el motivo, la nota, el flete y la prenda de cambio.
      for (const k of ["destinatario", "valorCobrado", "metodo", "cuentaJs"]) delete b[k];
    } else {
      delete b.motivoDev; delete b.notaDev;
      const metodo = b.metodo ?? actual.metodo, valorCobrado = b.valorCobrado ?? actual.valorCobrado;
      const cuentaJs = metodo === "transf_js" ? (b.cuentaJs ?? actual.cuentaJs) : "";
      if (metodo === "transf_js" && !cuentaJs) throw invalido("Elige a qué cuenta llegó la transferencia");
      const difCobro = diferenciaCobro({ aCobrar: actual.aCobrar, valorCobrado, metodo });
      Object.assign(b, { metodo, valorCobrado, cuentaJs, difCobro });
      if (difCobro !== Number(actual.difCobro)) b.difRevisada = false;
    }
    const nuevo = await Pedido.actualizar(guia, b, db);
    await Auditoria.registrar({ uid: u.id, accion: `Corrigió la guía ${guia}`, tabla: "pedidos", registro: guia, datos: req.valido.body }, db);
    return nuevo;
  });
  res.json({ pedido: p });
}

/** El cliente confirma que recibió la prenda de un cambio. */
export async function confirmarCambio(req, res) {
  const { guia } = req.valido.params, u = req.usuario;
  const p = await transaccion(async db => {
    const actual = await Pedido.bloquear(guia, db);
    if (!actual || !(esOficina(u) || (u.rol === "cliente" && actual.clienteId === u.clienteId))) throw noEncontrado("La guía no existe");
    if (!actual.cambio) throw conflicto("Esta guía no tiene una prenda de cambio");
    if (actual.cambioRecibido) throw conflicto("El cambio ya se confirmó", "YA_CONFIRMADO");
    const nuevo = await Pedido.actualizar(guia, { cambioRecibido: new Date(), cambioConfirmo: u.id }, db);
    await Auditoria.registrar({ uid: u.id, accion: `Confirmó que recibió el cambio de ${guia}`, tabla: "pedidos", registro: guia }, db);
    return nuevo;
  });
  res.json({ pedido: p });
}

/** Solo administración. Queda copia en la papelera. */
export async function eliminar(req, res) {
  const { guia } = req.valido.params;
  await transaccion(async db => {
    const p = await Pedido.buscarPorGuia(guia, db);
    if (!p) throw noEncontrado("La guía no existe");
    await Auditoria.aPapelera({ tabla: "pedidos", registro: guia, datos: p, grupo: guia, uid: req.usuario.id }, db);
    await Pedido.eliminar(guia, db);
    await Auditoria.registrar({ uid: req.usuario.id, accion: `Borró la guía ${guia}`, tabla: "pedidos", registro: guia }, db);
  });
  res.status(204).end();
}
