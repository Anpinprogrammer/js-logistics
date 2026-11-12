/* Arma la aplicación de Express (sin abrir el puerto), para que index.js la levante y las pruebas la usen. */
import express from "express";
import { env } from "./config/env.js";
import cookieParser from "cookie-parser";
import compression from "compression";
import { cabeceras, corsConfigurado, verificarOrigen, limiteGeneral } from "./middleware/seguridad.js";
import { rutaNoEncontrada, manejarErrores } from "./middleware/errores.js";
import rutas from "./routes/index.js";

export function crearApp() {
  const app = express();
  app.disable("x-powered-by");
  // Cuántos proxies hay delante, para que req.ip sea la IP real del usuario (el límite de intentos de ingreso
  // va por IP). Render solo: 1. Frontend en Vercel reescribiendo /api/* hacia Render: 2.
  app.set("trust proxy", env.TRUST_PROXY);

  app.use(cabeceras);
  // gzip/deflate de las respuestas (el JSON de pedidos baja a una fracción en datos móviles). Los avisos en tiempo
  // real (text/event-stream) no se comprimen: compression los guardaría en búfer y llegarían tarde.
  app.use(compression({ filter: (req, res) => !String(req.headers.accept || "").includes("text/event-stream") && !String(res.getHeader("Content-Type") || "").includes("text/event-stream") && compression.filter(req, res) }));
  app.use(corsConfigurado);
  app.use(express.json({ limit: "200kb" }));
  app.use(cookieParser());
  app.use("/api", limiteGeneral, verificarOrigen, rutas);

  app.use(rutaNoEncontrada);
  app.use(manejarErrores);
  return app;
}
