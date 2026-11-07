import { z } from "zod";
import { texto, pesos, telefono, paginacion } from "./comunes.js";

export const listar = z.object({ buscar: texto(80).optional(), ...paginacion });

export const crear = z.object({
  nombre: texto(120).min(1, "Escribe el nombre"),
  telefono: telefono.default(""),
  tarifa: pesos.default(0),
  // true = crear aunque haya otro parecido (la app avisa de repetidos)
  confirmarRepetido: z.boolean().default(false)
});

export const actualizar = z.object({
  nombre: texto(120).min(1).optional(),
  telefono: telefono.optional(),
  tarifa: pesos.optional()
});

export const movimientos = z.object({
  desde: z.coerce.date().optional(),
  hasta: z.coerce.date().optional(),
  limite: z.coerce.number().int().min(1).max(1000).default(200)
});
