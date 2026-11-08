/* Dinero que entregan los mensajeros (recaudos). Las reglas están en servicios/mensajeros.js. */
import * as M from "../servicios/mensajeros.js";
import { cambiarMedio } from "../servicios/movimientos.js";
import { leerDe } from "../servicios/datos.js";
import { responder } from "./accion.js";

export const listar = responder(ctx => leerDe(ctx, "recaudos"), { clave: "recaudos" });
/** Responde { recaudo, debe }: lo que el mensajero queda debiendo después de entregar. */
export const crear = responder((ctx, req) => M.recibir(ctx, req.valido.body), { status: 201 });
export const actualizar = responder((ctx, req) => {
  const b = req.valido.body, id = req.valido.params.id;
  const soloMedio = Object.keys(b).filter(k => b[k] !== undefined).length === 1 && b.medio !== undefined;
  return soloMedio ? cambiarMedio(ctx, "recaudos", id, b) : M.editarRecaudo(ctx, id, b);
}, { clave: "recaudo" });
export const eliminar = responder((ctx, req) => M.quitarRecaudo(ctx, req.valido.params.id));
