/* Caja: resumen, libro, cierre del día, entradas y salidas, bases, cajas de oficina, arqueos y adelantos.
   Las reglas están en servicios/caja.js. */
import * as C from "../servicios/caja.js";
import { leerDe } from "../servicios/datos.js";
import { permisoNegado } from "../servicios/errores.js";
import { responder, diaDeFecha } from "./accion.js";

const conDia = b => ({ ...b, dia: b.dia ?? diaDeFecha(b.fecha) });

export const resumen = responder(ctx => C.resumen(ctx));
export const libro = responder((ctx, req) => C.libro(ctx, req.valido.query));
export const cierreDelDia = responder(ctx => C.cierreDelDia(ctx));
export const corte = responder(ctx => C.corte(ctx));

export const listar = responder(ctx => leerDe(ctx, "cajamovs"), { clave: "movimientos" });
export const paginaInternos = responder((ctx, req) => C.paginaInternos(ctx, req.valido.query));

/** Un solo POST para todo lo que la app interna escribe en la caja; cada caso va a su regla. */
export const crear = responder(async (ctx, req) => {
  const b = req.valido.body, a = ctx.actor;
  if (b.cat === "interna") return C.movimientoCuenta(ctx, b.cuentaId, conDia(b));
  if (b.cat === "devolucion" && b.adelantoId) return C.devolucionAdelanto(ctx, b.adelantoId, b);
  if (b.cat === "oficina" || b.cat === "sobrante") return C.piezaCajaOficina(ctx, { ...b, fecha: undefined });
  if (b.cat === "base" && !a.esAdmin) return (await C.baseDesdeOficina(ctx, { mensajeroId: b.personaId, valor: b.valor, concepto: b.concepto })).movimiento;
  return C.registrarMovimiento(ctx, conDia(b));
}, { clave: "movimiento", status: 201 });
/** Los movimientos de caja no se editan (se quitan y se registran de nuevo). Solo se acepta confirmar `devuelto` de un adelanto. */
export const actualizar = responder((ctx, req) => {
  const b = req.valido.body;
  if (b.devuelto === undefined) throw permisoNegado("Los movimientos de caja no se editan: quítalo y regístralo de nuevo.");
  return C.confirmarDevuelto(ctx, req.valido.params.id, b);
}, { clave: "movimiento" });
/** Quitar: un adelanto devuelve la deuda a su liquidación; los demás, con sus reglas de arqueo. */
export const eliminar = responder(async (ctx, req) => {
  const id = req.valido.params.id;
  const r = await ctx.db.query(`SELECT cat FROM cajamovs WHERE id = $1`, [id]);
  return r.rows[0]?.cat === "adelanto" ? C.quitarAdelanto(ctx, id) : C.quitarMovimiento(ctx, id);
});

export const base = responder(async (ctx, req) => C.baseDesdeOficina(ctx, req.valido.body), { status: 201 });

export const oficinas = responder((ctx, req) => C.cajasOficina(ctx, req.valido.query), { clave: "oficinas" });
export const oficina = responder((ctx, req) => C.cajaOficina(ctx, req.valido.params.uid, req.valido.query));
export const baseOficina = responder((ctx, req) => C.baseOficina(ctx, req.valido.params.uid, req.valido.body), { clave: "movimiento", status: 201 });
export const cierreOficina = responder((ctx, req) => C.cierreOficina(ctx, req.valido.params.uid, req.valido.body), { status: 201 });

export const esperado = responder(ctx => C.esperadoArqueo(ctx));
export const arqueos = responder(ctx => C.arqueos(ctx), { clave: "arqueos" });
export const arquear = responder((ctx, req) => {
  const b = req.valido.body, contado = b.contado || b;
  return C.hacerArqueo(ctx, { efectivo: contado.efectivo, nequi: contado.nequi, bancolombia: contado.bancolombia, nota: b.nota });
}, { clave: "arqueo", status: 201 });
export const deshacerArqueo = responder((ctx, req) => C.deshacerArqueo(ctx, req.valido.params.id));

export const devolucion = responder((ctx, req) => C.devolucionAdelanto(ctx, req.valido.params.id, req.valido.body), { clave: "movimiento", status: 201 });
export const quitarAdelanto = responder((ctx, req) => C.quitarAdelanto(ctx, req.valido.params.id));
