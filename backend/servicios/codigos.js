/* Código numérico de 6 dígitos para recuperar la contraseña (por ahora llega por correo).
   Se genera con el generador seguro del sistema, se guarda como HMAC (JWT_SECRET + id de la cuenta)
   y solo se puede probar un número limitado de veces: 6 dígitos son poca cosa sin esos límites. */
import { createHmac, randomInt, timingSafeEqual } from "node:crypto";
import { env } from "../config/env.js";
import { transaccion } from "../config/db.js";
import * as Codigo from "../models/codigo.model.js";
import * as Usuario from "../models/usuario.model.js";
import * as Enlace from "../models/enlace.model.js";
import * as Correo from "../helpers/correo.js";
import { hashClave } from "../helpers/claves.js";
import { codigoInvalido } from "../helpers/errores.js";

export const generarCodigo = () => String(randomInt(0, 1_000_000)).padStart(6, "0");

export const hashCodigo = (usuarioId, codigo) =>
  createHmac("sha256", env.JWT_SECRET).update(`codigo-clave:${usuarioId}:${codigo}`).digest("hex");

const iguales = (a, b) => {
  const x = Buffer.from(a, "hex"), y = Buffer.from(b, "hex");
  return x.length === y.length && timingSafeEqual(x, y);
};

/**
 * Crea el código y lo manda por correo. Si la cuenta ya pidió demasiados en la última hora no manda nada
 * (la respuesta pública es la misma, así no se delata nada). Devuelve { enviado, motivo? }.
 */
export async function solicitar({ usuario }) {
  if (await Codigo.contarUltimaHora(usuario.id) >= env.CODIGO_ENVIOS_HORA) return { enviado: false, motivo: "LIMITE_CUENTA" };

  const codigo = generarCodigo();
  const expira = new Date(Date.now() + env.CODIGO_MINUTOS * 60_000);
  await Codigo.crear({ usuarioId: usuario.id, codigoHash: hashCodigo(usuario.id, codigo), expira });

  if (!Correo.configurado() && env.NODE_ENV === "development") {
    console.info(`[correo] Sin RESEND_API_KEY. Código de recuperación para ${usuario.email}: ${codigo}`);
  }
  try {
    return await Correo.enviar(Correo.correoDeCodigo({ usuario, codigo }));
  } catch (e) {
    console.error(`No se pudo enviar el código de recuperación a ${usuario.email}:`, e.message);
    if (env.NODE_ENV === "development") console.info(`[correo] Código para ${usuario.email} (no se pudo enviar): ${codigo}`);
    return { enviado: false, motivo: "FALLO_ENVIO" };
  }
}

/**
 * Canjea el código por la contraseña nueva. Cualquier fallo (cuenta que no existe, desactivada, sin código,
 * vencido, equivocado o con los intentos agotados) responde lo mismo. Funciona también para una cuenta
 * que todavía no tiene contraseña: así queda activada.
 */
export async function consumir({ email, codigo, clave }) {
  const usuario = await Usuario.buscarParaEnlace(email);
  if (!usuario?.activo) throw codigoInvalido();

  // El intento se cuenta antes de comparar, en una sola sentencia, y fuera de la transacción de abajo:
  // un código equivocado no puede deshacer su propio intento.
  const vigente = await Codigo.registrarIntento(usuario.id);
  if (!vigente) throw codigoInvalido();
  if (vigente.intentos > env.CODIGO_INTENTOS) {
    await Codigo.marcarUsado(vigente.id);
    throw codigoInvalido();
  }
  if (!iguales(vigente.codigoHash, hashCodigo(usuario.id, codigo))) {
    if (vigente.intentos >= env.CODIGO_INTENTOS) await Codigo.marcarUsado(vigente.id);
    throw codigoInvalido();
  }

  const claveHash = await hashClave(clave);
  return transaccion(async db => {
    if (!(await Codigo.marcarUsado(vigente.id, db))) throw codigoInvalido();
    const actualizado = await Usuario.cambiarClave(usuario.id, claveHash, db);
    await Enlace.invalidarDeUsuario(usuario.id, db);
    await Codigo.invalidarDeUsuario(usuario.id, db);
    return actualizado;
  });
}
