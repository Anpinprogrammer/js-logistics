/* Firma y verificación del JWT de sesión. */
import jwt from "jsonwebtoken";
import { env } from "../config/env.js";

const OPCIONES = { algorithm: "HS256", issuer: "js-logistics", audience: "js-logistics-web" };

/** El token solo lleva el id y la versión de sesión; el rol se lee de la base en cada petición. */
export const firmarToken = usuario =>
  jwt.sign({ sub: usuario.id, v: usuario.versionSesion ?? 0 }, env.JWT_SECRET, { ...OPCIONES, expiresIn: env.JWT_EXPIRA });

/** Devuelve el payload o lanza si el token es inválido o venció. */
export const verificarToken = token =>
  jwt.verify(token, env.JWT_SECRET, { algorithms: [OPCIONES.algorithm], issuer: OPCIONES.issuer, audience: OPCIONES.audience });
