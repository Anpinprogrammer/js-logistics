/* Esquemas del chat. El historial lo guarda el navegador y lo manda completo; el servidor solo lo valida. */
import { z } from "zod";
import { limpiarTexto } from "../helpers/textoSeguro.js";

const mensaje = z.object({
  rol: z.enum(["user", "assistant"]),
  // Se quitan los caracteres invisibles ANTES de medir y de llegar al modelo (instrucciones escondidas)
  contenido: z.string().max(8000).transform(limpiarTexto).pipe(z.string().trim().min(1, "El mensaje no puede estar vacío").max(2000, "El mensaje es muy largo (máximo 2000 caracteres)"))
});

export const mensajes = z.object({
  mensajes: z.array(mensaje).min(1).max(20, "La conversación es muy larga: empieza una nueva")
    .refine(m => m.at(-1)?.rol === "user", "El último mensaje debe ser del cliente")
    .refine(m => m[0]?.rol === "user", "La conversación debe empezar con un mensaje del cliente")
}).strict();

/** Token del borrador: base64url de 24 bytes (32 caracteres). */
export const paramBorrador = z.object({ id: z.string().regex(/^[A-Za-z0-9_-]{20,64}$/, "El resumen no es válido") });
