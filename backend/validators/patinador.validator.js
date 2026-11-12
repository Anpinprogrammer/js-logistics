/* Caja del patinador: lo que anota en la calle y la consulta de su caja. */
import { z } from "zod";
import { id, pesos } from "./comunes.js";

/** Un pago recibido. El patinador y la hora los pone el servidor, por eso no se aceptan campos de más. */
export const registro = z.object({
  clienteId: id,
  concepto: z.string().trim().min(1, "Escribe el concepto").max(80, "El concepto es muy largo (máximo 80 letras)"),
  valor: pesos.refine(v => v > 0, "Escribe un valor mayor a cero")
}).strict();

/** El patinador ve su caja; la oficina dice de cuál patinador (mensajeroId). */
export const caja = z.object({
  mensajeroId: id.optional(),
  pagina: z.coerce.number().int().min(1).default(1),
  porPagina: z.coerce.number().int().min(1).max(100).default(8)
});
