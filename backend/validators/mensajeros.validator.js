import { z } from "zod";
import { texto, pesos, telefono } from "./comunes.js";
import { TIPOS_PERSONAL } from "../helpers/negocio.js";

export const crear = z.object({
  nombre: texto(120).min(1, "Escribe el nombre"),
  telefono: telefono.default(""),
  tipo: z.enum(TIPOS_PERSONAL).default("mensajero"),
  tarifa: pesos.default(0)
});

export const actualizar = z.object({
  nombre: texto(120).min(1).optional(),
  telefono: telefono.optional(),
  tipo: z.enum(TIPOS_PERSONAL).optional(),
  tarifa: pesos.optional(),
  activo: z.boolean().optional()
});

/** Personal JS: búsqueda, tipo y página (7 en escritorio, 4 en celular). */
export const paginaPersonal = z.object({
  buscar: texto(80).optional(),
  tipo: z.enum(TIPOS_PERSONAL).optional(),
  pagina: z.coerce.number().int().min(1).optional(),
  porPagina: z.coerce.number().int().min(1).max(100).optional()
});
