/* Inicialización del servidor: carga la configuración, abre el puerto y cierra en orden. */
import { env } from "./config/env.js";
import { pool, describirConexion } from "./config/db.js";
import { crearApp } from "./app.js";
import { marcarCierre } from "./controllers/salud.controller.js";
import { cerrarCola, estadoRedis } from "./queues/emailQueue.js";

/** Antes de escuchar, comprueba si Redis está listo para la cola de correos masivos.
    Sin Redis (o si no responde) la API arranca igual: el envío masivo usa el respaldo en memoria. */
async function validarRedis() {
  try {
    const r = await estadoRedis();
    if (!r.configurado) {
      console.log("Redis no configurado: el envío masivo de correos se procesará en segundo plano en este proceso.");
    } else if (r.listo) {
      console.log("Redis listo y escuchando: cola resetEmailQueue activa (concurrencia 5).");
    } else {
      console.warn(`Redis configurado pero no responde (${r.motivo || "sin PING"}): el envío masivo usará el respaldo en memoria.`);
    }
    return r;
  } catch (e) {
    console.warn("No se pudo validar Redis; el envío masivo usará el respaldo en memoria:", e.message);
    return { configurado: false, listo: false, motivo: e.message };
  }
}
await validarRedis();

const app = crearApp();
const servidor = app.listen(env.PORT, () => {
  console.log(`API de JS Logistics en http://localhost:${env.PORT}/api (${env.NODE_ENV})`);
  const c = describirConexion();
  console.log(`Postgres: ${c.modo} (${c.host}:${c.puerto}), pool máximo ${env.DATABASE_POOL_MAX} conexiones por proceso`);
  if (c.modo === "Session pooler") console.warn(
    "Aviso: el Session pooler de Supabase tiene 15 cupos para todo el proyecto. Para la app usa el Transaction pooler (puerto 6543).");
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
