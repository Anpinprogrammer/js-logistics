/* Cuenta de los clientes: pagos, pagos a clientes, compras por encargo, ganancias, cargos y abonos.
   También el cambio de medio que hace el asistente (24 h) y los reversos de pagos. */
import { Movimientos, Recaudos, Clientes } from "../models/documentos.js";
import { MOVS, MOVS_OFICINA, MEDIOS, VENTANA_CORRECCION_MS } from "../helpers/constantes.js";
import { nuevoId } from "../helpers/ids.js";
import { ahora } from "../helpers/reloj.js";
import { hora, fechaDia } from "../helpers/fechas.js";
import { datosInvalidos, noEncontrado, permisoNegado, yaContadoError } from "./errores.js";
import { enTransaccion, guardar, actualizar, borrar } from "./transaccion.js";
import { calculosDe, exigirAdmin, exigirOficina, valorPositivo, diaValido, texto, exigirNoContado, exigirDiaAbierto } from "./contexto.js";
import { esPago, mueveCaja } from "../helpers/calculos.js";

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
  if (!calc.yaContado(m.fecha)) {
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
