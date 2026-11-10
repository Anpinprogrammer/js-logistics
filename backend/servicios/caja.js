/* Caja: resumen y libro, entradas y salidas, bases, cuentas internas, cajas de oficina,
   arqueo, cierre del día y adelantos. Misma lógica que la pestaña Caja de la app. */
import { Cajamovs, Cuentas, Usuarios, Mensajeros, Liquidaciones, Meta } from "../models/documentos.js";
import { CATS_TIPO, CATS_PERSONA, CATS_SEMANA, MEDIOS, TIPOS_CUENTA } from "../helpers/constantes.js";
import { nuevoId } from "../helpers/ids.js";
import { ahora } from "../helpers/reloj.js";
import { diaDe, hoy, hora, esDia } from "../helpers/fechas.js";
import { pesos } from "../helpers/texto.js";
import { datosInvalidos, noEncontrado, permisoNegado, conflicto, yaContadoError } from "./errores.js";
import { enTransaccion, guardar, actualizar, borrar } from "./transaccion.js";
import { registrar } from "./historial.js";
import { calculosDe, exigirAdmin, exigirOficina, valorPositivo, medioValido, diaValido, texto, exigirNoContado, exigirDiaAbierto, numero } from "./contexto.js";
import { netoArqueo, resultadoArqueo, valorAdel, cambioPendiente, crearCalculos } from "../helpers/calculos.js";

/* ---------- resumen, libro y cierre del día (administración) ---------- */
export async function resumen(ctx) {
  exigirAdmin(ctx.actor);
  const calc = await calculosDe(ctx.db);
  const { L, ...R } = calc.resumenCaja();
  const arqueos = calc.arqueosCaja(), mes = hoy().slice(0, 7), A = arqueos.filter(a => diaDe(a.fecha).startsWith(mes));
  return {
    ...R,
    ultimoArqueo: arqueos[0] ? { ...arqueos[0], resultado: resultadoArqueo(arqueos[0]) } : null,
    arqueosMes: { n: A.length, falto: A.reduce((x, a) => x + Math.min(0, netoArqueo(a)), 0), sobro: A.reduce((x, a) => x + Math.max(0, netoArqueo(a)), 0) },
    corte: calc.corteCaja()
  };
}
/** Movimientos de caja (todos o los de un día), con entradas y salidas del día. */
export async function libro(ctx, { dia } = {}) {
  exigirAdmin(ctx.actor);
  if (dia && !esDia(dia)) throw datosInvalidos("El día no es válido.");
  const calc = await calculosDe(ctx.db);
  const L = calc.libroCaja().filter(x => !dia || diaDe(x.fecha) === dia);
  return { dia: dia || null, movimientos: L, entradas: L.filter(x => x.valor > 0).reduce((a, x) => a + x.valor, 0), salidas: L.filter(x => x.valor < 0).reduce((a, x) => a - x.valor, 0) };
}
export async function arqueos(ctx) {
  exigirAdmin(ctx.actor);
  const calc = await calculosDe(ctx.db, ["cajamovs"]);
  return calc.arqueosCaja().map(a => ({ ...a, neto: netoArqueo(a), resultado: resultadoArqueo(a) }));
}
export async function cierreDelDia(ctx) {
  exigirAdmin(ctx.actor);
  const calc = await calculosDe(ctx.db);
  const x = calc.pendientesCierre();
  return {
    mensajeros: x.mens.map(({ m, debe }) => ({ id: m.id, nombre: m.nombre, debe })),
    cajasOficina: x.ofis.map(({ u, s }) => ({ uid: u.uid, nombre: u.nombre || u.email, saldo: s })),
    cajasOficinaConEfectivo: x.ofisEf.length,
    sinRemitente: x.sinRem.length, sinServicio: x.sinServ.length, enRuta: x.enRuta.length,
    cambiosPorEntregar: Object.values(calc.S.pedidos).filter(cambioPendiente).length,
    arqueoHoy: x.arqueoHoy, ultimoArqueo: x.a ? { fecha: x.a.fecha, resultado: resultadoArqueo(x.a) } : null,
    listo: !x.mens.length && !x.ofis.length && !x.sinRem.length && !x.sinServ.length
  };
}
/** Hora del último arqueo (el asistente la necesita para saber qué ya no se puede cambiar). */
export async function corte(ctx) {
  exigirOficina(ctx.actor);
  const calc = await calculosDe(ctx.db, ["cajamovs"]);
  return { corte: calc.corteCaja() };
}

/* ---------- entradas y salidas (administración) ---------- */
export async function registrarMovimiento(ctx, datos) {
  exigirAdmin(ctx.actor);
  const tipo = datos.tipo, cat = datos.cat || CATS_TIPO[tipo]?.[0];
  if (!CATS_TIPO[tipo]?.includes(cat)) throw datosInvalidos("Tipo de movimiento no válido.");
  const valor = valorPositivo(datos.valor);
  medioValido(datos.medio);
  const dia = diaValido(datos.dia);
  return enTransaccion(ctx, async t => {
    const per = CATS_PERSONA.includes(cat) ? datos.personaId || "" : "";
    if (CATS_PERSONA.includes(cat) && !(per && (await Mensajeros.existe(t.c, per)))) throw datosInvalidos("Elige la persona");
    const semana = CATS_SEMANA.includes(cat) ? datos.semana || "" : "";
    if (CATS_SEMANA.includes(cat) && !esDia(semana)) throw datosInvalidos("Elige la semana del sueldo");
    const calc = await calculosDe(t.c, ["cajamovs"]);
    exigirDiaAbierto(calc, dia);
    return guardar(t, "cajamovs", { id: nuevoId(), tipo, cat, personaId: per, valor, medio: datos.medio, concepto: texto(datos.concepto, 300), fecha: calc.fechaCaja(dia), semana });
  });
}
/** Quitar un movimiento de caja (también de cuentas internas o de una caja de oficina). Lo ya contado no se quita. */
export async function quitarMovimiento(ctx, id) {
  exigirAdmin(ctx.actor);
  return enTransaccion(ctx, async t => {
    const x = await Cajamovs.obtener(t.c, id, { bloquear: true });
    if (!x) throw noEncontrado("Ese movimiento ya no existe.");
    exigirNoContado(await calculosDe(t.c, ["cajamovs"]), x.fecha);
    const ad = x.cat === "devolucion" && x.adelantoId ? await Cajamovs.obtener(t.c, x.adelantoId) : null;
    if (ad) await actualizar(t, "cajamovs", ad.id, { devuelto: Math.max(0, (Number(ad.devuelto) || 0) - (Number(x.valor) || 0)) }, { antes: ad });
    await borrar(t, "cajamovs", id);
    return { id, enPapelera: true };
  });
}

/* ---------- bases para vueltos ---------- */
/** El asistente le da base a un mensajero desde su caja de oficina: efectivo, a su nombre y con la hora del momento. */
export async function baseDesdeOficina(ctx, { mensajeroId, valor, concepto }) {
  const a = ctx.actor;
  exigirOficina(a);
  const val = valorPositivo(valor);
  return enTransaccion(ctx, async t => {
    if (!(await Mensajeros.existe(t.c, mensajeroId))) throw datosInvalidos("Elige el mensajero");
    const mov = await guardar(t, "cajamovs", { id: nuevoId(), tipo: "sale", cat: "base", personaId: mensajeroId, valor: val, medio: "efectivo", concepto: texto(concepto, 200), fecha: ahora(), semana: "", porUid: a.uid, porNombre: a.nombre });
    const calc = await calculosDe(t.c);
    return { movimiento: mov, quedaEfectivo: calc.cajaOficina(a.uid).saldo.efectivo };
  });
}

/* ---------- cuentas internas ---------- */
export async function cuentas(ctx) {
  exigirOficina(ctx.actor);
  const calc = await calculosDe(ctx.db, ["cajamovs", "cuentas"]);
  return calc.listaOrdenada(calc.S.cuentas, "nombre").map(cu => {
    const s = calc.saldoCuenta(cu.id);
    const estado = cu.tipo === "base" ? { txt: "Base actual", valor: -s } : s > 0 ? { txt: "Te debe", valor: s } : s < 0 ? { txt: "Tiene a favor", valor: -s } : { txt: "En cero", valor: 0 };
    return { ...cu, saldo: s, estado, movimientos: calc.movsCuenta(cu.id).slice(0, 60) };
  });
}
export async function crearCuenta(ctx, { nombre, tipo }) {
  exigirAdmin(ctx.actor);
  const n = texto(nombre, 80);
  if (!n) throw datosInvalidos("Escribe el nombre");
  if (!TIPOS_CUENTA[tipo]) throw datosInvalidos("Tipo de cuenta no válido.");
  return enTransaccion(ctx, async t => {
    const cu = await Cuentas.guardar(t.c, { id: nuevoId(), nombre: n, tipo, creado: ahora() });
    t.cambios.add("cuentas");
    await registrar(t, "Creó la cuenta interna " + n);
    return cu;
  });
}
/** Crear JS Envíos, MT y Base de JS (cuando todavía no hay ninguna cuenta). */
export async function crearCuentasIniciales(ctx) {
  exigirAdmin(ctx.actor);
  return enTransaccion(ctx, async t => {
    if ((await Cuentas.listar(t.c, { limite: 1 })).length) throw conflicto("Ya hay cuentas internas creadas.");
    const out = [];
    for (const [nombre, tipo] of [["JS Envíos", "socio"], ["MT (tienda de ropa)", "socio"], ["Base de JS", "base"]]) out.push(await Cuentas.guardar(t.c, { id: nuevoId(), nombre, tipo, creado: ahora() }));
    t.cambios.add("cuentas");
    await registrar(t, "Creó las cuentas internas JS Envíos, MT y Base de JS");
    return out;
  });
}
/** Entrada o salida de una cuenta interna (la registra administración o un asistente). */
export async function movimientoCuenta(ctx, cuentaId, datos) {
  const a = ctx.actor;
  exigirOficina(a);
  const tipo = datos.tipo;
  if (!["entra", "sale"].includes(tipo)) throw datosInvalidos("Elige entrada o salida.");
  const valor = valorPositivo(datos.valor);
  const concepto = texto(datos.concepto, 300);
  if (!concepto) throw datosInvalidos("Escribe el motivo");
  medioValido(datos.medio);
  const dia = diaValido(datos.dia);
  return enTransaccion(ctx, async t => {
    const cu = await Cuentas.obtener(t.c, cuentaId);
    if (!cu) throw noEncontrado("Esa cuenta ya no existe.");
    const calc = await calculosDe(t.c, ["cajamovs"]);
    exigirDiaAbierto(calc, dia);
    const mov = await Cajamovs.guardar(t.c, { id: nuevoId(), tipo, cat: "interna", cuentaId, personaId: "", valor, medio: datos.medio, concepto, fecha: calc.fechaCaja(dia), porUid: a.uid, porNombre: a.nombre });
    t.cambios.add("cajamovs");
    await registrar(t, (tipo === "entra" ? "Entrada de " : "Salida a ") + cu.nombre + ": " + pesos(valor) + " · " + concepto);
    return mov;
  });
}

/* ---------- cajas de oficina ---------- */
async function asistente(c, auid) {
  const u = await Usuarios.obtener(c, auid);
  if (!u || u.rol !== "asistente") throw noEncontrado("Esa cuenta no es de un asistente.");
  return u;
}
/** Caja de oficina de un asistente: lo que tiene por medio y sus movimientos (de un día, si se pide). */
export async function cajaOficina(ctx, auid, { dia } = {}) {
  const a = ctx.actor;
  if (!a.esAdmin && !(a.esAsistente && a.uid === auid)) throw permisoNegado();
  if (dia && !esDia(dia)) throw datosInvalidos("El día no es válido.");
  const calc = await calculosDe(ctx.db);
  const C = calc.cajaOficina(auid), d = dia || hoy();
  return { uid: auid, saldo: C.saldo, total: C.total, hastaElDia: calc.sumaMedios(C.L.filter(x => diaDe(x.fecha) <= d)), dia: d, movimientos: C.L.filter(x => diaDe(x.fecha) === d) };
}
export async function cajasOficina(ctx, { dia } = {}) {
  exigirAdmin(ctx.actor);
  const calc = await calculosDe(ctx.db), d = dia || hoy();
  return calc.asistentes().map(u => { const C = calc.cajaOficina(u.uid); return { uid: u.uid, nombre: u.nombre || u.email, saldo: C.saldo, total: C.total, hastaElDia: calc.sumaMedios(C.L.filter(x => diaDe(x.fecha) <= d)), movimientos: C.L.filter(x => diaDe(x.fecha) === d) }; });
}
/** Administración le da base (efectivo) a un asistente. */
export async function baseOficina(ctx, auid, { valor, nota }) {
  exigirAdmin(ctx.actor);
  const val = valorPositivo(valor);
  return enTransaccion(ctx, async t => {
    await asistente(t.c, auid);
    const t0 = ahora();
    return guardar(t, "cajamovs", { id: nuevoId(), tipo: "base", cat: "oficina", personaUid: auid, personaId: "", valor: val, medio: "efectivo", concepto: texto(nota, 200), fecha: t0 + 1 });
  });
}
/** Recibir el cierre de una caja de oficina. Lo que pase de lo que debía tener:
    - efectivo: plata física de más → sobrante, entra a la caja;
    - Nequi y Bancolombia: cuentas compartidas con la caja general; el negativo es plata que ya salió de la caja,
      así que solo se deja su columna en 0 con un ajuste que no mueve la caja. */
export async function cierreOficina(ctx, auid, datos) {
  exigirAdmin(ctx.actor);
  const entregas = Object.keys(MEDIOS).map(m => [m, numero(datos[m]) || 0]);
  if (entregas.some(([, v]) => v < 0)) throw datosInvalidos("Los valores no pueden ser negativos");
  return enTransaccion(ctx, async t => {
    const u = await asistente(t.c, auid);
    const calc = await calculosDe(t.c);
    const C = calc.cajaOficina(auid);
    const excesos = entregas.map(([m, v]) => [m, Math.round(v - C.saldo[m])]).filter(([, x]) => x > 0);
    const sobs = excesos.filter(([m]) => m === "efectivo"), nivs = excesos.filter(([m]) => m !== "efectivo"), vals = entregas.filter(([, v]) => v > 0);
    if (!vals.length && !sobs.length && !nivs.length) throw datosInvalidos("Escribe un valor mayor a cero");
    const nota = texto(datos.nota, 200), t0 = ahora(), quien = u.nombre || u.email || "";
    for (const [medio, val] of sobs) await guardar(t, "cajamovs", { id: nuevoId(), tipo: "entra", cat: "sobrante", personaUid: auid, personaId: "", valor: val, medio, concepto: quien + (nota ? " · " + nota : ""), fecha: t0 });
    for (const [medio, val] of nivs) await guardar(t, "cajamovs", { id: nuevoId(), tipo: "base", cat: "oficina", nivel: true, personaUid: auid, personaId: "", valor: val, medio, concepto: "Pagó desde la cuenta de la empresa más de lo que registró que entró", fecha: t0 });
    for (const [medio, val] of vals) await guardar(t, "cajamovs", { id: nuevoId(), tipo: "entrega", cat: "oficina", personaUid: auid, personaId: "", valor: val, medio, concepto: nota, fecha: t0 + 1 });
    return { entregado: Object.fromEntries(vals), sobrante: Object.fromEntries(sobs), ajustes: Object.fromEntries(nivs) };
  });
}

/* ---------- arqueo ---------- */
export async function esperadoArqueo(ctx) {
  exigirAdmin(ctx.actor);
  const calc = await calculosDe(ctx.db);
  const x = calc.esperadoArqueo();
  return { esperado: x.e, oficina: x.of, sinCuenta: x.sinCuenta, total: Object.values(x.e).reduce((a, b) => a + b, 0) };
}
/** Guardar el arqueo: la diferencia con lo esperado queda como faltante o sobrante por medio y, desde ese momento,
    lo anterior ya no se puede cambiar (meta/caja.corte). */
export async function hacerArqueo(ctx, datos) {
  const a = ctx.actor;
  exigirAdmin(a);
  const contado = {};
  for (const k of Object.keys(MEDIOS)) {
    const v = datos[k];
    if (v === undefined || v === null || v === "") throw datosInvalidos("Escribe lo que contaste en cada medio (0 si no hay nada)");
    const n = Number(v);
    if (!Number.isFinite(n) || n < 0) throw datosInvalidos("Los valores no pueden ser negativos");
    contado[k] = Math.round(n);
  }
  return enTransaccion(ctx, async t => {
    await t.c.query("select pg_advisory_xact_lock(4242)"); // un arqueo a la vez
    const calc = await calculosDe(t.c);
    const { e, of } = calc.esperadoArqueo();
    const aid = nuevoId(), t0 = ahora(), nota = texto(datos.nota, 300), dif = {};
    for (const k of Object.keys(MEDIOS)) {
      const d = contado[k] - e[k];
      if (!d) continue;
      dif[k] = d;
      await guardar(t, "cajamovs", { id: nuevoId(), cat: "arqueo", tipo: d > 0 ? "entra" : "sale", valor: Math.abs(d), medio: k, arqueoId: aid, personaId: "", concepto: nota, fecha: t0, porNombre: a.nombre });
    }
    await Meta.guardarCorte(t.c, t0);
    t.cambios.add("meta");
    await guardar(t, "cajamovs", { id: aid, cat: "arqueo", tipo: "marca", valor: 0, medio: "", arqueoId: aid, personaId: "", esperado: e, contado, oficina: of, concepto: nota, fecha: t0, porNombre: a.nombre });
    const arqueo = { id: aid, fecha: t0, dif, esperado: e, contado };
    return { ...arqueo, resultado: resultadoArqueo(arqueo) };
  });
}
/** Deshacer el último arqueo: se quitan el conteo y sus diferencias, y la caja queda abierta hasta el arqueo anterior. */
export async function deshacerArqueo(ctx, id) {
  exigirAdmin(ctx.actor);
  return enTransaccion(ctx, async t => {
    await t.c.query("select pg_advisory_xact_lock(4242)");
    const S = (await calculosDe(t.c, ["cajamovs"])).S;
    const calc0 = crearCalculos(S, { corteRemoto: 0 }); // como en la app: administración no usa la hora guardada en meta/caja
    const lista = calc0.arqueosCaja(), a = lista.find(x => x.id === id);
    if (!a) throw noEncontrado("Ese arqueo ya no existe.");
    if (lista[0].id !== id) throw conflicto("Solo se puede deshacer el último arqueo.");
    const antes = calc0.corteCaja(a.docs);
    for (const d of a.docs) await borrar(t, "cajamovs", d);
    await Meta.guardarCorte(t.c, antes);
    t.cambios.add("meta");
    return { id, corte: antes };
  });
}

/* ---------- adelantos ---------- */
/** Devolvió la plata del adelanto (todo o una parte): entra hoy a la caja y se deja de descontar del sueldo. */
export async function devolucionAdelanto(ctx, id, { valor, medio }) {
  exigirAdmin(ctx.actor);
  medioValido(medio);
  return enTransaccion(ctx, async t => {
    const c = await Cajamovs.obtener(t.c, id, { bloquear: true });
    if (!c || c.cat !== "adelanto") throw noEncontrado("Ese adelanto ya no existe.");
    const resta = valorAdel(c), val = Math.round(numero(valor));
    if (!(val > 0)) throw datosInvalidos("Escribe un valor mayor a cero");
    if (val > resta) throw datosInvalidos("No puede devolver más de " + pesos(resta));
    const dev = await guardar(t, "cajamovs", { id: nuevoId(), tipo: "entra", cat: "devolucion", personaId: c.personaId, valor: val, medio, concepto: "Adelanto del " + hora(c.fecha), adelantoId: id, fecha: ahora(), semana: "" });
    await actualizar(t, "cajamovs", id, { devuelto: (Number(c.devuelto) || 0) + val }, { antes: c });
    return dev;
  });
}
/** Quitar un adelanto registrado por error. Si salió de una liquidación, la deuda vuelve al mensajero. */
export async function quitarAdelanto(ctx, id) {
  exigirAdmin(ctx.actor);
  return enTransaccion(ctx, async t => {
    const c = await Cajamovs.obtener(t.c, id, { bloquear: true });
    if (!c || c.cat !== "adelanto") throw noEncontrado("Ese adelanto ya no existe.");
    const liq = c.deLiquidacion ? await Liquidaciones.obtener(t.c, c.deLiquidacion) : null;
    const calc = await calculosDe(t.c, ["cajamovs", "liquidaciones"]);
    if (!liq && calc.yaContado(c.fecha)) throw yaContadoError("Ese adelanto ya se contó en un arqueo: si devolvió la plata, usa “Registrar devolución”.");
    if (liq && calc.liquidacionesDe(c.personaId)[0]?.id !== liq.id) throw conflicto("Ya hay una liquidación más nueva de este mensajero: usa “Registrar devolución” cuando pague.");
    if (Number(c.devuelto)) throw conflicto("Este adelanto ya tiene una devolución registrada: no se puede quitar.");
    // Si la pantalla ya devolvió la deuda a la liquidación (PATCH de compatibilidad), no se suma dos veces.
    if (liq && Number(liq.adelanto)) await actualizar(t, "liquidaciones", liq.id, { debe: (Number(liq.debe) || 0) + (Number(c.valor) || 0), adelanto: 0 }, { antes: liq });
    await borrar(t, "cajamovs", id);
    return { id, quitado: true };
  });
}


/* ---------- compatibilidad con la app interna actual ----------
   La pantalla de Caja todavía arma el cierre de una caja de oficina con varios POST /caja/movimientos
   (sobrante, ajuste de nivel y entrega) y escribe `devuelto` y la deuda de la liquidación por su cuenta.
   Estas funciones aceptan esas mismas piezas con las reglas del servidor; cuando la pantalla use
   POST /caja/oficinas/:uid/cierre, DELETE /caja/movimientos/:id y POST /caja/adelantos/:id/devolucion, sobran. */

/** Una pieza del cierre (o de la base) de una caja de oficina: administración, a nombre de un asistente. */
export async function piezaCajaOficina(ctx, datos) {
  exigirAdmin(ctx.actor);
  const cat = datos.cat, tipo = datos.tipo, nivel = !!datos.nivel;
  const valido = (cat === "sobrante" && tipo === "entra") || (cat === "oficina" && (["base", "sale", "entrega"].includes(tipo)));
  if (!valido) throw datosInvalidos("Tipo de movimiento no válido.");
  const val = valorPositivo(datos.valor);
  medioValido(datos.medio);
  return enTransaccion(ctx, async t => {
    await asistente(t.c, datos.personaUid);
    const fecha = Number.isFinite(numero(datos.fecha)) ? Math.min(numero(datos.fecha), ahora() + 1) : ahora(); // la hora la decide el servidor, sin pasar de ahora
    const doc = { id: nuevoId(), tipo, cat, personaUid: datos.personaUid, personaId: "", valor: val, medio: datos.medio, concepto: texto(datos.concepto, 300), fecha };
    if (cat === "oficina" && nivel) Object.assign(doc, { tipo: "base", nivel: true });
    return guardar(t, "cajamovs", doc);
  });
}
/** PATCH /caja/movimientos/:id con { devuelto }: el servidor lo deja al día al registrar o quitar la devolución.
    Se acepta sin cambiar nada si coincide; si no, se rechaza para que nadie cambie el saldo de un adelanto a mano. */
export async function confirmarDevuelto(ctx, id, { devuelto }) {
  exigirAdmin(ctx.actor);
  const c = await Cajamovs.obtener(ctx.db, id);
  if (!c || c.cat !== "adelanto") throw noEncontrado("Ese adelanto ya no existe.");
  // Vale lo que ya tiene (después de registrar una devolución) o lo que tendrá al quitar una de sus devoluciones.
  const actual = Number(c.devuelto) || 0, devs = await Cajamovs.listar(ctx.db, { filtro: { adelantoId: id, cat: "devolucion" } });
  const validos = [actual, ...devs.map(d => Math.max(0, actual - (Number(d.valor) || 0)))];
  if (!validos.includes(Math.round(numero(devuelto)))) throw conflicto("Lo devuelto de un adelanto lo calcula el servidor: usa “Registrar devolución”.");
  return c;
}
/** PATCH /liquidaciones/:id con { debe, adelanto: 0 } antes de quitar el adelanto que salió de ella.
    No cambia nada: el DELETE del adelanto devuelve la deuda en la misma transacción. Así, si el DELETE falla, todo queda igual. */
export async function confirmarQuitarAdelanto(ctx, id, { debe, adelanto }) {
  exigirAdmin(ctx.actor);
  const l = await Liquidaciones.obtener(ctx.db, id);
  if (!l) throw noEncontrado("Esa liquidación ya no existe.");
  const esperado = (Number(l.debe) || 0) + (Number(l.adelanto) || 0);
  if (Number(adelanto) !== 0 || Math.round(numero(debe)) !== esperado) throw conflicto("Las liquidaciones no se editan: reábrela o quita su adelanto.");
  return l;
}

/* ---------- movimientos de las cuentas internas (pestaña Cuentas), por páginas ---------- */
/** Filtra los movimientos internos (cat "interna") por día y medio, y arma una página. */
export function armarPaginaInternos(movs, { dia, medio, pagina, porPagina } = {}) {
  const lista = movs
    .filter(m => m.cat === "interna")
    .filter(m => !dia || diaDe(m.fecha) === dia)
    .filter(m => !medio || m.medio === medio)
    .sort((a, b) => b.fecha - a.fecha);
  const tam = Math.max(1, Math.min(100, Number(porPagina) || 10));
  const paginas = Math.max(1, Math.ceil(lista.length / tam));
  const actual = Math.min(Math.max(1, Number(pagina) || 1), paginas);
  return { movimientos: lista.slice((actual - 1) * tam, actual * tam), pagina: actual, porPagina: tam, total: lista.length, paginas };
}

/** GET /caja/movimientos/pagina: los movimientos de las cuentas internas, filtrados y por páginas. */
export async function paginaInternos(ctx, { dia, medio, pagina, porPagina } = {}) {
  exigirOficina(ctx.actor);
  if (dia && !esDia(dia)) throw datosInvalidos("El día no es válido (AAAA-MM-DD).");
  if (medio && !MEDIOS[medio]) throw datosInvalidos("El medio no es válido.");
  const movs = await Cajamovs.listar(ctx.db);
  return armarPaginaInternos(movs, { dia, medio, pagina, porPagina });
}
