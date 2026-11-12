/* Pedidos: entregar, devolver, corregir, editar desde la oficina, reabrir, eliminar, pagos del domicilio y pedidos en bloque.
   Cada función replica lo que hace app/js/app.js y lo que permite firestore.rules para cada rol.
   Diferencias con la app (a propósito):
   - La hora de la entrega es la del servidor, no la del celular (backend/CLAUDE.md: nada contable con la hora del cliente).
   - Las fotos y la firma se suben aparte (POST /pedidos/:guia/archivos/:tipo) antes de confirmar la entrega. */
import { Pedidos, Clientes, Mensajeros, cargarEstado } from "../models/documentos.js";
import { METODOS, MOTIVOS, CUENTAS_JS, MEDIOS, VENTANA_CORRECCION_MS } from "../helpers/constantes.js";
import { nuevoId } from "../helpers/ids.js";
import { ahora } from "../helpers/reloj.js";
import { pesos } from "../helpers/texto.js";
import { cerrado } from "../helpers/calculos.js";
import { storageConfigurado } from "../helpers/storage.js";
import { datosInvalidos, noEncontrado, permisoNegado, conflicto, yaContadoError } from "./errores.js";
import { enTransaccion, actualizar, borrar } from "./transaccion.js";
import { registrar } from "./historial.js";
import { calculosDe, exigirAdmin, exigirOficina, exigirEquipo, esMio, numero, texto } from "./contexto.js";

const NO_EXISTE = "La guía no existe";

/** Bloquea el pedido para la transacción. A quien no lo puede ver se le dice que no existe (404). */
async function pedidoBloqueado(t, guia, puede = () => true) {
  const p = await Pedidos.obtener(t.c, guia, { bloquear: true });
  if (!p || !puede(p)) throw noEncontrado(NO_EXISTE);
  return p;
}
const delEquipo = a => p => a.esOficina || esMio(a, p.mensajeroId);

/** Lo ya contado en un arqueo no se cambia: ni las transferencias a JS ni los pagos de domicilio de antes del arqueo. */
async function exigirQueNoCambieLoContado(t, antes, despues) {
  const calc = await calculosDe(t.c, ["cajamovs"]);
  if (calc.cambiaLoContado(antes, despues)) throw yaContadoError(calc.textoContado());
}

/** Si el bucket está configurado, la entrega necesita la foto y la firma ya subidas (en la app: "Falta la firma"). */
async function exigirPruebas(t, guia) {
  if (!storageConfigurado()) return;
  const r = await t.c.query(`SELECT array_agg(DISTINCT tipo) AS tipos FROM pedido_archivos WHERE guia = $1 AND tipo IN ('entrega', 'firma')`, [guia]);
  const tipos = r.rows[0]?.tipos || [];
  if (!tipos.includes("firma")) throw datosInvalidos("Falta la firma");
  if (!tipos.includes("entrega")) throw datosInvalidos("Falta la foto de entrega");
}

/** Una guía "aceptado" todavía no se ha recogido: no se puede entregar ni devolver hasta que tenga la foto. */
function exigirEnRuta(p) {
  if (p.estado === "aceptado") throw conflicto("Primero recoge el pedido: pulsa “Recoger” y tómale la foto al paquete.", undefined, "POR_RECOGER");
  if (p.estado !== "pendiente") throw conflicto("Ese pedido ya está " + (p.estado === "devuelto" ? "devuelto" : "entregado") + ".", undefined, "YA_CERRADA");
}

/** Recoger: el mensajero (su guía) o la oficina confirma que tiene el paquete de una guía "aceptado" (creada desde una
    solicitud). Con el bucket configurado exige la foto de salida ya subida. Pasa a "pendiente" (en ruta) y la salida
    (`creado`) queda con la hora de la recogida, que es cuando de verdad sale: así el día del sueldo, "salió hoy" y
    "más de un día en ruta" cuentan desde ahí. La hora en que se asignó queda en el historial y en la solicitud. */
export async function recoger(ctx, guia) {
  const a = ctx.actor;
  exigirEquipo(a);
  return enTransaccion(ctx, async t => {
    const p = await pedidoBloqueado(t, guia, delEquipo(a));
    if (p.estado === "pendiente") throw conflicto("Ese pedido ya está recogido y en ruta.", undefined, "YA_RECOGIDO");
    if (cerrado(p)) throw conflicto("Ese pedido ya está " + (p.estado === "devuelto" ? "devuelto" : "entregado") + ".", undefined, "YA_CERRADA");
    if (storageConfigurado()) {
      const r = await t.c.query(`SELECT 1 FROM pedido_archivos WHERE guia = $1 AND tipo = 'salida' LIMIT 1`, [guia]);
      if (!r.rowCount) throw datosInvalidos("Falta la foto del paquete");
    }
    return actualizar(t, "pedidos", guia, { estado: "pendiente", creado: ahora() }, { antes: p });
  });
}

/** Confirmar entrega: el mensajero (su pedido) o la oficina. La diferencia de cobro la calcula el servidor. */
export async function entregar(ctx, guia, datos) {
  const a = ctx.actor;
  exigirEquipo(a);
  const destinatario = texto(datos.destinatario, 120), metodo = datos.metodo, v = numero(datos.valorCobrado);
  const gasto = numero(datos.gasto) || 0, gastoNota = texto(datos.gastoNota, 200);
  if (!destinatario) throw datosInvalidos("Escribe el nombre de quien recibe");
  if (!Number.isFinite(v) || v < 0) throw datosInvalidos("Escribe el valor cobrado (0 si no cobró)");
  if (!METODOS[metodo]) throw datosInvalidos("Elige el método de pago");
  const cuentaJs = metodo === "transf_js" ? datos.cuentaJs || "" : "";
  if (metodo === "transf_js" && !CUENTAS_JS[cuentaJs]) throw datosInvalidos("Elige a qué cuenta llegó la transferencia");
  if (gasto < 0) throw datosInvalidos("El gasto no puede ser negativo");
  return enTransaccion(ctx, async t => {
    const p = await pedidoBloqueado(t, guia, delEquipo(a));
    exigirEnRuta(p);
    await exigirPruebas(t, guia);
    const aC = Number(p.aCobrar) || 0, dif = aC ? v - (metodo === "transf_cliente" ? 0 : aC) : 0;
    return actualizar(t, "pedidos", guia, {
      estado: "entregado", entregado: ahora(), destinatario, valorCobrado: v, metodo, cuentaJs, difCobro: dif, entregoUid: a.uid,
      ...(datos.cambio ? { cambio: true } : {}), ...(gasto > 0 ? { gasto, gastoNota } : {})
    }, { antes: p });
  });
}

/** No se pudo entregar: "reprogramar" deja la guía en ruta y anota el intento; los demás motivos la devuelven. */
export async function noEntregado(ctx, guia, datos) {
  const a = ctx.actor, motivo = datos.motivo, nota = texto(datos.nota, 300);
  exigirEquipo(a);
  if (!MOTIVOS[motivo]) throw datosInvalidos("Elige qué pasó");
  if (motivo === "otro" && !nota) throw datosInvalidos("Escribe qué pasó");
  return enTransaccion(ctx, async t => {
    const p = await pedidoBloqueado(t, guia, delEquipo(a));
    exigirEnRuta(p);
    const fecha = ahora(), intentos = [...(p.intentos || []), { fecha, motivo, nota, uid: a.uid }];
    if (motivo === "reprogramar") return actualizar(t, "pedidos", guia, { intentos }, { antes: p });
    return actualizar(t, "pedidos", guia, { estado: "devuelto", entregado: fecha, motivoDev: motivo, notaDev: nota, valorCobrado: 0, metodo: "devuelto",
      cuentaJs: "", difCobro: 0, destinatario: "", cobrarDev: true, intentos }, { antes: p });
  });
}

/** El mensajero elige el remitente al recoger (es opcional: si no, lo pone la oficina).
    Solo en su guía, por entregar y sin remitente: cambiar uno ya puesto es de la oficina.
    Si la guía no tiene valor de domicilio, toma la tarifa del cliente, igual que la ficha de la oficina. */
export async function asignarRemitente(ctx, guia, { clienteId }) {
  const a = ctx.actor;
  exigirEquipo(a);
  return enTransaccion(ctx, async t => {
    const p = await pedidoBloqueado(t, guia, x => esMio(a, x.mensajeroId));
    if (p.clienteId === clienteId) return p;
    if (cerrado(p)) throw conflicto("Esa guía ya está cerrada: pídele a administración que ponga el remitente.");
    if (p.clienteId) throw conflicto("Esa guía ya tiene remitente: pídele a administración que lo cambie.");
    const cli = await Clientes.obtener(t.c, clienteId);
    if (!cli) throw datosInvalidos("Ese cliente no existe. Deja la guía sin remitente y administración lo pone.");
    const d = { clienteId: cli.id };
    if (!(Number(p.valorServicio) > 0) && Number(cli.tarifa) > 0) d.valorServicio = Number(cli.tarifa);
    return actualizar(t, "pedidos", guia, d, { antes: p });
  });
}

/** El mensajero corrige lo que registró durante 24 horas (firestore.rules: entregaDeMensajero).
    No cambia el estado, la hora ni el cobro de la devolución. */
export async function corregir(ctx, guia, datos) {
  const a = ctx.actor;
  return enTransaccion(ctx, async t => {
    const p = await pedidoBloqueado(t, guia, x => esMio(a, x.mensajeroId));
    if (!cerrado(p)) throw conflicto("La guía todavía no está cerrada");
    if (ahora() - Number(p.entregado) >= VENTANA_CORRECCION_MS) throw permisoNegado("Ya pasaron 24 horas: pídele a administración que lo corrija");
    const d = {};
    if (datos.gasto !== undefined) { const g = numero(datos.gasto) || 0; if (g < 0) throw datosInvalidos("El gasto no puede ser negativo"); d.gasto = g; }
    if (datos.gastoNota !== undefined) d.gastoNota = texto(datos.gastoNota, 200);
    if (datos.cambio !== undefined) d.cambio = !!datos.cambio;
    if (p.estado === "devuelto") {
      if (datos.motivoDev !== undefined) { if (!MOTIVOS[datos.motivoDev] || datos.motivoDev === "reprogramar") throw datosInvalidos("Elige qué pasó"); d.motivoDev = datos.motivoDev; }
      if (datos.notaDev !== undefined) d.notaDev = texto(datos.notaDev, 300);
    } else {
      if (datos.destinatario !== undefined) { d.destinatario = texto(datos.destinatario, 120); if (!d.destinatario) throw datosInvalidos("Escribe el nombre de quien recibe"); }
      const metodo = datos.metodo ?? p.metodo, v = datos.valorCobrado !== undefined ? numero(datos.valorCobrado) : Number(p.valorCobrado) || 0;
      if (!METODOS[metodo]) throw datosInvalidos("Elige el método de pago");
      if (!Number.isFinite(v) || v < 0) throw datosInvalidos("Escribe el valor cobrado (0 si no cobró)");
      const cuentaJs = metodo === "transf_js" ? datos.cuentaJs ?? p.cuentaJs ?? "" : "";
      if (metodo === "transf_js" && !CUENTAS_JS[cuentaJs]) throw datosInvalidos("Elige a qué cuenta llegó la transferencia");
      const aC = Number(p.aCobrar) || 0, dif = aC ? v - (metodo === "transf_cliente" ? 0 : aC) : 0;
      Object.assign(d, { metodo, valorCobrado: v, cuentaJs, difCobro: dif });
      if (dif !== (Number(p.difCobro) || 0)) d.difRevisada = false;
    }
    await exigirQueNoCambieLoContado(t, p, { ...p, ...d });
    return actualizar(t, "pedidos", guia, d, { antes: p });
  });
}

/** Lo que organiza la oficina en la ficha del pedido: remitente, mensajero, valores, flete, domicilio pagado
    y la corrección de lo cobrado (solo administración). Mismas reglas que "Guardar" de la ficha en la app. */
export async function editarOficina(ctx, guia, datos) {
  const a = ctx.actor;
  exigirOficina(a);
  return enTransaccion(ctx, async t => {
    const p = await pedidoBloqueado(t, guia);
    const d = {};
    if (datos.clienteId !== undefined && (datos.clienteId || "") !== (p.clienteId || "")) {
      // null o "" deja la guía sin remitente (la API ya lo permitía); un remitente nuevo tiene que existir.
      const cli = datos.clienteId ? await Clientes.obtener(t.c, datos.clienteId) : null;
      if (datos.clienteId && !cli) throw datosInvalidos("El cliente no existe");
      d.clienteId = cli ? cli.id : "";
    }
    if (datos.mensajeroId !== undefined && datos.mensajeroId !== p.mensajeroId) {
      if (!(await Mensajeros.existe(t.c, datos.mensajeroId))) throw datosInvalidos("Esa persona no está en Personal.");
      d.mensajeroId = datos.mensajeroId;
    }
    if (datos.valorServicio !== undefined) d.valorServicio = numero(datos.valorServicio) || 0;
    if (datos.aCobrar !== undefined) d.aCobrar = numero(datos.aCobrar) || 0;
    if (datos.gasto !== undefined) d.gasto = Math.max(0, numero(datos.gasto) || 0);
    if (datos.gastoNota !== undefined) d.gastoNota = texto(datos.gastoNota, 200);
    if (datos.difRevisada !== undefined) d.difRevisada = !!datos.difRevisada;
    if (datos.domiPagado !== undefined) {
      d.domiPagado = !!datos.domiPagado;
      if (d.domiPagado) {
        const medio = datos.domiPagoMedio ?? (p.domiPagado ? p.domiPagoMedio : "") ?? "", antiguo = p.domiPagado && !p.domiPagoMedio;
        const val = numero(datos.domiPagoValor ?? (p.domiPagado ? p.domiPagoValor : undefined)) || 0;
        if (!medio && !antiguo) throw datosInvalidos("Elige cómo pagó el domicilio");
        if (medio && !MEDIOS[medio]) throw datosInvalidos("Elige cómo pagó el domicilio");
        if (!(val > 0)) throw datosInvalidos("Escribe el valor que pagó");
        Object.assign(d, { domiPagoMedio: medio, domiPagoValor: val, domiPagoFecha: p.domiPagado && p.domiPagoFecha ? p.domiPagoFecha : ahora(),
          domiPagoUid: p.domiPagado ? p.domiPagoUid || "" : a.uid });
      } else Object.assign(d, { domiPagoMedio: "", domiPagoValor: "", domiPagoFecha: 0 });
    }
    if (p.estado === "devuelto" && datos.cobrarDev !== undefined) d.cobrarDev = !!datos.cobrarDev;
    if (p.estado === "entregado" && datos.cuentaJs !== undefined && (p.metodo === "transf_js" || a.esAdmin)) {
      if (datos.cuentaJs && !CUENTAS_JS[datos.cuentaJs]) throw datosInvalidos("La cuenta de JS no es válida.");
      d.cuentaJs = datos.cuentaJs || "";
    }
    if (datos.valorCobrado !== undefined || datos.metodo !== undefined) {
      // Corrección de lo que cobró el mensajero: solo administración, y la diferencia se recalcula igual que al entregar.
      if (!a.esAdmin) throw permisoNegado("Solo administración corrige lo que cobró el mensajero.");
      if (p.estado !== "entregado") throw conflicto("Solo se corrige lo cobrado de una guía entregada");
      const v = datos.valorCobrado !== undefined ? numero(datos.valorCobrado) : Number(p.valorCobrado) || 0, met = datos.metodo ?? p.metodo;
      if (!Number.isFinite(v) || v < 0) throw datosInvalidos("Escribe el valor cobrado (0 si no cobró)");
      if (!METODOS[met]) throw datosInvalidos("Elige cómo se lo pagaron");
      const aC = d.aCobrar ?? (Number(p.aCobrar) || 0), dif = aC ? v - (met === "transf_cliente" ? 0 : aC) : 0;
      const cta = met === "transf_js" ? d.cuentaJs ?? p.cuentaJs ?? "" : "";
      if (met === "transf_js" && !CUENTAS_JS[cta]) throw datosInvalidos("Elige a qué cuenta llegó la transferencia");
      Object.assign(d, { valorCobrado: v, metodo: met, cuentaJs: cta, difCobro: dif });
      if (dif !== (Number(p.difCobro) || 0)) d.difRevisada = false;
    }
    await exigirQueNoCambieLoContado(t, p, { ...p, ...d });
    return actualizar(t, "pedidos", guia, d, { antes: p });
  });
}

export async function marcarDiferenciaRevisada(ctx, guia) {
  exigirOficina(ctx.actor);
  return enTransaccion(ctx, async t => {
    const p = await pedidoBloqueado(t, guia);
    return actualizar(t, "pedidos", guia, { difRevisada: true }, { antes: p });
  });
}

/** La prenda de cambio llegó al cliente: lo marca la oficina o lo confirma el propio cliente. */
export async function cambioRecibido(ctx, guia) {
  const a = ctx.actor;
  return enTransaccion(ctx, async t => {
    const p = await pedidoBloqueado(t, guia, x => a.esOficina || (a.esCliente && !!a.clienteId && x.clienteId === a.clienteId));
    if (!p.cambio) throw conflicto("Ese envío no tiene una prenda de cambio pendiente.");
    if (p.cambioRecibido) throw conflicto("El cambio ya se confirmó", undefined, "YA_CONFIRMADO");
    return actualizar(t, "pedidos", guia, { cambioRecibido: ahora(), cambioConfirmo: a.uid }, { antes: p, log: a.esOficina });
  });
}

/** El cliente pagó el domicilio aparte: entra a la caja (o a la caja de oficina del asistente que lo recibe). */
export async function registrarPagoDomicilio(ctx, guia, { medio, valor }) {
  const a = ctx.actor;
  exigirOficina(a);
  if (!MEDIOS[medio]) throw datosInvalidos("Elige cómo pagó");
  const val = numero(valor) || 0;
  if (!(val > 0)) throw datosInvalidos("Escribe el valor que pagó");
  return enTransaccion(ctx, async t => {
    const p = await pedidoBloqueado(t, guia);
    return actualizar(t, "pedidos", guia, { domiPagado: true, domiPagoMedio: medio, domiPagoValor: val, domiPagoFecha: ahora(), domiPagoUid: a.uid }, { antes: p });
  });
}
export async function quitarPagoDomicilio(ctx, guia) {
  exigirOficina(ctx.actor);
  return enTransaccion(ctx, async t => {
    const p = await pedidoBloqueado(t, guia);
    await exigirQueNoCambieLoContado(t, p, { ...p, domiPagado: false, domiPagoMedio: "" });
    return actualizar(t, "pedidos", guia, { domiPagado: false, domiPagoMedio: "", domiPagoValor: "", domiPagoFecha: 0 }, { antes: p });
  });
}

/** Devolver a "por entregar" (administración). La foto y la firma de esa entrega pasan a "previas": no se borran. */
export async function reabrir(ctx, guia) {
  exigirAdmin(ctx.actor);
  return enTransaccion(ctx, async t => {
    const p = await pedidoBloqueado(t, guia);
    if (!cerrado(p)) throw conflicto("Ese pedido ya está por entregar.");
    await exigirQueNoCambieLoContado(t, p, { ...p, estado: "pendiente", metodo: "" });
    const r = await t.c.query(`UPDATE pedido_archivos SET tipo = 'previa' WHERE guia = $1 AND tipo IN ('entrega', 'firma')`, [guia]);
    if (r.rowCount) await registrar(t, "Reabrió " + guia + " (se guardaron las pruebas de la entrega anterior)", { col: "pedidos", id: guia });
    return actualizar(t, "pedidos", guia, { estado: "pendiente", entregado: null, destinatario: "", valorCobrado: 0, metodo: "", cuentaJs: "", difCobro: 0,
      difRevisada: false, motivoDev: "", notaDev: "", cobrarDev: false }, { antes: p });
  });
}

/** Eliminar un pedido (administración): va a la papelera con sus intentos y sus fotos (se puede restaurar). */
export async function eliminar(ctx, guia) {
  exigirAdmin(ctx.actor);
  return enTransaccion(ctx, async t => {
    const p = await pedidoBloqueado(t, guia);
    await exigirQueNoCambieLoContado(t, p, null);
    await borrar(t, "pedidos", guia);
    return { guia, enPapelera: true };
  });
}

/** Pedidos en bloque. modo "sin": mismo remitente (y domicilio) a varias guías; "serv": domicilio a varias entregas. */
export async function enBloque(ctx, { modo, guias, clienteId, valorServicio, usarTarifaCliente = true }) {
  exigirOficina(ctx.actor);
  if (!["sin", "serv"].includes(modo)) throw datosInvalidos("Modo no válido.");
  const lista = [...new Set((guias || []).map(String))];
  if (!lista.length) throw datosInvalidos("Elige al menos una guía.");
  if (lista.length > 1000) throw datosInvalidos("Máximo 1000 guías a la vez.");
  const serv = numero(valorServicio) || 0;
  return enTransaccion(ctx, async t => {
    const S = await cargarEstado(t.c, ["clientes"]);
    const ps = await Pedidos.listar(t.c, { filtro: { guia: { in: lista } } });
    if (ps.length !== lista.length) throw noEncontrado("Algunas guías ya no existen. Actualiza la lista.");
    const porGuia = Object.fromEntries(ps.map(p => [p.guia, p]));
    let cambios, cli = null;
    if (modo === "sin") {
      cli = S.clientes[clienteId];
      if (!cli) throw datosInvalidos("Elige el remitente");
      cambios = lista.map(g => [g, { clienteId: cli.id, ...(serv ? { valorServicio: serv } : {}) }]);
    } else {
      cambios = lista.map(g => { const v = usarTarifaCliente ? Number(S.clientes[porGuia[g].clienteId]?.tarifa) || serv : serv; return [g, v ? { valorServicio: v } : null]; });
      const faltan = cambios.filter(([, d]) => !d).length;
      if (faltan) throw datosInvalidos(`${faltan} guía${faltan === 1 ? "" : "s"} sin valor: escribe el valor del domicilio`);
    }
    for (const [g, d] of cambios) await Pedidos.actualizar(t.c, g, d);
    t.cambios.add("pedidos");
    if (modo === "sin" && serv && !Number(cli.tarifa)) { await Clientes.actualizar(t.c, cli.id, { tarifa: serv }); t.cambios.add("clientes"); } // queda como el domicilio de ese cliente
    await registrar(t, modo === "sin"
      ? `Asignó ${cli.nombre} como remitente de ${lista.length} guías${serv ? " con domicilio " + pesos(serv) : ""}: ${lista.join(", ")}`
      : `Puso el valor del domicilio a ${lista.length} guías: ${lista.join(", ")}`);
    return { actualizadas: lista.length };
  });
}

/** Nuevo id para agrupar en la papelera lo que se borra junto. */
export const grupoNuevo = () => nuevoId();
