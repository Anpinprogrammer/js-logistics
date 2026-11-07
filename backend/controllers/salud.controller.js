/* /health (vivo, no toca la base) y /ready (lista, revisa la base). Ver ARCHITECTURE.md §3. */
import { pool } from "../config/db.js";

export const vivo = (_req, res) => res.json({ ok: true });

let ultimo = { ok: false, t: 0 };
let cerrando = false;
export const marcarCierre = () => { cerrando = true; };

export async function listo(_req, res) {
  if (cerrando) return res.status(503).json({ ok: false, motivo: "cerrando" });
  // El resultado se guarda 15 s: varios pings seguidos no generan varias consultas.
  if (Date.now() - ultimo.t > 15_000) {
    try {
      await pool.query("SELECT 1");
      ultimo = { ok: true, t: Date.now() };
    } catch (e) {
      console.error("La base no responde:", e.message);
      ultimo = { ok: false, t: Date.now() };
    }
  }
  res.status(ultimo.ok ? 200 : 503).json({ ok: ultimo.ok });
}
