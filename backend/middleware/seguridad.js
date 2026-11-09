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
