/* Piezas de validación que se repiten. */
import { z } from "zod";
import { MEDIOS } from "../helpers/negocio.js";

export const id = z.string().trim().min(1).max(64);
export const texto = (max = 200) => z.string().trim().max(max);
export const pesos = z.coerce.number().int("Debe ser un valor en pesos, sin decimales").min(0, "No puede ser negativo").max(1_000_000_000);
export const medio = z.enum(MEDIOS);
export const email = z.string().trim().toLowerCase().pipe(z.email("Correo inválido")).refine(v => v.length <= 254);
export const telefono = z.string().trim().max(30).regex(/^[0-9+\-\s()]*$/, "Teléfono inválido");

export const paginacion = {
  limite: z.coerce.number().int().min(1).max(500).default(100),
  desde: z.coerce.number().int().min(0).default(0)
};

export const paramId = z.object({ id });
