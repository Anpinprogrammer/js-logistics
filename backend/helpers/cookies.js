/* Cookie de sesión: httpOnly (el JavaScript del navegador no la puede leer) y Secure en producción. */
import { env } from "../config/env.js";

const duracionMs = texto => {
  const m = /^(\d+)\s*([smhd])$/.exec(String(texto).trim());
  if (!m) return 12 * 3_600_000;
  return Number(m[1]) * { s: 1_000, m: 60_000, h: 3_600_000, d: 86_400_000 }[m[2]];
};

/* Lo recomendado es servir el frontend y la API en el mismo sitio (por ejemplo, el static site de Render
   reescribiendo /api/* hacia el servicio, o app.dominio.com y api.dominio.com) para usar SameSite=Lax.
   Con dominios distintos haría falta SameSite=None, y Safari en iOS suele bloquear esas cookies. */
export const opcionesCookie = () => ({
  httpOnly: true,
  secure: env.esProduccion || env.COOKIE_SAMESITE === "none",
  sameSite: env.COOKIE_SAMESITE,
  domain: env.COOKIE_DOMINIO,
  path: "/"
});

export const ponerSesion = (res, token) =>
  res.cookie(env.COOKIE_NOMBRE, token, { ...opcionesCookie(), maxAge: duracionMs(env.JWT_EXPIRA) });

export const quitarSesion = res => res.clearCookie(env.COOKIE_NOMBRE, opcionesCookie());
