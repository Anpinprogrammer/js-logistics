/* Crea o actualiza las tablas: npm run db:migrar. Se puede correr varias veces. */
import { readFile } from "node:fs/promises";
import { pool } from "../config/db.js";

const sql = await readFile(new URL("./schema.sql", import.meta.url), "utf8");
try {
  await pool.query(sql);
  console.log("Esquema aplicado.");
} catch (e) {
  console.error("No se pudo aplicar el esquema:", e.message);
  process.exitCode = 1;
} finally {
  await pool.end();
}
