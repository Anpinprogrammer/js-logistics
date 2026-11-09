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

/* Enlaces de activación y de contraseña que se mandan por correo. */
export const enlaceInvalido = (m = "Este enlace no es válido, ya se usó o lo reemplazó uno más reciente. Usa el último correo que te llegó o pide uno nuevo.") =>
  new HttpError(400, "ENLACE_INVALIDO", m);
export const enlaceVencido = (m = "Este enlace venció. Pide uno nuevo.") =>
  new HttpError(410, "ENLACE_VENCIDO", m);
export const cuentaInactiva = (m = "Esta cuenta está desactivada. Pídele a administración que la active.") =>
  new HttpError(403, "CUENTA_INACTIVA", m);
export const correoNoConfigurado = (m = "El envío de correos no está configurado. Avísale a administración.") =>
  new HttpError(503, "CORREO_NO_CONFIGURADO", m);
export const correoFallo = (m = "No se pudo enviar el correo. Intenta de nuevo en unos minutos.") =>
  new HttpError(502, "CORREO_FALLO", m);
