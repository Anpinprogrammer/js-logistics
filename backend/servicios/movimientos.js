/* Cuenta de los clientes: pagos, pagos a clientes, compras por encargo, ganancias, cargos y abonos.
   También el cambio de medio que hace el asistente (24 h) y los reversos de pagos. */
import { Movimientos, Recaudos, Clientes, Mensajeros } from "../models/documentos.js";
import { MOVS, MOVS_OFICINA, MEDIOS, VENTANA_CORRECCION_MS } from "../helpers/constantes.js";
import { nuevoId } from "../helpers/ids.js";
import { ahora } from "../helpers/reloj.js";
import { hora, fechaDia, esDia, diaDe } from "../helpers/fechas.js";
import { sinTildes } from "../helpers/texto.js";
import { datosInvalidos, noEncontrado, permisoNegado, yaContadoError } from "./errores.js";
import { enTransaccion, guardar, actualizar, borrar } from "./transaccion.js";
import { calculosDe, exigirAdmin, exigirOficina, valorPositivo, diaValido, texto, exigirNoContado, exigirDiaAbierto } from "./contexto.js";
import { esPago, mueveCaja, esRepartidor } from "../helpers/calculos.js";

/** Valida y arma los datos comunes de crear y editar. soloHoy: el pago que registra el asistente queda con la hora del momento. */
async function armar(t, a, datos, soloHoy) {
  const tipo = datos.tipo;
  if (!MOVS[tipo]) throw datosInvalidos("Tipo de movimiento no válido.");
  if (!a.esAdmin && !MOVS_OFICINA.includes(tipo)) throw permisoNegado("Ese tipo de movimiento solo lo registra administración.");
  const cli = datos.clienteId ? await Clientes.obtener(t.c, datos.clienteId) : null;
  if (!cli) throw datosInvalidos("Elige el cliente");
  const valor = valorPositivo(datos.valor);
  const medio = datos.medio || "";
  if (tipo === "pago_de_cliente" && !MEDIOS[medio]) throw datosInvalidos("Elige cómo pagó");
  if (tipo === "pago_a_cliente" && !MEDIOS[medio]) throw datosInvalidos("Elige cómo le pagas");
  if (medio && !MEDIOS[medio]) throw datosInvalidos("El medio no es válido.");
  const calc = await calculosDe(t.c, ["cajamovs"]);
  const caja = mueveCaja({ tipo });
  let fecha;
  if (soloHoy) fecha = ahora();
  else {
    const dia = diaValido(datos.dia);
    if (caja) exigirDiaAbierto(calc, dia);
    fecha = caja ? calc.fechaCaja(dia) : fechaDia(dia);
  }
  return { calc, d: { tipo, clienteId: cli.id, valor, medio, nota: texto(datos.nota, 300), fecha } };
}

export async function crear(ctx, datos) {
  const a = ctx.actor;
  exigirOficina(a);
  return enTransaccion(ctx, async t => {
    const { d } = await armar(t, a, datos, !a.esAdmin && esPago({ tipo: datos.tipo }));
    const id = nuevoId();
    return guardar(t, "movimientos", { id, ...d, porUid: a.uid, porNombre: a.nombre });
  });
}

/** Recepción → Recibir dinero: el mensajero anota el pago que le hizo un cliente en la calle (cliente, concepto y valor).
    Es el mismo pago del cliente de la oficina (`pago_de_cliente`, abona a su cuenta), en efectivo y con la hora del
    servidor, pero con `mensajeroId`: no entra a la caja hasta que el mensajero lo entrega y mientras tanto suma a lo que
    debe en su período (periodoMensajero). El mensajero solo anota en su nombre; administración puede hacerlo por otro. */
export async function recibirDeMensajero(ctx, { clienteId, concepto, valor, mensajeroId }) {
  const a = ctx.actor;
  const mid = a.esAdmin ? mensajeroId || a.mensajeroId : a.rol === "mensajero" ? a.mensajeroId : "";
  if (!a.esAdmin && a.rol !== "mensajero") throw permisoNegado();
  if (!mid) throw datosInvalidos(a.esAdmin ? "Elige el mensajero que recibió el dinero." : "Tu cuenta no está vinculada con tu nombre en Personal. Pídele a administración que la vincule.");
  return enTransaccion(ctx, async t => {
    const m = await Mensajeros.obtener(t.c, mid);
    if (!m) throw datosInvalidos("Elige el mensajero que recibió el dinero.");
    if (!esRepartidor(m)) throw datosInvalidos("Solo un mensajero puede recibir dinero aquí.");
    const cli = clienteId ? await Clientes.obtener(t.c, clienteId) : null;
    if (!cli) throw noEncontrado("Ese cliente ya no existe. Búscalo de nuevo.");
    const movimiento = await guardar(t, "movimientos", {
      id: nuevoId(), tipo: "pago_de_cliente", clienteId: cli.id, valor: valorPositivo(valor), medio: "efectivo",
      nota: texto(concepto, 80), fecha: ahora(), porUid: a.uid, porNombre: a.nombre, mensajeroId: mid
    });
    const calc = await calculosDe(t.c, ["pedidos", "recaudos", "cajamovs", "liquidaciones", "mensajeros", "movimientos", "clientes"]);
    return { movimiento, clienteNombre: cli.nombre, saldoCliente: calc.saldoCliente(cli.id), debe: calc.periodoMensajero(mid).debe };
  });
}

/** Editar un movimiento (solo administración). Lo que ya se contó en un arqueo no se cambia. */
export async function editar(ctx, id, datos) {
  const a = ctx.actor;
  exigirAdmin(a);
  return enTransaccion(ctx, async t => {
    const m = await Movimientos.obtener(t.c, id, { bloquear: true });
    if (!m) throw noEncontrado("Ese movimiento ya no existe.");
    const { calc, d } = await armar(t, a, datos, false);
    if (mueveCaja(m) && calc.yaContado(m.fecha)) throw yaContadoError(calc.textoContado());
    return actualizar(t, "movimientos", id, d, { antes: m });
  });
}

/** Reversar un pago: si todavía no se contó en un arqueo, se borra; si ya se contó, se registra hoy un pago contrario. */
async function reversarPago(t, calc, m) {
  // El pago que recibió un mensajero no entró a la caja (no lo toca el arqueo): se borra y, si ya estaba en una
  // liquidación cerrada, la diferencia pasa sola a lo que debe en su período abierto (ajuste de periodoMensajero).
  if (!mueveCaja(m) || !calc.yaContado(m.fecha)) {
    if (!t.actor.esAdmin) throw permisoNegado("Solo administración puede quitar un pago.");
    await borrar(t, "movimientos", m.id);
    return { id: m.id, accion: "borrado" };
  }
  const id = nuevoId();
  await guardar(t, "movimientos", { id, clienteId: m.clienteId, tipo: m.tipo === "pago_a_cliente" ? "pago_de_cliente" : "pago_a_cliente", valor: Number(m.valor) || 0, medio: m.medio || "efectivo",
    nota: "Reverso del pago del " + hora(m.fecha), reversoDe: m.id, fecha: ahora(), porUid: t.actor.uid, porNombre: t.actor.nombre });
  return { id: m.id, accion: "reversado", reverso: id };
}

/** Quitar un movimiento (solo administración): pagos ya contados se reversan; compras ya contadas no se tocan. */
export async function eliminar(ctx, id) {
  exigirAdmin(ctx.actor);
  return enTransaccion(ctx, async t => {
    const m = await Movimientos.obtener(t.c, id, { bloquear: true });
    if (!m) throw noEncontrado("Ese movimiento ya no existe.");
    const calc = await calculosDe(t.c, ["cajamovs"]);
    if (mueveCaja(m) && calc.yaContado(m.fecha) && !esPago(m)) throw yaContadoError(calc.textoContado());
    if (esPago(m)) return reversarPago(t, calc, m);
    await borrar(t, "movimientos", id);
    return { id, accion: "borrado" };
  });
}

/** "Reversar los pagos" que se acaban de registrar al imprimir recibos. */
export async function reversarPagos(ctx, { ids }) {
  exigirOficina(ctx.actor);
  const lista = [...new Set(ids || [])];
  if (!lista.length) throw datosInvalidos("No hay pagos para reversar.");
  return enTransaccion(ctx, async t => {
    const calc = await calculosDe(t.c, ["cajamovs"]);
    const out = [];
    for (const id of lista) {
      const m = await Movimientos.obtener(t.c, id, { bloquear: true });
      if (!m || !esPago(m)) continue;
      out.push(await reversarPago(t, calc, m));
    }
    return { reversados: out, total: out.length };
  });
}

/** Corregir el medio (efectivo, Nequi, Bancolombia) de un pago o de dinero recibido.
    El asistente: solo lo que registró él, hasta 24 horas después y antes del último arqueo. Queda el medio anterior. */
export async function cambiarMedio(ctx, col, id, { medio }) {
  const a = ctx.actor;
  exigirOficina(a);
  const Modelo = col === "recaudos" ? Recaudos : Movimientos;
  if (!MEDIOS[medio]) throw datosInvalidos("Elige el medio correcto");
  return enTransaccion(ctx, async t => {
    const x = await Modelo.obtener(t.c, id, { bloquear: true });
    if (!x) throw noEncontrado("Ese registro ya no existe.");
    if (col === "movimientos" && !["pago_de_cliente", "pago_a_cliente", "compra_cliente"].includes(x.tipo)) throw datosInvalidos("Ese movimiento no tiene medio de pago.");
    if (!a.esAdmin && (x.porUid !== a.uid || ahora() - x.fecha >= VENTANA_CORRECCION_MS)) throw permisoNegado("Solo puedes corregir el medio de lo que registraste tú, hasta 24 horas después.");
    exigirNoContado(await calculosDe(t.c, ["cajamovs"]), x.fecha);
    if (medio === x.medio) return x;
    return actualizar(t, col, id, { medio, medioAntes: x.medioAntes || x.medio || "", medioCambio: ahora() }, { antes: x });
  });
}


/* ---------- pestaña Cuentas: páginas de movimientos y ganancias por cliente ---------- */
const delTipo = (tipo, filtro) => filtro === "todos" || (filtro === "pagos" ? tipo === "pago_de_cliente" || tipo === "pago_a_cliente" : filtro === "compras" ? tipo === "compra_cliente" : tipo === "ganancia");

/** Corta una lista en páginas; sin página devuelve el tamaño por defecto (15). */
function cortarPagina(lista, pagina, porPagina) {
  const tam = Math.max(1, Math.min(100, Number(porPagina) || 15));
  const paginas = Math.max(1, Math.ceil(lista.length / tam));
  const actual = Math.min(Math.max(1, Number(pagina) || 1), paginas);
  return { items: lista.slice((actual - 1) * tam, actual * tam), pagina: actual, porPagina: tam, total: lista.length, paginas };
}

/** Movimientos de oficina filtrados (fecha, tipo y búsqueda por cliente o detalle) con sus totales y una página. */
export function armarPaginaMovimientos(movs, clientes, { buscar = "", tipo = "todos", desde, hasta, pagina, porPagina } = {}) {
  const nombres = new Map(clientes.map(c => [c.id, c.nombre]));
  const q = sinTildes(String(buscar || "").trim());
  const lista = movs
    .filter(m => MOVS_OFICINA.includes(m.tipo))
    .filter(m => { const d = diaDe(m.fecha); return (!desde || d >= desde) && (!hasta || d <= hasta); })
    .filter(m => delTipo(m.tipo, tipo))
    .filter(m => !q || sinTildes((nombres.get(m.clienteId) || "") + " " + (m.nota || "")).includes(q))
    .sort((a, b) => b.fecha - a.fecha);
  const suma = t => lista.filter(m => m.tipo === t).reduce((a, m) => a + (Number(m.valor) || 0), 0);
  const totales = { recibido: suma("pago_de_cliente"), pagado: suma("pago_a_cliente"), compras: suma("compra_cliente"), ganancia: suma("ganancia") };
  const p = cortarPagina(lista, pagina, porPagina);
  return { movimientos: p.items, pagina: p.pagina, porPagina: p.porPagina, total: p.total, paginas: p.paginas, totales };
}

/** Ganancias por cliente (con pagos y compras de contexto) según el rango y la búsqueda; una página. */
export function armarGananciasPorCliente(movs, clientes, { buscar = "", desde, hasta, pagina, porPagina } = {}) {
  const nombres = new Map(clientes.map(c => [c.id, c.nombre]));
  const q = sinTildes(String(buscar || "").trim());
  const filtrados = movs
    .filter(m => MOVS_OFICINA.includes(m.tipo))
    .filter(m => { const d = diaDe(m.fecha); return (!desde || d >= desde) && (!hasta || d <= hasta); })
    .filter(m => !q || sinTildes((nombres.get(m.clienteId) || "") + " " + (m.nota || "")).includes(q));
  const por = new Map();
  for (const m of filtrados) {
    if (!m.clienteId) continue;
    const x = por.get(m.clienteId) || { clienteId: m.clienteId, nombre: nombres.get(m.clienteId) || "(eliminado)", recibido: 0, compras: 0, ganancia: 0 };
    const valor = Number(m.valor) || 0;
    if (m.tipo === "pago_de_cliente") x.recibido += valor; else if (m.tipo === "compra_cliente") x.compras += valor; else if (m.tipo === "ganancia") x.ganancia += valor;
    por.set(m.clienteId, x);
  }
  const lista = [...por.values()].sort((a, b) => b.ganancia - a.ganancia || b.compras - a.compras || b.recibido - a.recibido);
  const totalGanancia = filtrados.filter(m => m.tipo === "ganancia").reduce((a, m) => a + (Number(m.valor) || 0), 0);
  const p = cortarPagina(lista, pagina, porPagina);
  return { clientes: p.items, pagina: p.pagina, porPagina: p.porPagina, total: p.total, paginas: p.paginas, totalGanancia };
}

function diasValidos({ desde, hasta }) {
  for (const d of [desde, hasta]) if (d && !esDia(d)) throw datosInvalidos("El día no es válido (AAAA-MM-DD).");
}

/** GET /movimientos/pagina: la pestaña Movimientos de Cuentas, filtrada y por páginas. */
export async function paginaOficina(ctx, filtros = {}) {
  exigirOficina(ctx.actor);
  diasValidos(filtros);
  const [movs, clientes] = await Promise.all([Movimientos.listar(ctx.db), Clientes.listar(ctx.db)]);
  return armarPaginaMovimientos(movs, clientes, filtros);
}

/** GET /movimientos/ganancias: ganancias por cliente, la pestaña Ganancias de Cuentas. */
export async function gananciasPorCliente(ctx, filtros = {}) {
  exigirOficina(ctx.actor);
  diasValidos(filtros);
  const [movs, clientes] = await Promise.all([Movimientos.listar(ctx.db), Clientes.listar(ctx.db)]);
  return armarGananciasPorCliente(movs, clientes, filtros);
}
