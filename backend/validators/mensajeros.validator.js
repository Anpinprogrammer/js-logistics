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

/** Mi caja → Entregas del período: página (5 en celular, 10 en escritorio), búsqueda por guía o quien recibió, y método. */
export const entregasPeriodo = z.object({
  buscar: texto(60).optional(),
  metodo: z.enum(["todos", "efectivo", "transf_js", "transf_cliente", "devuelto"]).default("todos"),
  pagina: z.coerce.number().int().min(1).optional(),
  porPagina: z.coerce.number().int().min(1).max(100).optional()
});
