import { z } from "zod";
import { id, email, texto } from "./comunes.js";
import { ROLES } from "../helpers/negocio.js";
import { CLAVE_MINIMA } from "../helpers/claves.js";

const clave = z.string().min(CLAVE_MINIMA, `La contraseña debe tener al menos ${CLAVE_MINIMA} caracteres`).max(200);

export const crear = z.object({
  email,
  // Nombre manual (compatibilidad); con entityId el servidor lo toma de la ficha vinculada.
  nombre: texto(120).default(""),
  rol: z.enum(ROLES).optional(),
  role: z.enum(ROLES).optional(),
  // Opcional: sin contraseña la cuenta queda pendiente y se manda un enlace de activación.
  clave: clave.optional(),
  clienteId: id.nullish(),
  mensajeroId: id.nullish(),
  entityId: id.nullish()
}).refine(d => d.rol || d.role, { message: "Elige el rol", path: ["rol"] })
  .refine(d => (d.rol || d.role) !== "cliente" || d.clienteId || d.entityId, { message: "Una cuenta de cliente necesita el cliente", path: ["entityId"] });

export const actualizar = z.object({
  nombre: texto(120).optional(),
  rol: z.enum(ROLES).optional(),
  clienteId: id.nullable().optional(),
  mensajeroId: id.nullable().optional(),
  activo: z.boolean().optional()
});

export const nuevaClave = z.object({ clave });

/** Sub-pestaña Acceso de Personal: búsqueda, rol, 5 filas en celular y 10 en computador. */
export const paginaAccesos = z.object({
  buscar: texto(80).optional(),
  rol: z.enum(ROLES).optional(),
  pagina: z.coerce.number().int().min(1).optional(),
  porPagina: z.coerce.number().int().min(1).max(100).optional()
});
