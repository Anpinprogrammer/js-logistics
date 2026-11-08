/* Sueldos: planilla de la semana, "Mi sueldo" del mensajero, días de pago fijo y sueldo anterior al empalme. */
import { Mensajeros, Jornadas } from "../models/documentos.js";
import { PAGO_FIJO, TIPOS } from "../helpers/constantes.js";
import { hoy, semanaDe, esDia } from "../helpers/fechas.js";
import { datosInvalidos, noEncontrado, permisoNegado } from "./errores.js";
import { enTransaccion, guardar, borrar } from "./transaccion.js";
import { calculosDe, exigirAdmin, esMio, numero } from "./contexto.js";
import { cerrado, servicio, diaSueldo, tipoDe, valorAdel } from "../helpers/calculos.js";

const COLS = ["pedidos", "mensajeros", "jornadas", "cajamovs", "movimientos"];
const persona = m => ({ id: m.id, nombre: m.nombre, tipo: tipoDe(m), tipoNombre: TIPOS[tipoDe(m)], tarifa: Number(m.tarifa) || 0 });
function semanaValida(sem) {
  const s = sem || semanaDe(hoy());
  if (!esDia(s)) throw datosInvalidos("La semana no es válida (AAAA-MM-DD).");
  return semanaDe(s); // cualquier día lleva al sábado en que empieza su semana
}

/** Planilla de la semana (administración). */
export async function semana(ctx, sem) {
  exigirAdmin(ctx.actor);
  const calc = await calculosDe(ctx.db, COLS);
  const R = calc.resumenSemana(semanaValida(sem));
  const tot = R.filas.reduce((a, f) => ({ total: a.total + f.total, adel: a.adel + f.adel, pagado: a.pagado + f.pagado, neto: a.neto + f.neto }), { total: 0, adel: 0, pagado: 0, neto: 0 });
  return {
    semana: R.sem, dias: R.dias, totales: tot,
    filas: R.filas.map(f => ({ ...f, m: undefined, persona: persona(f.m), jornadas: R.dias.map(d => calc.jornada(f.m.id, d)), adelantos: f.adelantos.map(c => ({ ...c, pendiente: valorAdel(c) })) })),
    calculoDueno: R.porDia.map((x, i) => ({ dia: R.dias[i], dom30: x.dom30, propios: x.propios, ganancias: x.ganancias, desc: x.desc, nMens: x.nMens, fijos: x.fijos, sueldo: x.javier })),
    semanasAdelanto: calc.semanasAdelanto()
  };
}

/** "Mi sueldo": lo ve el propio mensajero; administración puede ver el de cualquiera. */
export async function sueldoDe(ctx, mid, sem) {
  const a = ctx.actor;
  if (!a.esAdmin && !esMio(a, mid)) throw permisoNegado();
  const calc = await calculosDe(ctx.db, COLS);
  const m = calc.S.mensajeros[mid];
  if (!m) throw noEncontrado("Esa persona no está en Personal.");
  const R = calc.sueldoPersonaSemana(mid, semanaValida(sem));
  const ent = Object.values(calc.S.pedidos).filter(p => cerrado(p) && p.mensajeroId === mid);
  return {
    persona: persona(m), ...R,
    porDia: R.dias.map((d, i) => { const ps = ent.filter(p => diaSueldo(p) === d); return { dia: d, entregas: ps.length, domicilios: ps.reduce((x, p) => x + servicio(p), 0), sueldo: R.vals[i] }; }),
    anteriores: calc.pendienteAnterior(mid, R.sem).map(r => ({ semana: r.sem, neto: r.neto }))
  };
}

/** Marcar un día trabajado (patinadores, oficina y empresa). Sin valor, se usa su pago por día. */
export async function marcarDia(ctx, personaId, dia, { valor } = {}) {
  exigirAdmin(ctx.actor);
  if (!esDia(dia)) throw datosInvalidos("El día no es válido.");
  if (dia > hoy()) throw datosInvalidos("No se pueden marcar días que no han llegado.");
  return enTransaccion(ctx, async t => {
    const m = await Mensajeros.obtener(t.c, personaId);
    if (!m) throw noEncontrado("Esa persona no está en Personal.");
    if (!PAGO_FIJO.includes(tipoDe(m))) throw datosInvalidos("Solo patinadores, oficina y empresa tienen pago por día.");
    const v = valor === undefined || valor === null || valor === "" ? Number(m.tarifa) : numero(valor);
    if (!(v > 0)) throw datosInvalidos("Pon primero el pago por día de " + m.nombre);
    const id = personaId + "_" + dia;
    return guardar(t, "jornadas", { id, personaId, dia, valor: v });
  });
}
export async function quitarDia(ctx, personaId, dia) {
  exigirAdmin(ctx.actor);
  return enTransaccion(ctx, async t => {
    const d = await borrar(t, "jornadas", personaId + "_" + dia);
    return { quitado: !!d };
  });
}
/** "Otro valor": el valor de cada día de la semana. Vacío o 0 = no trabajó. */
export async function valoresSemana(ctx, personaId, { dias }) {
  exigirAdmin(ctx.actor);
  if (!dias || typeof dias !== "object") throw datosInvalidos("Faltan los días.");
  return enTransaccion(ctx, async t => {
    if (!(await Mensajeros.existe(t.c, personaId))) throw noEncontrado("Esa persona no está en Personal.");
    let n = 0;
    for (const [dia, valor] of Object.entries(dias)) {
      if (!esDia(dia)) throw datosInvalidos("El día " + dia + " no es válido.");
      const id = personaId + "_" + dia, val = numero(valor) || 0, actual = await Jornadas.obtener(t.c, id);
      if (val === (Number(actual?.valor) || 0)) continue;
      if (val > 0) await guardar(t, "jornadas", { id, personaId, dia, valor: val }); else await borrar(t, "jornadas", id);
      n++;
    }
    return { cambiados: n };
  });
}
/** Sueldo que alguien ya llevaba ganado esa semana antes de usar la app. 0 lo quita. */
export async function sueldoAnterior(ctx, personaId, sem, { valor }) {
  exigirAdmin(ctx.actor);
  const s = semanaValida(sem);
  return enTransaccion(ctx, async t => {
    if (!(await Mensajeros.existe(t.c, personaId))) throw noEncontrado("Esa persona no está en Personal.");
    const id = personaId + "_previo_" + s, val = numero(valor) || 0;
    if (val > 0) return guardar(t, "jornadas", { id, personaId, dia: s, valor: val, previo: true, nota: "Sueldo anterior" });
    await borrar(t, "jornadas", id);
    return { id, quitado: true };
  });
}
