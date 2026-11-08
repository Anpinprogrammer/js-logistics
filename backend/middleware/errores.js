/* Ruta no encontrada y manejo central de errores.
   Respuesta: { error: { code, message, campos? } }. Nunca se envía la traza al cliente. */
import { HttpError } from "../helpers/errores.js";

export const rutaNoEncontrada = (req, _res, next) =>
  next(new HttpError(404, "RUTA_NO_ENCONTRADA", `No existe ${req.method} ${req.path}`));

// Errores de Postgres que son culpa de los datos enviados, no del servidor.
const ERRORES_PG = {
  "23505": [409, "DUPLICADO", "Ya existe un registro con esos datos"],
  "23503": [409, "RELACION", "El registro está relacionado con otro que no existe o que todavía lo usa"],
  "23514": [400, "REGLA_DB", "Un valor no cumple las reglas de la base de datos"],
  "22P02": [400, "FORMATO", "Un valor tiene un formato inválido"]
};

// eslint-disable-next-line no-unused-vars
export function manejarErrores(err, req, res, _next) {
  let status = 500, error = { code: "ERROR_INTERNO", message: "Error interno del servidor" };

  if (err instanceof HttpError) {
    status = err.status;
    error = { code: err.code, message: err.message, ...(err.campos ? { campos: err.campos } : {}), ...(err.detalle !== undefined ? { detalle: err.detalle } : {}) };
  } else if (err.type === "entity.parse.failed") {
    status = 400; error = { code: "JSON_INVALIDO", message: "El cuerpo de la solicitud no es JSON válido" };
  } else if (err.type === "entity.too.large") {
    status = 413; error = { code: "MUY_GRANDE", message: "La solicitud es demasiado grande" };
  } else if (ERRORES_PG[err.code]) {
    const [s, code, message] = ERRORES_PG[err.code];
    status = s; error = { code, message };
  }

  if (status >= 500) console.error(`[${req.method} ${req.originalUrl}]`, err);
  res.status(status).json({ error });
}
