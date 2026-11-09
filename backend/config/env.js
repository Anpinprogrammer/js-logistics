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
  COOKIE_SAMESITE: z.enum(["lax", "strict", "none"]).default("lax"),
  // Supabase Storage para fotos y firmas (opcional: sin esto, las listas de archivos salen vacías)
  SUPABASE_URL: z.string().url().optional().or(z.literal("")).transform(v => v ? v.replace(/\/$/, "") : undefined),
  SUPABASE_SERVICE_ROLE_KEY: z.string().optional().transform(v => v || undefined),
  STORAGE_BUCKET: z.string().default("pedidos"),
  // Correo transaccional con Resend (https://resend.com). Sin clave no se envían correos, pero la API funciona.
  RESEND_API_KEY: z.string().optional().transform(v => v || undefined),
  CORREO_REMITENTE: z.email("CORREO_REMITENTE debe ser un correo").default("no-responder@jslogistics.pro"),
  CORREO_NOMBRE: z.string().default("JS Logistics"),
  CORREO_RESPUESTA: z.email("CORREO_RESPUESTA debe ser un correo").optional().or(z.literal("")).transform(v => v || undefined),
  // Logo de los correos: URL absoluta y pública (en el correo no sirven rutas locales). PNG por compatibilidad con Outlook.
  CORREO_LOGO_URL: z.string().url("CORREO_LOGO_URL debe ser una URL completa").default("https://app.jslogistics.pro/logo.png"),
  // A dónde apuntan los enlaces de los correos. Cada portal tiene sus propias pantallas de activar y restablecer.
  URL_CLIENTES: z.string().url("URL_CLIENTES debe ser una URL completa").default("http://localhost:3000"),
  URL_EQUIPO: z.string().url("URL_EQUIPO debe ser una URL completa").default("http://localhost:5173"),
  // Vigencia de los enlaces. La contraseña vence rápido; la activación da tiempo para abrir el correo.
  ENLACE_CLAVE_MINUTOS: z.coerce.number().int().positive().default(60),
  ENLACE_ACTIVACION_DIAS: z.coerce.number().int().positive().default(7),
  TRUST_PROXY: z.coerce.number().int().min(0).max(5).default(1)
});

const r = esquema.safeParse(process.env);
if (!r.success) {
  const detalle = r.error.issues.map(i => `  - ${i.path.join(".")}: ${i.message}`).join("\n");
  console.error(`Configuración inválida. Revisa el archivo .env:\n${detalle}`);
  process.exit(1);
}

export const env = Object.freeze({ ...r.data, esProduccion: r.data.NODE_ENV === "production" });
