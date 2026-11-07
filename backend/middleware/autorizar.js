/* Permisos por rol. Va siempre después de autenticar. */
import { prohibido, noAutenticado } from "../helpers/errores.js";

export const OFICINA = ["admin", "asistente"];
export const EQUIPO = ["admin", "asistente", "mensajero"];

/** permitir("admin", "asistente") → solo esas cuentas pasan. */
export const permitir = (...roles) => (req, _res, next) => {
  if (!req.usuario) throw noAutenticado();
  if (!roles.flat().includes(req.usuario.rol)) throw prohibido();
  next();
};

export const esOficina = u => OFICINA.includes(u?.rol);
export const esAdmin = u => u?.rol === "admin";
