/* Cola de correos masivos de restablecimiento (BullMQ + Redis).
   Si REDIS_URL no está configurada, o Redis no responde, el lote se procesa en segundo plano
   dentro del mismo proceso (nunca en la petición del usuario) para no bloquear a Express.

   El token de cada correo no se guarda en `usuarios`: se genera uno de un solo uso y se guarda
   su hash en la tabla `enlaces` con su expiración (misma regla que el resto de correos). */
import net from "node:net";
import { env } from "../config/env.js";
import * as Usuario from "../models/usuario.model.js";
import * as Enlaces from "../servicios/enlaces.js";

/** @typedef {{ email: string, porUid?: string }} TrabajoCorreo */

export const NOMBRE_COLA = "resetEmailQueue";
const OPCIONES_TRABAJO = {
  attempts: 3,
  backoff: { type: "exponential", delay: 1000 },
  removeOnComplete: 200,
  removeOnFail: 500
};

let cola = null, trabajador = null, modo = "memoria", ultimoAviso = 0;

/** Conexión de BullMQ a partir de REDIS_URL (rediss:// usa TLS). */
function conexion() {
  if (!env.REDIS_URL) return null;
  const u = new URL(env.REDIS_URL);
  return {
    host: u.hostname,
    port: Number(u.port || 6379),
    username: u.username || undefined,
    password: u.password || undefined,
    tls: u.protocol === "rediss:" ? {} : undefined
  };
}

/** Genera el enlace, lo guarda y manda el correo. Un fallo de Resend se lanza para que BullMQ reintente. */
async function enviarUno({ email, porUid }) {
  const usuario = await Usuario.buscarParaEnlace(email);
  // Cuenta inexistente o inactiva: se omite sin reintentos (no tiene sentido reintentar).
  if (!usuario) return { email, omitido: "sin-cuenta" };
  if (!usuario.activo) return { email, omitido: "inactiva" };
  const r = await Enlaces.crearYEnviar({
    usuario,
    tipo: usuario.tieneClave ? "clave" : "activacion",
    origen: "admin",
    creadoPor: porUid || null
  });
  if (!r.enviado) throw new Error(`No se pudo enviar a ${email}: ${r.motivo || "FALLO_ENVIO"}`);
  return { email, enviado: true };
}

/** Comprueba que Redis responda antes de crear la cola (así no se queda colgado si está caído). */
function redisVivo({ host, port }) {
  return new Promise(resolve => {
    const s = net.connect({ host, port });
    const listo = ok => { s.destroy(); resolve(ok); };
    s.setTimeout(1200, () => listo(false));
    s.once("connect", () => listo(true));
    s.once("error", () => listo(false));
  });
}

/** Crea (una sola vez) la cola y su worker. Devuelve null si no hay Redis o si la conexión falla. */
async function iniciar() {
  if (cola) return cola;
  const connection = conexion();
  if (!connection) return null;
  if (!await redisVivo(connection)) return null;
  try {
    const { Queue, Worker } = await import("bullmq");
    cola = new Queue(NOMBRE_COLA, { connection, defaultJobOptions: OPCIONES_TRABAJO });
    trabajador = new Worker(NOMBRE_COLA, job => enviarUno(job.data), { connection, concurrency: 5 });
    trabajador.on("failed", (job, e) => console.error(`[correos] Falló ${job?.data?.email || "un correo"}:`, e.message));
    trabajador.on("error", e => {
      // Redis caído: se avisa una vez y la app sigue funcionando con el respaldo en memoria.
      if (Date.now() - ultimoAviso > 60_000) console.error("[correos] Redis no disponible:", e.message);
      ultimoAviso = Date.now();
    });
    modo = "redis";
    return cola;
  } catch (e) {
    console.error("[correos] No se pudo iniciar la cola de Redis; se procesará en memoria:", e.message);
    cola = null; trabajador = null;
    return null;
  }
}

/** Reintenta como el worker (3 intentos con espera exponencial) cuando no hay Redis. */
async function enviarConReintentos(trabajo) {
  for (let intento = 1; intento <= 3; intento++) {
    try { return await enviarUno(trabajo); }
    catch (e) {
      if (intento === 3) { console.error(`[correos] No se pudo enviar a ${trabajo.email}:`, e.message); return null; }
      await new Promise(r => setTimeout(r, 1000 * 2 ** (intento - 1)));
    }
  }
}

/** Procesa el lote en segundo plano, de a 5 correos a la vez. */
async function procesarEnMemoria(trabajos) {
  for (let i = 0; i < trabajos.length; i += 5) await Promise.all(trabajos.slice(i, i + 5).map(enviarConReintentos));
}

/**
 * Encola los correos y responde de inmediato. Con Redis usa BullMQ (3 intentos con espera exponencial);
 * sin Redis los procesa después de contestar la petición.
 * @param {{ emails: string[], porUid?: string }} datos
 */
export async function encolarCorreosReset({ emails, porUid }) {
  /** @type {TrabajoCorreo[]} */
  const trabajos = emails.map(email => ({ email, porUid }));
  const q = await iniciar();
  if (q) {
    try {
      // Si Redis está caído, addBulk puede quedarse esperando: se le da 3 segundos y se usa el respaldo.
      await Promise.race([
        q.addBulk(trabajos.map(data => ({ name: "restablecer", data }))),
        new Promise((_, falla) => setTimeout(() => falla(new Error("Redis no respondió a tiempo")), 3000))
      ]);
      return { total: trabajos.length, modo: "redis", cola: NOMBRE_COLA };
    } catch (e) {
      console.error("[correos] No se pudo encolar en Redis; se procesa en memoria:", e.message);
      // Sin await: si Redis está caído, close() puede quedarse esperando la reconexión.
      void q.close().catch(() => {});
      void trabajador?.close(true).catch(() => {});
      cola = null; trabajador = null; modo = "memoria";
    }
  }
  // setTimeout deja que la respuesta HTTP salga antes de empezar a mandar correos.
  setTimeout(() => { void procesarEnMemoria(trabajos); }, 0);
  return { total: trabajos.length, modo: "memoria", cola: NOMBRE_COLA };
}

/** Cierra la cola al apagar el servidor (SIGTERM/SIGINT). */
export async function cerrarCola() {
  await trabajador?.close().catch(() => {});
  await cola?.close().catch(() => {});
  trabajador = null; cola = null;
}

export const modoCola = () => modo;
