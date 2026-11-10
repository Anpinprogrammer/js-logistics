/* Enlaces de un solo uso por correo: activar una cuenta y reiniciar la contraseña.
   El token se genera aquí, se guarda su hash y se manda en claro solo dentro del correo. */
import { createHash, randomBytes } from "node:crypto";
import { env } from "../config/env.js";
import { transaccion } from "../config/db.js";
import * as Enlace from "../models/enlace.model.js";
import * as Usuario from "../models/usuario.model.js";
import * as Correo from "../helpers/correo.js";
import { hashClave } from "../helpers/claves.js";
import { cuentaInactiva, enlaceInvalido, enlaceVencido } from "../helpers/errores.js";

export const hashToken = token => createHash("sha256").update(token).digest("hex");

const minutosDeVida = tipo => (tipo === "activacion" ? env.ENLACE_ACTIVACION_DIAS * 24 * 60 : env.ENLACE_CLAVE_MINUTOS);

const baseDelPortal = usuario =>
  (usuario.rol === "cliente" ? env.URL_CLIENTES : env.URL_EQUIPO).replace(/\/+$/, "");

/** Arma la URL que abre el portal correcto (clientes o equipo) en su pantalla de activar o restablecer. */
export function urlDeEnlace(usuario, tipo, token) {
  const ruta = tipo === "activacion" ? "/activar-cuenta" : "/restablecer";
  return `${baseDelPortal(usuario)}${ruta}?token=${encodeURIComponent(token)}`;
}

/**
 * Crea el enlace y lo manda por correo. Si el correo falla, se registra y se devuelve el motivo:
 * la creación de la cuenta no se cae por un problema de Resend (el administrador puede reenviarlo).
 */
export async function crearYEnviar({ usuario, tipo, creadoPor = null, origen = "sistema" }) {
  const token = randomBytes(32).toString("base64url");
  const expira = new Date(Date.now() + minutosDeVida(tipo) * 60_000);
  await Enlace.crear({ usuarioId: usuario.id, tipo, tokenHash: hashToken(token), expira, creadoPor });

  const enlace = urlDeEnlace(usuario, tipo, token);
  // Sin Resend configurado no hay correo; en desarrollo se imprime el enlace para poder probar el flujo.
  if (!Correo.configurado() && env.NODE_ENV === "development") {
    console.info(`[correo] Sin RESEND_API_KEY. Enlace de ${tipo} para ${usuario.email}: ${enlace}`);
  }
  try {
    return { ...(await Correo.enviar(Correo.correoDeEnlace({ usuario, tipo, enlace, origen }))), url: enlace };
  } catch (e) {
    console.error(`No se pudo enviar el correo de ${tipo} a ${usuario.email}:`, e.message);
    // En desarrollo, un dominio sin verificar no debe bloquear la prueba: el enlace queda en la consola.
    if (env.NODE_ENV === "development") {
      console.info(`[correo] Enlace de ${tipo} para ${usuario.email} (no se pudo enviar): ${enlace}`);
    }
    return { enviado: false, motivo: "FALLO_ENVIO", url: enlace };
  }
}

/** Revisa un token sin usarlo (para que el portal muestre el formulario o diga que el enlace no sirve). */
export async function leer(token) {
  const enlace = await Enlace.buscarPorToken(hashToken(token));
  if (!enlace || enlace.usado) throw enlaceInvalido();
  if (new Date(enlace.expira) <= new Date()) throw enlaceVencido();
  if (!enlace.activo) throw cuentaInactiva();
  return enlace;
}

/**
 * Consume el enlace y cambia la contraseña. Todo va en una transacción con la fila bloqueada:
 * si dos pestañas usan el mismo enlace a la vez, solo una puede.
 */
export async function consumir({ token, clave, tipo }) {
  const hash = hashToken(token);
  const claveHash = await hashClave(clave);

  return transaccion(async db => {
    const enlace = await Enlace.buscarPorToken(hash, { bloquear: true, db });
    if (!enlace || enlace.usado || enlace.tipo !== tipo) throw enlaceInvalido();
    if (new Date(enlace.expira) <= new Date()) throw enlaceVencido();
    if (!enlace.activo) throw cuentaInactiva();

    const usuario = await Usuario.cambiarClave(enlace.usuarioId, claveHash, db);
    await Enlace.marcarUsado(enlace.id, db);
    await Enlace.invalidarDeUsuario(enlace.usuarioId, db);
    return usuario;
  });
}
