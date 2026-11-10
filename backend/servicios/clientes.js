/* Clientes (remitentes): registro con control de repetidos, cuenta y saldo, cuadre del día, unir repetidos
   y pagar saldos a favor al imprimir recibos. */
import { Clientes } from "../models/documentos.js";
import { nuevoId } from "../helpers/ids.js";
import { ahora } from "../helpers/reloj.js";
import { esDia, hoy, diaDe } from "../helpers/fechas.js";
import { datosInvalidos, noEncontrado, permisoNegado, conflicto } from "./errores.js";
import { enTransaccion, guardar, borrar } from "./transaccion.js";
import { registrar } from "./historial.js";
import { calculosDe, exigirAdmin, exigirOficina, medioValido, numero, texto } from "./contexto.js";
import { normNom, normTel } from "../helpers/calculos.js";
import { sinTildes } from "../helpers/texto.js";

const vistaParecido = d => ({ id: d.c.id, nombre: d.c.nombre, telefono: d.c.telefono || "", mismoNombre: d.mismoNom, mismoTelefono: d.mismoTel, igual: d.igual });

/** Si el nombre o el número ya existen: con los dos iguales no se deja crear; con uno solo, hay que confirmar (forzar). */
function revisarRepetidos(calc, nombre, telefono, excluir, forzar) {
  const dups = calc.parecidos(nombre, telefono, excluir);
  if (dups.some(d => d.igual)) throw conflicto("Este cliente ya existe: no se puede crear otro con el mismo nombre y número.", { parecidos: dups.map(vistaParecido) });
  if (dups.length && !forzar) throw conflicto("Hay un cliente parecido. Si de verdad es otro cliente, guárdalo de todos modos.", { parecidos: dups.map(vistaParecido), puedeForzar: true });
}

export async function crear(ctx, datos) {
  exigirOficina(ctx.actor);
  const nombre = texto(datos.nombre, 120), telefono = texto(datos.telefono, 40);
  if (!nombre) throw datosInvalidos("Escribe el nombre");
  if (!telefono) throw datosInvalidos("Escribe el número");
  return enTransaccion(ctx, async t => {
    revisarRepetidos(await calculosDe(t.c, ["clientes"]), nombre, telefono, null, !!datos.forzar);
    const id = nuevoId();
    return guardar(t, "clientes", { id, nombre, telefono, tarifa: numero(datos.tarifa) || 0 });
  });
}

export async function editar(ctx, id, datos) {
  exigirOficina(ctx.actor);
  const nombre = texto(datos.nombre, 120), telefono = texto(datos.telefono, 40);
  if (!nombre) throw datosInvalidos("Escribe el nombre");
  if (!telefono) throw datosInvalidos("Escribe el número");
  return enTransaccion(ctx, async t => {
    const c = await Clientes.obtener(t.c, id, { bloquear: true });
    if (!c) throw noEncontrado("Ese cliente ya no existe.");
    if (normNom(nombre) !== normNom(c.nombre) || normTel(telefono) !== normTel(c.telefono)) revisarRepetidos(await calculosDe(t.c, ["clientes"]), nombre, telefono, id, !!datos.forzar);
    // En la app el pedido en ruta copiaba el nombre del remitente; aquí se lee siempre de la ficha del cliente.
    return guardar(t, "clientes", { id, nombre, telefono, tarifa: numero(datos.tarifa) || 0 });
  });
}

/**
 * Aplica búsqueda, filtro y paginación a la lista de clientes con saldo.
 * Es pura para poder probarla sin base de datos.
 */
export function armarPaginaClientes(cs, { dia, buscar = "", filtro = "todos", pagina, porPagina } = {}) {
  const k = c => (dia ? c.delDia : c.saldo);
  const cobrar = cs.filter(c => k(c) < 0), pagar = cs.filter(c => k(c) > 0);
  const porCobrar = { total: cobrar.reduce((a, c) => a - k(c), 0), clientes: cobrar.length };
  const porPagar = { total: pagar.reduce((a, c) => a + k(c), 0), clientes: pagar.length };

  const q = sinTildes(String(buscar || "").trim()), qt = String(buscar || "").replace(/\D/g, "");
  const pasa = c => {
    const bus = sinTildes(c.nombre) + " " + normTel(c.telefono);
    return !q || bus.includes(q) || (qt.length >= 3 && bus.includes(qt));
  };
  const base = filtro === "cobrar" ? cobrar : filtro === "pagar" ? pagar : dia ? cs.filter(c => c.delDia) : cs;
  const filtrados = base.filter(pasa);
  const resultado = { clientes: filtrados, totalClientes: cs.length, porCobrar, porPagar };

  // Sin pagina ni porPagina se mantiene la respuesta completa de siempre.
  if (pagina === undefined && porPagina === undefined) return resultado;

  const tam = Math.max(1, Math.min(100, Number(porPagina) || 20));
  const paginas = Math.max(1, Math.ceil(filtrados.length / tam));
  const actual = Math.min(Math.max(1, Number(pagina) || 1), paginas);
  return {
    ...resultado,
    clientes: filtrados.slice((actual - 1) * tam, actual * tam),
    pagina: actual,
    porPagina: tam,
    total: filtrados.length,
    paginas
  };
}

/** Lista de clientes con su saldo y, si se elige un día, lo que se movió ese día (pestaña Clientes).
 *  Con `pagina`/`porPagina` corta la respuesta; sin ellos devuelve la lista completa (compatibilidad). */
export async function listaConSaldos(ctx, { dia, buscar = "", filtro = "todos", pagina, porPagina } = {}) {
  exigirOficina(ctx.actor);
  if (dia && !esDia(dia)) throw datosInvalidos("El día no es válido.");
  const calc = await calculosDe(ctx.db, ["clientes", "pedidos", "movimientos"]);
  const cs = calc.listaOrdenada(calc.S.clientes, "nombre").map(c => ({
    ...c, saldo: calc.saldoCliente(c.id),
    ...(dia ? { delDia: calc.filasCuenta(c.id).filter(r => diaDe(r.fecha) === dia).reduce((a, r) => a + r.v, 0) } : {})
  }));
  return {
    ...armarPaginaClientes(cs, { dia, buscar, filtro, pagina, porPagina }),
    repetidos: ctx.actor.esAdmin ? calc.gruposRepetidos().length : undefined
  };
}

/** Cuenta de un cliente: saldo y movimientos. La ve la oficina y el propio cliente. */
export async function cuenta(ctx, cid) {
  const a = ctx.actor;
  if (!a.esOficina && !(a.esCliente && a.clienteId === cid)) throw noEncontrado("Ese cliente ya no existe."); // a otro cliente no se le confirma que existe
  const calc = await calculosDe(ctx.db, ["clientes", "pedidos", "movimientos"]);
  const c = calc.S.clientes[cid];
  if (!c) throw noEncontrado("Ese cliente ya no existe.");
  return {
    cliente: c, saldo: calc.saldoCliente(cid), filas: calc.filasCuenta(cid),
    enRuta: Object.values(calc.S.pedidos).filter(p => p.clienteId === cid && p.estado === "pendiente").length
  };
}

/** Recibo de cuadre de un día: saldo anterior, lo de ese día, lo pagado y lo que queda. El cliente solo ve el suyo. */
export async function cuadre(ctx, { dia, clienteId } = {}) {
  const a = ctx.actor, d = dia || hoy();
  if (!esDia(d)) throw datosInvalidos("El día no es válido.");
  if (!a.esOficina && !a.esCliente) throw permisoNegado();
  const calc = await calculosDe(ctx.db, ["clientes", "pedidos", "movimientos"]);
  const solo = a.esCliente ? a.clienteId : clienteId;
  return { dia: d, recibos: calc.cuadreDia(d).filter(r => !solo || r.cid === solo).map(r => ({ ...r, lineas: r.lineas.map(({ p, ...l }) => (p ? { ...l, pedido: p } : l)) })) };
}

export async function repetidos(ctx) {
  exigirAdmin(ctx.actor);
  const calc = await calculosDe(ctx.db, ["clientes", "pedidos", "movimientos", "usuarios"]);
  const P = Object.values(calc.S.pedidos), M = Object.values(calc.S.movimientos), U = Object.values(calc.S.usuarios);
  return calc.gruposRepetidos().map(g => g.map(c => ({
    ...c, pedidos: P.filter(p => p.clienteId === c.id).length, movimientos: M.filter(m => m.clienteId === c.id).length,
    tieneCuenta: U.some(u => u.clienteId === c.id), saldo: calc.saldoCliente(c.id)
  })));
}

/** Unir repetidos: pedidos, movimientos y cuentas de acceso de "otros" pasan al cliente k; los otros se borran. */
export async function unir(ctx, k, { otros }) {
  exigirAdmin(ctx.actor);
  const lista = [...new Set((otros || []).filter(o => o && o !== k))];
  if (!lista.length) throw datosInvalidos("Elige los clientes que se unen.");
  return enTransaccion(ctx, async t => {
    const kc = await Clientes.obtener(t.c, k, { bloquear: true });
    if (!kc) throw noEncontrado("El cliente que se conserva ya no existe.");
    let np = 0, nm = 0;
    for (const o of lista) {
      const oc = await Clientes.obtener(t.c, o);
      if (!oc) continue;
      np += (await t.c.query(`UPDATE pedidos SET cliente_id = $1, actualizado = now() WHERE cliente_id = $2`, [k, o])).rowCount;
      nm += (await t.c.query(`UPDATE movimientos SET cliente_id = $1 WHERE cliente_id = $2`, [k, o])).rowCount;
      await t.c.query(`UPDATE usuarios SET cliente_id = $1, actualizado = now() WHERE cliente_id = $2`, [k, o]);
      const falta = {};
      if (!Number(kc.tarifa) && Number(oc.tarifa)) falta.tarifa = kc.tarifa = Number(oc.tarifa);
      if (!kc.telefono && oc.telefono) falta.telefono = kc.telefono = oc.telefono;
      if (Object.keys(falta).length) await Clientes.actualizar(t.c, k, falta);
      await borrar(t, "clientes", o);
    }
    ["pedidos", "movimientos", "usuarios", "clientes"].forEach(x => t.cambios.add(x));
    await registrar(t, `Unió ${lista.length} cliente${lista.length === 1 ? "" : "s"} repetido${lista.length === 1 ? "" : "s"} en ${kc.nombre}: ${np} pedidos y ${nm} movimientos`);
    return { clienteId: k, pedidos: np, movimientos: nm };
  });
}

/** "Pagar e imprimir": a cada cliente elegido con saldo a favor se le paga ese saldo y queda en $ 0.
    Se usa el saldo del momento: si ya quedó en 0, no se paga dos veces. */
export async function pagarSaldos(ctx, { clienteIds, medio }) {
  const a = ctx.actor;
  exigirOficina(a);
  medioValido(medio, "Elige en qué medio les pagas");
  const ids = [...new Set(clienteIds || [])];
  if (!ids.length) throw datosInvalidos("Elige al menos un cliente.");
  return enTransaccion(ctx, async t => {
    await t.c.query("select pg_advisory_xact_lock(4243)"); // dos pagos en lote a la vez no pagan dos veces el mismo saldo
    const calc = await calculosDe(t.c, ["clientes", "pedidos", "movimientos"]);
    const hechos = []; let total = 0;
    for (const cid of ids) {
      if (!calc.S.clientes[cid]) continue;
      const v = Math.round(calc.saldoCliente(cid));
      if (!(v > 0)) continue;
      const id = nuevoId();
      await guardar(t, "movimientos", { id, clienteId: cid, tipo: "pago_a_cliente", valor: v, medio, nota: "Pago con recibo impreso", fecha: ahora(), porUid: a.uid, porNombre: a.nombre });
      hechos.push(id); total += v;
    }
    return { hechos, total, clientes: hechos.length };
  });
}

