/* Error con código HTTP. Los controladores lanzan esto y el middleware de errores responde
   con la forma { error: { code, message, campos? } }. `code` es estable para que el frontend decida
   (por ejemplo, la cola sin señal no reintenta los 4xx). */
export class HttpError extends Error {
  constructor(status, code, mensaje, campos, detalle) {
    super(mensaje);
    this.status = status;
    this.code = code;
    this.campos = campos;
    this.detalle = detalle; // datos extra para la pantalla (por ejemplo, los clientes parecidos)
  }
}

export const noAutenticado = (m = "Inicia sesión para continuar") => new HttpError(401, "NO_AUTENTICADO", m);
export const prohibido = (m = "No tienes permiso para hacer esto") => new HttpError(403, "PROHIBIDO", m);
export const noEncontrado = (m = "No existe") => new HttpError(404, "NO_ENCONTRADO", m);
export const conflicto = (m, code = "CONFLICTO") => new HttpError(409, code, m);
export const invalido = (m, campos) => new HttpError(400, "DATOS_INVALIDOS", m, campos);

/** Lo que ya se contó en un arqueo no se cambia (en la app: avisoContado()). */
export const yaContado = m => new HttpError(409, "YA_CONTADO", m);
