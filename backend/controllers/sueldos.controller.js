/* Sueldos: planilla de la semana, "Mi sueldo", días de pago fijo (jornadas) y sueldo anterior. Reglas en servicios/sueldos.js. */
import * as S from "../servicios/sueldos.js";
import { leerDe } from "../servicios/datos.js";
import { borrar, enTransaccion } from "../servicios/transaccion.js";
import { exigirAdmin } from "../servicios/contexto.js";
import { noEncontrado } from "../servicios/errores.js";
import { responder } from "./accion.js";

export const semana = responder((ctx, req) => S.semana(ctx, req.valido.query.semana));
export const deMensajero = responder((ctx, req) => S.sueldoDe(ctx, req.valido.params.id, req.valido.query.semana));

export const listarJornadas = responder(ctx => leerDe(ctx, "jornadas"), { clave: "jornadas" });
/** Crea o cambia el pago de un día, o el sueldo previo de una semana (previo: true). El id lo arma el servidor. */
export const ponerJornada = responder((ctx, req) => {
  const b = req.valido.body;
  return b.previo ? S.sueldoAnterior(ctx, b.personaId, b.dia, b) : S.marcarDia(ctx, b.personaId, b.dia, b);
}, { clave: "jornada" });
export const quitarJornada = responder(async (ctx, req) => {
  exigirAdmin(ctx.actor);
  return enTransaccion(ctx, async t => {
    const d = await borrar(t, "jornadas", req.valido.params.id);
    if (!d) throw noEncontrado("Ese día ya no está marcado.");
    return { id: req.valido.params.id, quitado: true };
  });
});
