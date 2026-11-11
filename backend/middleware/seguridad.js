/* Cabeceras, CORS, protección CSRF y límite de intentos. */
import helmet from "helmet";
import cors from "cors";
import rateLimit from "express-rate-limit";
import { env } from "../config/env.js";
import { prohibido } from "../helpers/errores.js";

export const cabeceras = helmet();

// Solo los orígenes del frontend pueden llamar con cookies.
export const corsConfigurado = cors({
  origin: (origen, cb) => cb(null, !origen || env.CORS_ORIGENES.includes(origen)),
  credentials: true,
  methods: ["GET", "POST", "PATCH", "PUT", "DELETE"],
  maxAge: 600
});

/* CSRF: como la sesión va en una cookie, otra página podría intentar enviar peticiones a la API con ella.
   Para todo lo que cambia datos se exigen dos cosas:
   1. La cabecera propia `X-JSL: 1`. Un formulario de otra página no puede ponerla, y con fetch el navegador
      tendría que pedir permiso por CORS, que solo se da a los orígenes del frontend.
   2. Que el Origin (o el Referer), si viene, sea uno de los orígenes permitidos. */
const SEGUROS = new Set(["GET", "HEAD", "OPTIONS"]);
export function verificarOrigen(req, _res, next) {
  if (SEGUROS.has(req.method)) return next();
  if (req.get("x-jsl") !== "1") throw prohibido("Falta la cabecera X-JSL");
  let origen = req.get("origin");
  if (!origen && req.get("referer")) {
    try { origen = new URL(req.get("referer")).origin; } catch { origen = "inválido"; }
  }
  if (origen && !env.CORS_ORIGENES.includes(origen)) throw prohibido("Origen no permitido");
  next();
}

/** Login: máximo 10 intentos cada 15 minutos por IP. */
export const limiteIngreso = rateLimit({
  windowMs: 15 * 60_000,
  limit: 10,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  message: { error: "Demasiados intentos. Espera unos minutos e intenta de nuevo." }
});

// Respuesta con la misma forma de error que el resto de la API.
const respuesta429 = (code, message) => (_req, res) =>
  res.status(429).json({ error: { code, message } });

/** Pedir enlaces por correo: máximo 5 cada 15 minutos por IP (evita usar la API para mandar spam). */
export const limiteCorreo = rateLimit({
  windowMs: 15 * 60_000,
  limit: 5,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  handler: respuesta429("DEMASIADOS_CORREOS", "Pediste demasiados enlaces. Espera unos minutos e intenta de nuevo.")
});

/** Abrir o usar un enlace con token: 20 cada 15 minutos por IP (los tokens son largos y aleatorios). */
export const limiteEnlace = rateLimit({
  windowMs: 15 * 60_000,
  limit: 20,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  handler: respuesta429("DEMASIADOS_INTENTOS", "Demasiados intentos con este enlace. Espera unos minutos.")
});

/** Límite general para toda la API. */
export const limiteGeneral = rateLimit({
  windowMs: 60_000,
  limit: 300,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: { error: "Demasiadas solicitudes. Espera un momento." }
});

/* Chatbot: el límite es por CUENTA (no por IP), porque varios clientes pueden compartir red y cada mensaje
   cuesta dinero. Va después de `autenticar`, así que req.usuario siempre existe. */
const porCuenta = req => `u:${req.usuario.id}`;
const respuestaChat429 = (code, message) => (_req, res) => res.status(429).json({ error: { code, message } });

/** Ráfaga: pocos mensajes por minuto. */
export const limiteChatMinuto = rateLimit({
  windowMs: 60_000,
  limit: env.CHATBOT_LIMITE_MINUTO,
  keyGenerator: porCuenta,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  handler: respuestaChat429("CHAT_DEMASIADO_RAPIDO", "Estás escribiendo muy rápido. Espera un momento e intenta de nuevo.")
});

/** Tope diario por cliente, para que una cuenta no gaste el presupuesto de todos. */
export const limiteChatDia = rateLimit({
  windowMs: 24 * 60 * 60_000,
  limit: env.CHATBOT_LIMITE_DIA,
  keyGenerator: porCuenta,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  handler: respuestaChat429("CHAT_LIMITE_DIARIO", "Llegaste al límite de mensajes de hoy con el asistente. Escríbenos por WhatsApp y te atendemos.")
});

/* Chat público (sin sesión): por IP, y un tope global por día para que nadie pueda vaciar el presupuesto.
   Cada mensaje cuesta dinero y cualquiera en internet puede llamarlo, así que los límites son más estrictos
   que los del cliente con sesión. */
export const limitePublicoMinuto = rateLimit({
  windowMs: 60_000,
  limit: env.CHATBOT_PUBLICO_MINUTO,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  handler: respuestaChat429("CHAT_DEMASIADO_RAPIDO", "Estás escribiendo muy rápido. Espera un momento e intenta de nuevo.")
});
export const limitePublicoDia = rateLimit({
  windowMs: 24 * 60 * 60_000,
  limit: env.CHATBOT_PUBLICO_DIA,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  handler: respuestaChat429("CHAT_LIMITE_DIARIO", "Llegaste al límite de mensajes de hoy. Escríbenos por WhatsApp o inicia sesión para seguir.")
});
export const limitePublicoGlobal = rateLimit({
  windowMs: 24 * 60 * 60_000,
  limit: env.CHATBOT_PUBLICO_DIA_TOTAL,
  keyGenerator: () => "global",
  standardHeaders: false,
  legacyHeaders: false,
  handler: respuestaChat429("CHAT_SATURADO", "El asistente tiene mucha demanda hoy. Escríbenos por WhatsApp y te atendemos.")
});

/* Formulario público "Solicitar envío": cualquiera en internet puede llamarlo y cada solicitud termina en la
   campanita de la oficina, así que va con límites por IP (por hora y por día) y un tope global diario. */
const respuestaSolicitud429 = message => respuesta429("DEMASIADAS_SOLICITUDES", message);
export const limiteSolicitudHora = rateLimit({
  windowMs: 60 * 60_000,
  limit: env.SOLICITUDES_POR_HORA,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  handler: respuestaSolicitud429("Ya enviaste varias solicitudes. Espera un rato o escríbenos por WhatsApp.")
});
export const limiteSolicitudDia = rateLimit({
  windowMs: 24 * 60 * 60_000,
  limit: env.SOLICITUDES_POR_DIA,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  handler: respuestaSolicitud429("Llegaste al límite de solicitudes de hoy. Escríbenos por WhatsApp y te atendemos.")
});
export const limiteSolicitudGlobal = rateLimit({
  windowMs: 24 * 60 * 60_000,
  limit: env.SOLICITUDES_DIA_TOTAL,
  keyGenerator: () => "global",
  standardHeaders: false,
  legacyHeaders: false,
  handler: respuesta429("SOLICITUDES_SATURADAS", "Tenemos muchas solicitudes hoy. Escríbenos por WhatsApp y te atendemos.")
});
