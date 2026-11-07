/* Crea el primer administrador desde la terminal (reemplaza la pantalla "Configuración inicial" de la app,
   que dejaba a cualquiera intentar crear el primer admin desde internet).
   Uso: npm run db:admin -- --email dueno@ejemplo.com --nombre "Javier" --clave "una-clave-larga" */
import { parseArgs } from "node:util";
import { pool } from "../config/db.js";
import * as Usuario from "../models/usuario.model.js";
import { hashClave, CLAVE_MINIMA } from "../helpers/claves.js";

const { values: a } = parseArgs({ options: { email: { type: "string" }, nombre: { type: "string" }, clave: { type: "string" } } });
try {
  if (!a.email || !a.clave) throw new Error("Faltan --email y --clave");
  if (a.clave.length < CLAVE_MINIMA) throw new Error(`La contraseña debe tener al menos ${CLAVE_MINIMA} caracteres`);
  if (await Usuario.buscarPorEmail(a.email)) throw new Error("Ya existe una cuenta con ese correo");
  const u = await Usuario.crear({ email: a.email, nombre: a.nombre || "", rol: "admin", claveHash: await hashClave(a.clave) });
  console.log(`Administrador creado: ${u.email} (${u.id})`);
} catch (e) {
  console.error("No se pudo crear el administrador:", e.message);
  process.exitCode = 1;
} finally {
  await pool.end();
}
