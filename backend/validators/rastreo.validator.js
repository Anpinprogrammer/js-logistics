/* Esquema del rastreo público: solo la guía, con el formato JS-00001. */
import { z } from "zod";

export const paramGuia = z.object({ guia: z.string().trim().toUpperCase().regex(/^JS-\d{1,10}$/, "El número de guía debe ser como JS-00001") });
