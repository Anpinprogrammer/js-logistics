/* Lee el JWT de la cookie de sesión, lo verifica y deja la cuenta en req.usuario.
   El rol y los vínculos se leen de la base en cada petición: si administración cambia el rol
   o desactiva la cuenta, el cambio aplica de inmediato aunque el token siga vigente. */
import { env } from "../config/env.js";
import { verificarToken } from "../helpers/jwt.js";
import { noAutenticado } from "../helpers/errores.js";
import { quitarSesion } from "../helpers/cookies.js";
import * as Usuario from "../models/usuario.model.js";

export async function autenticar(req, res, next) {
  const token = req.cookies?.[env.COOKIE_NOMBRE];
  if (!token) throw noAutenticado();

  let payload;
  try {
    payload = verificarToken(token);
  } catch (e) {
    quitarSesion(res);
    throw noAutenticado(e.name === "TokenExpiredError" ? "Tu sesión venció. Ingresa de nuevo." : "Sesión inválida. Ingresa de nuevo.");
  }

  const u = await Usuario.buscarPorId(payload.sub);
  if (!u || !u.activo || u.versionSesion !== payload.v) {
    quitarSesion(res);
    throw noAutenticado("Tu sesión ya no es válida. Ingresa de nuevo.");
  }

  req.usuario = {
    id: u.id,
    email: u.email,
    nombre: u.nombre,
    rol: u.rol,
    clienteId: u.clienteId,
    mensajeroId: u.mensajeroId
  };
  next();
}
