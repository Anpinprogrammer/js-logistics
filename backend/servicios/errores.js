/* Errores de los servicios con los mismos mensajes de la app. Salen con la forma de siempre:
   { error: { code, message, detalle? } } (ver helpers/errores.js). */
import { HttpError } from "../helpers/errores.js";

export const datosInvalidos = (m, detalle) => new HttpError(400, "DATOS_INVALIDOS", m, undefined, detalle);
export const permisoNegado = (m = "Tu cuenta no tiene permiso para hacer esto.") => new HttpError(403, "PROHIBIDO", m);
export const noEncontrado = (m = "No existe.") => new HttpError(404, "NO_ENCONTRADO", m);
export const conflicto = (m, detalle, code = "CONFLICTO") => new HttpError(409, code, m, undefined, detalle);
export const yaContadoError = m => new HttpError(409, "YA_CONTADO", m);
