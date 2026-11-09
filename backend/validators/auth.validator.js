import { z } from "zod";
import { email, token } from "./comunes.js";
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

const clave = z.string().min(CLAVE_MINIMA, `La contraseña debe tener al menos ${CLAVE_MINIMA} caracteres`).max(200);

/** Cambiar la contraseña con el token del correo (recuperación) o crearla (activación). */
export const restablecer = z.object({ token, clave });
export const activar = z.object({ token, clave });

export const paramToken = z.object({ token });
