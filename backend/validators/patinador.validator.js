/* Caja del patinador: lo que anota en la calle y la consulta de su caja. */
import { z } from "zod";
import { id, pesos } from "./comunes.js";

/** Un pago recibido. La hora la pone el servidor y no se aceptan campos de más. `mensajeroId` solo lo manda
    administración (en qué caja anota); el patinador anota siempre en la suya y si lo manda se rechaza. */
export const registro = z.object({
  mensajeroId: id.optional(),
  clienteId: id,
  concepto: z.string().trim().min(1, "Escribe el concepto").max(80, "El concepto es muy largo (máximo 80 letras)"),
  valor: pesos.refine(v => v > 0, "Escribe un valor mayor a cero")
}).strict();

/** El patinador ve su caja; la oficina dice de cuál patinador (mensajeroId). */
export const caja = z.object({
  mensajeroId: id.optional(),
  // Filtros del historial (celular): texto en el cliente o el concepto, ingresos (pagos) o salidas (entregas a administración) y un día de Colombia.
  buscar: z.string().trim().max(60).optional(),
  tipo: z.enum(["todos", "ingresos", "salidas"]).default("todos"),
  dia: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Fecha inválida").optional(),
  pagina: z.coerce.number().int().min(1).default(1),
  porPagina: z.coerce.number().int().min(1).max(100).default(8)
});

/** Solicitudes de recogida: `page` y `limit` (la pantalla pide 5 en el celular y 10 en el computador). */
export const solicitudes = z.object({
  mensajeroId: id.optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(10)
});
