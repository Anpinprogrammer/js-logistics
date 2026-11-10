/* Inicialización del servidor: carga la configuración, abre el puerto y cierra en orden. */
import { env } from "./config/env.js";
import { pool } from "./config/db.js";
import { crearApp } from "./app.js";
import { marcarCierre } from "./controllers/salud.controller.js";
import { cerrarCola } from "./queues/emailQueue.js";

const app = crearApp();
const servidor = app.listen(env.PORT, () => {
  console.log(`API de JS Logistics en http://localhost:${env.PORT}/api (${env.NODE_ENV})`);
  console.log(`Postgres: pool máximo ${env.DATABASE_POOL_MAX} conexiones por proceso`);
});

/* Render (y casi cualquier plataforma) apaga con SIGTERM al desplegar: se deja de aceptar tráfico,
   se terminan las peticiones en curso y se cierra el pool de Postgres. */
async function cerrar(senal) {
  console.log(`${senal} recibido: cerrando…`);
  marcarCierre();
  servidor.close(async () => {
    await cerrarCola().catch(() => {});
    await pool.end().catch(() => {});
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 10_000).unref();
}
process.on("SIGTERM", () => cerrar("SIGTERM"));
process.on("SIGINT", () => cerrar("SIGINT"));
