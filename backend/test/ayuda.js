/* Preparación de las pruebas: usan una base de Postgres de pruebas (TEST_DATABASE_URL) que se vacía antes de cada archivo. */
import { readFile } from "node:fs/promises";

process.env.NODE_ENV = "test";
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL || "postgresql://postgres@127.0.0.1:5432/jsl_test";
process.env.JWT_SECRET = "secreto-de-pruebas-que-no-sirve-en-produccion-123";
process.env.CORS_ORIGENES = "http://localhost:5173";
// Límite por IP del formulario público: más alto que en producción para que las pruebas quepan (test/solicitudes.test.js).
process.env.SOLICITUDES_POR_HORA = "12";

const { pool } = await import("../config/db.js");
const { crearApp } = await import("../app.js");
const Usuario = await import("../models/usuario.model.js");
const { hashClave } = await import("../helpers/claves.js");
const { default: request } = await import("supertest");

export { pool };
export const app = crearApp();
export const ORIGEN = "http://localhost:5173";
export const CLAVE = "clave-de-prueba-123";

export async function reiniciarBase() {
  const sql = await readFile(new URL("../db/schema.sql", import.meta.url), "utf8");
  await pool.query(sql);
  await pool.query(`TRUNCATE historial, papelera, pedido_intentos, pedido_archivos, pedidos, movimientos, recaudos,
    liquidaciones, cajamovs, jornadas, enlaces, solicitudes, caja_patinador, usuarios, clientes, mensajeros, cuentas, ajustes RESTART IDENTITY CASCADE`);
  await pool.query(`UPDATE contadores SET n = 0`);
}

export const crearCuenta = async (datos) =>
  Usuario.crear({ nombre: datos.rol, ...datos, claveHash: await hashClave(CLAVE) });

/** Cuenta recién creada por administración: todavía no tiene contraseña (se activa con el enlace del correo). */
export const crearCuentaSinClave = datos =>
  Usuario.crear({ nombre: datos.rol, ...datos, claveHash: null });

/** Agente de supertest que guarda la cookie y manda las cabeceras que exige la API. */
export async function sesion(email) {
  const agente = request.agent(app);
  const r = await agente.post("/api/auth/ingresar").set("Origin", ORIGEN).set("X-JSL", "1").send({ email, clave: CLAVE });
  if (r.status !== 200) throw new Error(`No se pudo ingresar como ${email}: ${r.status} ${JSON.stringify(r.body)}`);
  const conCabeceras = metodo => (url) => agente[metodo](url).set("Origin", ORIGEN).set("X-JSL", "1");
  return { get: conCabeceras("get"), post: conCabeceras("post"), patch: conCabeceras("patch"), put: conCabeceras("put"), delete: conCabeceras("delete"), agente };
}

export { request };
