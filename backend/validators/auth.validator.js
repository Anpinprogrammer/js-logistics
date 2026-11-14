import { z } from "zod";
import { email, id, token } from "./comunes.js";
import { CLAVE_MINIMA } from "../helpers/claves.js";

export const ingreso = z.object({
  email,
  clave: z.string().min(1, "Escribe la contraseña").max(200)
});

export const cambiarMiClave = z.object({
  claveActual: z.string().min(1).max(200),
  claveNueva: z.string().min(CLAVE_MINIMA, `La contraseña debe tener al menos ${CLAVE_MINIMA} caracteres`).max(200)
});

/** Pedir un enlace de recuperación. La respuesta es la misma exista o no la cuenta. */
export const recuperar = z.object({ email });

/** Administración: manda el enlace a una cuenta concreta (por id o por correo). */
export const enviarReset = z.object({
  usuarioId: id.optional(),
  email: email.optional()
}).refine(d => d.usuarioId || d.email, { message: "Indica el usuario o el correo", path: ["email"] });

/** Administración: lote de correos de restablecimiento (máximo 100, sin repetidos). */
export const enviarResetMasivo = z.object({
  emails: z.array(email).min(1, "Selecciona al menos un correo").max(100, "Máximo 100 correos por lote")
    .transform(lista => [...new Set(lista)])
});

const clave = z.string().min(CLAVE_MINIMA, `La contraseña debe tener al menos ${CLAVE_MINIMA} caracteres`).max(200);

/** Cambiar la contraseña con el token del correo (recuperación) o crearla (activación). */
export const restablecer = z.object({ token, clave });
export const activar = z.object({ token, clave });
/** Activación con los nombres de la API nueva (`newPassword`); comparte el mismo enlace de un solo uso. */
export const activarCuenta = z.object({ token, newPassword: clave });

export const paramToken = z.object({ token });

/** Cambiar la contraseña con el código de 6 dígitos que llegó al correo. */
export const restablecerConCodigo = z.object({
  email,
  codigo: z.string().trim().regex(/^\d{6}$/, "El código tiene 6 números"),
  clave
});
