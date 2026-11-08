/* Puente entre Express y la capa de servicios (servicios/*.js, con las reglas copiadas de app/js/app.js).
   - ctxDe(req): quién pide (actor), la base (query y transaccion) y el aviso en tiempo real.
   - responder(fn): corre el servicio y devuelve su resultado con las fechas en ISO 8601.
   Los servicios trabajan con fechas en milisegundos, como la app; la API siempre las entrega en ISO. */
import { query, transaccion } from "../config/db.js";
import { actorDe } from "../servicios/contexto.js";
import { eventos } from "../servicios/eventos.js";

export const ctxDe = req => ({ actor: actorDe(req.usuario), db: { query, transaccion }, eventos });

/** Campos que son una fecha y hora. 0 o vacío = sin fecha (null). */
const FECHAS = new Set(["fecha", "desde", "creado", "entregado", "cambioRecibido", "domiPagoFecha", "medioCambio", "corte", "actualizado"]);

export function aIso(x, clave) {
  if (clave && FECHAS.has(clave) && (typeof x === "number" || x === null)) return x > 0 ? new Date(x).toISOString() : null;
  if (x instanceof Date) return x.toISOString();
  if (Array.isArray(x)) return x.map(v => aIso(v));
  if (x && typeof x === "object") return Object.fromEntries(Object.entries(x).map(([k, v]) => [k, aIso(v, k)]));
  return x;
}

/** Un día AAAA-MM-DD de Colombia a partir de una fecha ISO o en milisegundos (la app interna manda `fecha`; los servicios usan `dia`). */
export function diaDeFecha(f) {
  if (f === undefined || f === null || f === "") return undefined;
  const ms = typeof f === "number" ? f : Date.parse(f);
  if (!Number.isFinite(ms)) return "x"; // lo rechaza diaValido con su mensaje
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Bogota" }).format(new Date(ms));
}

/**
 * Handler de Express para un servicio. fn(ctx, req) devuelve lo que se responde.
 * clave: envuelve el resultado ({ clave: resultado }). status: 201 al crear, 204 sin cuerpo.
 */
export const responder = (fn, { clave, status = 200 } = {}) => async (req, res) => {
  const r = await fn(ctxDe(req), req);
  if (status === 204) return res.status(204).end();
  res.status(status).json(aIso(clave ? { [clave]: r } : r));
};
