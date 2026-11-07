/* Arma la aplicación de Express (sin abrir el puerto), para que index.js la levante y las pruebas la usen. */
import express from "express";
import cookieParser from "cookie-parser";
import { cabeceras, corsConfigurado, verificarOrigen, limiteGeneral } from "./middleware/seguridad.js";
import { rutaNoEncontrada, manejarErrores } from "./middleware/errores.js";
import rutas from "./routes/index.js";

export function crearApp() {
  const app = express();
  app.disable("x-powered-by");
  app.set("trust proxy", 1); // Render pone un proxy delante: así req.ip es la IP real para el límite de intentos

  app.use(cabeceras);
  app.use(corsConfigurado);
  app.use(express.json({ limit: "200kb" }));
  app.use(cookieParser());
  app.use("/api", limiteGeneral, verificarOrigen, rutas);

  app.use(rutaNoEncontrada);
  app.use(manejarErrores);
  return app;
}
