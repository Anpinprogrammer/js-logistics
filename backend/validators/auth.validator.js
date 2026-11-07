import { z } from "zod";
import { email } from "./comunes.js";
import { CLAVE_MINIMA } from "../helpers/claves.js";

export const ingreso = z.object({
  email,
  clave: z.string().min(1, "Escribe la contraseña").max(200)
});

export const cambiarMiClave = z.object({
  claveActual: z.string().min(1).max(200),
  claveNueva: z.string().min(CLAVE_MINIMA, `La contraseña debe tener al menos ${CLAVE_MINIMA} caracteres`).max(200)
});
