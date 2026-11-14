/* Liquidaciones de los mensajeros: cerrar el período, reabrirlo y el período abierto. Reglas en servicios/mensajeros.js. */
import * as M from "../servicios/mensajeros.js";
import { confirmarQuitarAdelanto } from "../servicios/caja.js";
import { leerDe } from "../servicios/datos.js";
import { responder } from "./accion.js";

export const listar = responder(ctx => leerDe(ctx, "liquidaciones"), { clave: "liquidaciones" });
export const pagina = responder((ctx, req) => M.paginaLiquidaciones(ctx, req.valido.query));
/** Lo que manda la app interna (sus totales, el adelanto que calculó) no se usa: el servidor vuelve a calcular todo.
    Solo cuenta: mensajero, entrega final, medio, si lo que queda debiendo pasa a adelanto y a qué semana. */
export const crear = responder((ctx, req) => {
  const b = req.valido.body;
  const pasarAdelanto = b.pasarAdelanto ?? (b.adelanto === undefined ? true : Number(b.adelanto) > 0);
  return M.liquidar(ctx, { mensajeroId: b.mensajeroId, entregaFinal: b.entregaFinal, medio: b.medio || "efectivo", pasarAdelanto, semana: b.semana || b.semanaAdelanto || undefined });
}, { status: 201 });
export const ajustar = responder((ctx, req) => confirmarQuitarAdelanto(ctx, req.valido.params.id, req.valido.body), { clave: "liquidacion" });
export const reabrir = responder((ctx, req) => M.reabrirLiquidacion(ctx, req.valido.params.id));
export const periodo = responder((ctx, req) => M.periodo(ctx, req.valido.params.id), { clave: "periodo" });
export const entregasPeriodo = responder((ctx, req) => M.entregasPeriodo(ctx, req.valido.params.id, req.valido.query));
export const resumen = responder(ctx => M.resumenMensajeros(ctx), { clave: "mensajeros" });
