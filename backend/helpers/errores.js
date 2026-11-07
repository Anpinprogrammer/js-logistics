/* Error con código HTTP. Los controladores lanzan esto y el middleware de errores responde
   con la forma { error: { code, message, campos? } }. `code` es estable para que el frontend decida
   (por ejemplo, la cola sin señal no reintenta los 4xx). */
export class HttpError extends Error {
  constructor(status, code, mensaje, campos) {
    super(mensaje);
    this.status = status;
    this.code = code;
    this.campos = campos;
  }
}

export const noAutenticado = (m = "Inicia sesión para continuar") => new HttpError(401, "NO_AUTENTICADO", m);
export const prohibido = (m = "No tienes permiso para hacer esto") => new HttpError(403, "PROHIBIDO", m);
export const noEncontrado = (m = "No existe") => new HttpError(404, "NO_ENCONTRADO", m);
export const conflicto = (m, code = "CONFLICTO") => new HttpError(409, code, m);
export const invalido = (m, campos) => new HttpError(400, "DATOS_INVALIDOS", m, campos);
