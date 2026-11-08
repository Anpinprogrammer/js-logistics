/* Historial de cambios, papelera, respaldo, sincronización completa y avisos en tiempo real. Reglas en servicios/datos.js. */
import * as D from "../servicios/datos.js";
import { eventos } from "../servicios/eventos.js";
import { responder, ctxDe } from "./accion.js";

export const historial = responder((ctx, req) => D.historial(ctx, req.valido.query), { clave: "cambios" });
export const anotar = responder((ctx, req) => D.anotar(ctx, req.valido.body), { status: 201 });

export const papelera = responder(ctx => D.papelera(ctx), { clave: "papelera" });
export const restaurar = responder((ctx, req) => D.restaurar(ctx, req.valido.params.id));
export const eliminarDefinitivo = responder((ctx, req) => D.eliminarDefinitivo(ctx, req.valido.params.id));
export const vaciarPapelera = responder(ctx => D.eliminarDefinitivo(ctx));

export const exportar = responder(ctx => D.exportar(ctx));
export const espacio = responder(ctx => D.espacio(ctx));

/** Todo lo que la cuenta puede ver, con la forma de la app ({ coleccion: { id: documento } }). */
export const sincronizar = responder(ctx => D.sincronizar(ctx));

/** Server-Sent Events: avisa qué colecciones cambiaron para que la pantalla vuelva a pedirlas. */
export function escuchar(req, res) {
  eventos.conectar(req, res, D.visiblesDe(ctxDe(req).actor));
}
