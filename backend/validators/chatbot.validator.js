/* Esquemas del chat. El historial lo guarda el navegador y lo manda completo; el servidor solo lo valida. */
import { z } from "zod";

const mensaje = z.object({
  rol: z.enum(["user", "assistant"]),
  contenido: z.string().trim().min(1, "El mensaje no puede estar vacío").max(2000, "El mensaje es muy largo (máximo 2000 caracteres)")
});

export const mensajes = z.object({
  mensajes: z.array(mensaje).min(1).max(20, "La conversación es muy larga: empieza una nueva")
    .refine(m => m.at(-1)?.rol === "user", "El último mensaje debe ser del cliente")
    .refine(m => m[0]?.rol === "user", "La conversación debe empezar con un mensaje del cliente")
}).strict();
