/* Mensajeros: dinero que entregan (recaudos), período abierto y liquidaciones. */
import { Recaudos, Mensajeros, Liquidaciones } from "../models/documentos.js";
import { nuevoId } from "../helpers/ids.js";
import { paginaEnParalelo, filaAObjeto } from "../helpers/sql.js";
import { ahora } from "../helpers/reloj.js";
import { diaDe, hora } from "../helpers/fechas.js";
import { datosInvalidos, noEncontrado, permisoNegado, conflicto } from "./errores.js";
import { enTransaccion, guardar, actualizar, borrar } from "./transaccion.js";
import { calculosDe, exigirAdmin, exigirOficina, esMio, valorPositivo, medioValido, texto, exigirNoContado, numero } from "./contexto.js";
import * as CajaPatinador from "../models/cajaPatinador.model.js";
import { totales, ganaPorcentaje, sueldoPedidos, tipoDe } from "../helpers/calculos.js";

// movimientos: los pagos de clientes que recibió el mensajero en la calle suman a lo que debe.
const COLS_PERIODO = ["pedidos", "recaudos", "cajamovs", "liquidaciones", "mensajeros", "movimientos"];

/** GET /liquidaciones/pagina: cierres recientes filtrados, de a 9 en escritorio y 5 en celular. */
export async function paginaLiquidaciones(ctx, { pagina, porPagina, dia, estado = "todos", buscar = "" } = {}) {
  exigirAdmin(ctx.actor);
  const params = [], cond = [];
  if (dia) { params.push(dia); cond.push(`l.dia = $${params.length}`); }
  if (buscar) { params.push(`%${texto(buscar, 80)}%`); cond.push(`m.nombre ILIKE $${params.length}`); }
  if (estado === "cobrar") cond.push("l.debe > 0");
  else if (estado === "favor") cond.push("l.debe < 0");
  else if (estado === "paz") cond.push("l.debe = 0");
  const where = cond.length ? "WHERE " + cond.join(" AND ") : "";
  const tam = Math.max(1, Math.min(100, Number(porPagina) || 9));
  const r = await paginaEnParalelo({
    pagina, porPagina: tam,
    contar: async () => (await ctx.db.query(`SELECT count(*)::int AS total FROM liquidaciones l JOIN mensajeros m ON m.id = l.mensajero_id ${where}`, params)).rows[0]?.total || 0,
    traer: async offset => (await ctx.db.query(
      `SELECT l.* FROM liquidaciones l JOIN mensajeros m ON m.id = l.mensajero_id ${where}
       ORDER BY l.fecha DESC, l.id DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, tam, offset]
    )).rows
  });
  return { liquidaciones: r.filas.map(f => Liquidaciones.aDocumento(f)), pagina: r.pagina, porPagina: tam, total: r.total, paginas: r.paginas };
}
const COLS_SUELDO = ["pedidos", "recaudos", "cajamovs", "liquidaciones", "mensajeros", "jornadas", "movimientos"];

function vistaPeriodo(calc, mid) {
  const m = calc.S.mensajeros[mid], pm = calc.periodoMensajero(mid), t = totales(pm.ps);
  const enRuta = Object.values(calc.S.pedidos).filter(p => p.estado === "pendiente" && p.mensajeroId === mid).length;
  return {
    mensajeroId: mid, nombre: m?.nombre || "", tipo: tipoDe(m),
    ultimaLiquidacion: pm.ul, desde: pm.desde, anterior: pm.anterior, ajuste: pm.ajuste,
    entregas: pm.ps, recaudos: pm.recs, bases: pm.bases,
    efectivo: pm.efectivo, base: pm.base, gastos: pm.gastos, recibido: pm.recibido, cobros: pm.cobros, cobrosCli: pm.cobrosCli, debe: pm.debe,
    totales: t, enRuta, sinValorServicio: pm.ps.filter(p => !Number(p.valorServicio)).length,
    sueldo: ganaPorcentaje(m) ? sueldoPedidos(pm.ps) : null
  };
}

/** Período abierto de un mensajero ("Mi caja" y las tarjetas de Caja). Lo ve la oficina y el propio mensajero. */
export async function periodo(ctx, mid) {
  const a = ctx.actor;
  if (!a.esOficina && !esMio(a, mid)) throw permisoNegado();
  const calc = await calculosDe(ctx.db, COLS_PERIODO);
  if (!calc.S.mensajeros[mid]) throw noEncontrado("Esa persona no está en Personal.");
  return vistaPeriodo(calc, mid);
}

/** Entregas del período abierto de un mensajero, de a una página (Mi caja → Entregas del período): 5 en celular y 10 en escritorio.
    Las mismas reglas de `periodoMensajero`: entregas y devoluciones que no están en ninguna liquidación (por guía), y las de
    liquidaciones viejas sin guías, por hora. Lo más nuevo primero. Los totales son de lo filtrado (todas las páginas); las
    cifras del período siguen saliendo de `GET /mensajeros/:id/periodo`. */
export async function entregasPeriodo(ctx, mid, { pagina, porPagina, buscar = "", metodo = "todos" } = {}) {
  const a = ctx.actor;
  if (!a.esOficina && !esMio(a, mid)) throw permisoNegado();
  if (!(await ctx.db.query("SELECT 1 FROM mensajeros WHERE id = $1", [mid])).rows.length) throw noEncontrado("Esa persona no está en Personal.");
  const params = [mid];
  const cond = [
    "p.mensajero_id = $1", "p.estado IN ('entregado', 'devuelto')",
    "NOT EXISTS (SELECT 1 FROM liquidaciones l WHERE l.mensajero_id = p.mensajero_id AND p.guia = ANY(l.guias))",
    "p.entregado > COALESCE((SELECT max(l.fecha) FROM liquidaciones l WHERE l.mensajero_id = p.mensajero_id AND l.guias IS NULL), 'epoch'::timestamptz)"
  ];
  if (metodo === "devuelto") cond.push("p.estado = 'devuelto'");
  else if (metodo !== "todos") { params.push(metodo); cond.push(`p.estado = 'entregado' AND p.metodo = $${params.length}`); }
  const q = String(buscar || "").trim();
  if (q) {
    params.push("%" + q.slice(0, 60).replaceAll("\\", "\\\\").replaceAll("%", "\\%").replaceAll("_", "\\_") + "%"); // % _ y \ del texto no son comodines
    cond.push(`(p.guia ILIKE $${params.length} OR p.destinatario ILIKE $${params.length})`);
  }
  const donde = "WHERE " + cond.join(" AND ");
  const tam = Math.max(1, Math.min(100, Number(porPagina) || 10));
  let totales = { servicio: 0, flete: 0, cobrado: 0 };
  const r = await paginaEnParalelo({
    pagina, porPagina: tam,
    contar: async () => {
      const t = (await ctx.db.query(
        `SELECT count(*)::int AS total,
                COALESCE(sum(CASE WHEN p.estado = 'devuelto' AND NOT p.cobrar_dev THEN 0 ELSE p.valor_servicio END), 0)::bigint AS servicio,
                COALESCE(sum(p.gasto), 0)::bigint AS flete, COALESCE(sum(p.valor_cobrado), 0)::bigint AS cobrado
         FROM pedidos p ${donde}`, params)).rows[0];
      totales = { servicio: Number(t.servicio), flete: Number(t.flete), cobrado: Number(t.cobrado) };
      return t.total;
    },
    traer: async offset => (await ctx.db.query(
      `SELECT p.guia, p.estado, p.entregado, p.destinatario, p.metodo, p.cuenta_js, p.motivo_dev, p.cobrar_dev, p.valor_servicio, p.valor_cobrado, p.gasto
       FROM pedidos p ${donde} ORDER BY p.entregado DESC, p.guia DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, tam, offset])).rows
  });
  return { entregas: r.filas.map(filaAObjeto), pagina: r.pagina, porPagina: tam, total: r.total, paginas: r.paginas, totales };
}

/** Recibir dinero de un mensajero o de un patinador (entra igual a la caja). Si lo recibe un asistente, la plata queda en su caja de oficina. */
export async function recibir(ctx, { mensajeroId, valor, medio, nota }) {
  const a = ctx.actor;
  exigirOficina(a);
  const val = valorPositivo(valor);
  medioValido(medio);
  return enTransaccion(ctx, async t => {
    if (!(await Mensajeros.existe(t.c, mensajeroId))) throw datosInvalidos("Elige el mensajero.");
    const id = nuevoId();
    const recaudo = await guardar(t, "recaudos", { id, mensajeroId, valor: val, medio, nota: texto(nota, 200), fecha: ahora(), porUid: a.uid, porNombre: a.nombre });
    // Un patinador no tiene período de pedidos: lo que debe es lo que anotó de los clientes menos lo que ya entregó.
    const pat = await CajaPatinador.resumenDe(mensajeroId, t.c);
    if (pat) return { recaudo, debe: pat.debe };
    const calc = await calculosDe(t.c, COLS_PERIODO);
    return { recaudo, debe: calc.periodoMensajero(mensajeroId).debe };
  });
}

/** Corregir dinero recibido (solo administración). Lo ya contado en un arqueo no se cambia. */
export async function editarRecaudo(ctx, id, { valor, medio, nota }) {
  exigirAdmin(ctx.actor);
  const val = valorPositivo(valor);
  medioValido(medio);
  return enTransaccion(ctx, async t => {
    const r = await Recaudos.obtener(t.c, id, { bloquear: true });
    if (!r) throw noEncontrado("Esa entrega de dinero ya no existe.");
    exigirNoContado(await calculosDe(t.c, ["cajamovs"]), r.fecha);
    return actualizar(t, "recaudos", id, { valor: val, medio, nota: texto(nota, 200) }, { antes: r });
  });
}

export async function quitarRecaudo(ctx, id) {
  exigirAdmin(ctx.actor);
  return enTransaccion(ctx, async t => {
    const r = await Recaudos.obtener(t.c, id, { bloquear: true });
    if (!r) throw noEncontrado("Esa entrega de dinero ya no existe.");
    exigirNoContado(await calculosDe(t.c, ["cajamovs"]), r.fecha);
    await borrar(t, "recaudos", id);
    return { id, enPapelera: true };
  });
}

/** Liquidar y cerrar el período. Lo que queda debiendo puede pasar a adelanto de sueldo, sin pasar
    del sueldo que le falta cobrar esa semana (el sueldo no puede quedar negativo). */
export async function liquidar(ctx, { mensajeroId: mid, entregaFinal, medio = "efectivo", pasarAdelanto = true, semana }) {
  exigirAdmin(ctx.actor);
  const val = numero(entregaFinal) || 0;
  if (val < 0) throw datosInvalidos("El valor no puede ser negativo");
  if (val > 0) medioValido(medio);
  return enTransaccion(ctx, async t => {
    const m = await Mensajeros.obtener(t.c, mid, { bloquear: true }); // una liquidación a la vez por mensajero
    if (!m) throw noEncontrado("Esa persona no está en Personal.");
    const calc = await calculosDe(t.c, COLS_SUELDO);
    const pm = calc.periodoMensajero(mid), tt = totales(pm.ps), sueldo = ganaPorcentaje(m) ? sueldoPedidos(pm.ps) : 0;
    const enRuta = Object.values(calc.S.pedidos).filter(p => p.estado === "pendiente" && p.mensajeroId === mid).length;
    const semanas = calc.semanasAdelanto().map(([w]) => w), sem = semana || semanas[0];
    if (pasarAdelanto && !semanas.includes(sem)) throw datosInvalidos("El adelanto solo se puede cargar a la semana actual o a la anterior.");
    const adelanto = d => (d > 0 && pasarAdelanto ? Math.max(0, Math.min(d, Math.round(calc.sueldoPersonaSemana(mid, sem).neto))) : 0);

    const t0 = ahora();
    if (val > 0) await guardar(t, "recaudos", { id: nuevoId(), mensajeroId: mid, valor: val, medio, nota: "Liquidación", fecha: t0 });
    const fecha = Math.max(ahora(), t0 + 1), id = mid + "_" + fecha, queda = pm.debe - val, adel = adelanto(queda);
    const liquidacion = await guardar(t, "liquidaciones", {
      id, mensajeroId: mid, desde: pm.desde, fecha, dia: diaDe(fecha), entregas: pm.ps.length, guias: pm.ps.map(p => p.guia),
      efectivo: tt.efectivo, base: pm.base, gastos: pm.gastos, cobros: pm.cobros, anterior: pm.anterior, recibidoAntes: pm.recibido, entregaFinal: val,
      recibido: pm.recibido + val, debe: queda - adel, adelanto: adel, ajuste: pm.ajuste, transfJs: tt.transfJs, transfCli: tt.transfCli, sueldo, enRuta
    });
    if (adel) // la plata ya la tiene el mensajero: es un adelanto que no sale de la caja (ver libroCaja) y se descuenta del sueldo de esa semana
      await guardar(t, "cajamovs", { id: nuevoId(), tipo: "sale", cat: "adelanto", personaId: mid, valor: adel, medio: "efectivo", concepto: "Lo que quedó debiendo en la liquidación del " + hora(fecha), fecha, semana: sem, deLiquidacion: id });
    return { liquidacion, adelanto: adel, queda };
  });
}

/** Reabrir el último período: borra la liquidación y el adelanto que salió de ella. El dinero recibido se conserva. */
export async function reabrirLiquidacion(ctx, id) {
  exigirAdmin(ctx.actor);
  return enTransaccion(ctx, async t => {
    const l = await Liquidaciones.obtener(t.c, id, { bloquear: true });
    if (!l) throw noEncontrado("Esa liquidación ya no existe.");
    const ultima = (await Liquidaciones.listar(t.c, { filtro: { mensajeroId: l.mensajeroId }, orden: "fecha desc", limite: 1 }))[0];
    if (ultima?.id !== id) throw conflicto("Solo se puede reabrir la última liquidación de cada mensajero.");
    const r = await t.c.query(`select id from cajamovs where de_liquidacion = $1`, [id]);
    for (const { id: cid } of r.rows) await borrar(t, "cajamovs", cid);
    await borrar(t, "liquidaciones", id);
    return { id, reabierto: true };
  });
}

/** Resumen de todos los repartidores para la pestaña Caja (asistente y administración). */
export async function resumenMensajeros(ctx) {
  exigirOficina(ctx.actor);
  const calc = await calculosDe(ctx.db, COLS_PERIODO);
  const pendM = {};
  Object.values(calc.S.pedidos).filter(p => p.estado === "pendiente").forEach(p => (pendM[p.mensajeroId] = (pendM[p.mensajeroId] || 0) + 1));
  return calc.listaOrdenada(calc.S.mensajeros, "nombre").filter(m => ["mensajero", "dueno", "oficina"].includes(tipoDe(m)))
    .map(m => vistaPeriodo(calc, m.id))
    .filter(x => x.tipo === "mensajero" || x.entregas.length || x.recaudos.length || x.debe || pendM[x.mensajeroId])
    .map(x => (ctx.actor.esAdmin ? x : { ...x, sueldo: undefined }));
}

