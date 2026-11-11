/* Variables de entorno validadas al arrancar: si falta algo, el servidor no sube y dice qué falta. */
import { z } from "zod";

const esquema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(4000),
  DATABASE_URL: z.string().min(1, "DATABASE_URL es obligatoria"),
  // (Opcional) Cadena para db:migrar, db:importar y db:demo. En Supabase, el Session pooler (puerto 5432):
  // la app va por el Transaction pooler (6543) y los scripts largos, con varias sentencias, por aquí.
  DATABASE_URL_MIGRACIONES: z.string().optional().transform(v => v || undefined),
  DATABASE_SSL: z.enum(["true", "false"]).default("false").transform(v => v === "true"),
  // Certificado de la base (PEM). En Supabase: Database Settings → SSL Configuration → Download certificate.
  DATABASE_CA: z.string().optional().transform(v => v ? v.replace(/\\n/g, "\n") : undefined),
  // Conexiones del pool POR PROCESO (cada `npm run dev` y cada instancia de Render es un proceso).
  // Con el Transaction pooler (6543) 5 sobran para decenas de usuarios a la vez: cada consulta
  // ocupa la conexión unos milisegundos. En session mode (5432) el cupo es 15 para todo el proyecto.
  DATABASE_POOL_MAX: z.coerce.number().int().min(1).max(50).default(5),
  DATABASE_POOL_IDLE_MS: z.coerce.number().int().min(1000).max(300_000).default(10_000),
  DATABASE_CONNECT_TIMEOUT_MS: z.coerce.number().int().min(500).max(60_000).default(5_000),
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
  // Redis para la cola de correos masivos (BullMQ). Opcional: sin esto, el envío masivo corre en segundo plano en el mismo proceso.
  REDIS_URL: z.string().url("REDIS_URL debe ser una URL completa").optional().or(z.literal("")).transform(v => v || undefined),
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
  // Chatbot de clientes (Claude). Sin ANTHROPIC_API_KEY el chat responde 503 y manda al cliente a WhatsApp.
  // La llave se crea en https://console.anthropic.com → API Keys y solo vive en el backend.
  ANTHROPIC_API_KEY: z.string().optional().transform(v => v || undefined),
  CHATBOT_MODELO: z.string().min(1).default("claude-haiku-5-5"),
  // Cuánto "piensa" el modelo: low (rápido y barato, suficiente para atención) | medium | high
  CHATBOT_ESFUERZO: z.enum(["low", "medium", "high"]).default("low"),
  CHATBOT_MAX_TOKENS: z.coerce.number().int().min(256).max(8192).default(1024),
  // Archivo en markdown con horarios, proceso de envío y políticas (se carga en el prompt del sistema)
  CHATBOT_INFO_ARCHIVO: z.string().default("chatbot/informacion-empresa.md"),
  // WhatsApp de atención humana, solo dígitos con indicativo (573001234567). Vacío = sin botón de WhatsApp.
  CHATBOT_WHATSAPP: z.string().regex(/^\d{8,15}$/, "CHATBOT_WHATSAPP: solo dígitos con indicativo, por ejemplo 573001234567").optional().or(z.literal("")).transform(v => v || undefined),
  // Límites por cliente (por cuenta, no por IP)
  CHATBOT_LIMITE_MINUTO: z.coerce.number().int().min(1).default(8),
  CHATBOT_LIMITE_DIA: z.coerce.number().int().min(1).default(100),
  // Chat público (visitantes sin sesión): solo info general y estado de un envío, sin nombres ni dinero.
  // Los límites van por IP y hay un tope global por día, porque cualquiera en internet puede llamarlo.
  CHATBOT_PUBLICO_ACTIVO: z.enum(["true", "false"]).default("true").transform(v => v === "true"),
  CHATBOT_PUBLICO_MINUTO: z.coerce.number().int().min(1).default(5),
  CHATBOT_PUBLICO_DIA: z.coerce.number().int().min(1).default(30),
  CHATBOT_PUBLICO_DIA_TOTAL: z.coerce.number().int().min(1).default(500),
  // Formulario público "Solicitar envío" de la landing (sin sesión): límites por IP y topes globales.
  SOLICITUDES_ACTIVO: z.enum(["true", "false"]).default("true").transform(v => v === "true"),
  SOLICITUDES_POR_HORA: z.coerce.number().int().min(1).default(5),
  SOLICITUDES_POR_DIA: z.coerce.number().int().min(1).default(15),
  SOLICITUDES_DIA_TOTAL: z.coerce.number().int().min(1).default(300),
  SOLICITUDES_MAX_PENDIENTES: z.coerce.number().int().min(1).default(200),
  TRUST_PROXY: z.coerce.number().int().min(0).max(5).default(1)
});

const r = esquema.safeParse(process.env);
if (!r.success) {
  const detalle = r.error.issues.map(i => `  - ${i.path.join(".")}: ${i.message}`).join("\n");
  console.error(`Configuración inválida. Revisa el archivo .env:\n${detalle}`);
  process.exit(1);
}

export const env = Object.freeze({ ...r.data, esProduccion: r.data.NODE_ENV === "production" });
