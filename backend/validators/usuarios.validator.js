import { z } from "zod";
import { id, email, texto } from "./comunes.js";
import { ROLES } from "../helpers/negocio.js";
import { CLAVE_MINIMA } from "../helpers/claves.js";

const clave = z.string().min(CLAVE_MINIMA, `La contraseña debe tener al menos ${CLAVE_MINIMA} caracteres`).max(200);

export const crear = z.object({
  email,
  nombre: texto(120).default(""),
  rol: z.enum(ROLES),
  clave,
  clienteId: id.nullish(),
  mensajeroId: id.nullish()
}).refine(d => d.rol !== "cliente" || d.clienteId, { message: "Una cuenta de cliente necesita el cliente", path: ["clienteId"] });

export const actualizar = z.object({
  nombre: texto(120).optional(),
  rol: z.enum(ROLES).optional(),
  clienteId: id.nullable().optional(),
  mensajeroId: id.nullable().optional(),
  activo: z.boolean().optional()
});

export const nuevaClave = z.object({ clave });
