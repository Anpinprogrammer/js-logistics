/* Variables de entorno validadas al arrancar: si falta algo, el servidor no sube y dice qué falta. */
import { z } from "zod";

const esquema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(4000),
  DATABASE_URL: z.string().min(1, "DATABASE_URL es obligatoria"),
  DATABASE_SSL: z.enum(["true", "false"]).default("false").transform(v => v === "true"),
  // Certificado de la base (PEM). En Supabase: Database Settings → SSL Configuration → Download certificate.
  DATABASE_CA: z.string().optional().transform(v => v ? v.replace(/\\n/g, "\n") : undefined),
  JWT_SECRET: z.string().min(32, "JWT_SECRET debe tener al menos 32 caracteres"),
  JWT_EXPIRA: z.string().default("12h"),
  CORS_ORIGENES: z.string().default("http://localhost:5173")
    .transform(v => v.split(",").map(s => s.trim()).filter(Boolean)),
  COOKIE_NOMBRE: z.string().default("jsl_sesion"),
  COOKIE_DOMINIO: z.string().optional().transform(v => v || undefined),
  // lax si el frontend y la API están en el mismo sitio (recomendado); none solo si están en dominios distintos
  COOKIE_SAMESITE: z.enum(["lax", "strict", "none"]).default("lax")
});

const r = esquema.safeParse(process.env);
if (!r.success) {
  const detalle = r.error.issues.map(i => `  - ${i.path.join(".")}: ${i.message}`).join("\n");
  console.error(`Configuración inválida. Revisa el archivo .env:\n${detalle}`);
  process.exit(1);
}

export const env = Object.freeze({ ...r.data, esProduccion: r.data.NODE_ENV === "production" });
