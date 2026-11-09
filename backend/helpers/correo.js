/* Envío de correos transaccionales con Resend (https://resend.com).
   Sin RESEND_API_KEY no se envía nada y la API sigue funcionando: en desarrollo el enlace se imprime en la consola.
   En las pruebas se cambia el enviador con `usarEnviador` para revisar el correo sin salir a internet. */
import { env } from "../config/env.js";

const API = "https://api.resend.com/emails";

async function enviarConResend(mensaje) {
  if (!env.RESEND_API_KEY) return { enviado: false, motivo: "SIN_CONFIGURAR" };
  const r = await fetch(API, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(mensaje),
    // Si Resend no responde, no se deja colgada la petición del usuario.
    signal: AbortSignal.timeout(10_000)
  });
  if (!r.ok) {
    const detalle = await r.text().catch(() => "");
    throw new Error(`Resend respondió ${r.status}${detalle ? `: ${detalle.slice(0, 300)}` : ""}`);
  }
  const datos = await r.json().catch(() => ({}));
  return { enviado: true, id: datos.id ?? null };
}

// El enviador es una variable para que las pruebas puedan reemplazarlo. En producción siempre es Resend.
let enviador = enviarConResend;
export const usarEnviador = fn => { enviador = fn; };
export const restablecerEnviador = () => { enviador = enviarConResend; };

export const configurado = () => !!env.RESEND_API_KEY;

export async function enviar(mensaje) {
  return enviador(mensaje);
}

const escapar = texto => String(texto ?? "").replace(/[&<>"']/g, c => (
  { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]
));

const minutos = n => `${n} ${n === 1 ? "minuto" : "minutos"}`;
const dias = n => `${n} ${n === 1 ? "día" : "días"}`;

/** Texto que cambia según quién pidió el enlace. */
function introduccion(tipo, origen) {
  if (tipo === "activacion") {
    return "Administración creó tu acceso a JS Logistics. Antes de entrar, crea tu contraseña.";
  }
  if (origen === "admin") {
    return "Administración de JS Logistics te envió un enlace para crear una contraseña nueva.";
  }
  return "Recibimos una solicitud para cambiar la contraseña de tu cuenta.";
}

function vigencia(tipo) {
  return tipo === "activacion"
    ? `El enlace vence en ${dias(env.ENLACE_ACTIVACION_DIAS)}.`
    : `El enlace vence en ${minutos(env.ENLACE_CLAVE_MINUTOS)}.`;
}

/**
 * Arma el mensaje que se manda a Resend: `{ from, to, subject, html, text, reply_to }`.
 * `tipo` es "activacion" o "clave"; `origen` es "sistema", "autoservicio" o "admin".
 */
export function correoDeEnlace({ usuario, tipo, enlace, origen = "sistema" }) {
  const nombre = usuario.nombre?.trim() || usuario.email;
  const activacion = tipo === "activacion";
  const asunto = activacion ? "Activa tu cuenta de JS Logistics" : "Cambia tu contraseña de JS Logistics";
  const boton = activacion ? "Crear mi contraseña" : "Crear contraseña nueva";
  const remitente = `${env.CORREO_NOMBRE} <${env.CORREO_REMITENTE}>`;

  const texto = [
    `Hola, ${nombre}.`,
    "",
    introduccion(tipo, origen),
    "",
    `${boton}: ${enlace}`,
    "",
    vigencia(tipo),
    "Si pides otro enlace, este dejará de servir.",
    "Si no esperabas este correo, ignóralo: tu contraseña actual sigue funcionando.",
    "",
    "JS Logistics · Cali"
  ].join("\n");

  const html = `<!doctype html>
<html lang="es">
  <body style="margin:0;padding:0;background:#f1f5f9;font-family:Arial,Helvetica,sans-serif;color:#0f172a;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f1f5f9;padding:28px 12px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:14px;overflow:hidden;border:1px solid #e2e8f0;">
            <tr>
              <td style="background:#0f1f3d;padding:22px 28px;">
                <span style="font-size:20px;font-weight:700;letter-spacing:.4px;color:#ffffff;">JS Logistics</span>
                <span style="font-size:12px;color:#7dd3fc;margin-left:8px;">Cali</span>
              </td>
            </tr>
            <tr>
              <td style="padding:30px 28px 8px;">
                <h1 style="margin:0 0 18px;font-size:23px;line-height:1.3;color:#0f1f3d;">${activacion ? "Activa tu cuenta" : "Cambia tu contraseña"}</h1>
                <p style="margin:0 0 12px;font-size:16px;line-height:1.6;">Hola, <b>${escapar(nombre)}</b>.</p>
                <p style="margin:0 0 24px;font-size:16px;line-height:1.6;">${escapar(introduccion(tipo, origen))}</p>
                <p style="margin:0 0 26px;">
                  <a href="${escapar(enlace)}" style="display:inline-block;background:#0284c7;color:#ffffff;text-decoration:none;font-size:16px;font-weight:700;padding:14px 24px;border-radius:10px;">${boton}</a>
                </p>
                <p style="margin:0 0 10px;font-size:14px;line-height:1.6;color:#475569;">${escapar(vigencia(tipo))} Si pides otro enlace, este dejará de servir.</p>
                <p style="margin:0 0 22px;font-size:14px;line-height:1.6;color:#475569;">Si no esperabas este correo, ignóralo: tu contraseña actual sigue funcionando.</p>
                <p style="margin:0 0 6px;font-size:12px;line-height:1.6;color:#94a3b8;">Si el botón no abre, copia este enlace en el navegador:</p>
                <p style="margin:0;font-size:12px;line-height:1.6;word-break:break-all;"><a href="${escapar(enlace)}" style="color:#0284c7;">${escapar(enlace)}</a></p>
              </td>
            </tr>
            <tr>
              <td style="padding:20px 28px 26px;">
                <hr style="border:0;border-top:1px solid #e2e8f0;margin:0 0 14px;" />
                <p style="margin:0;font-size:12px;line-height:1.6;color:#94a3b8;">JS Logistics · Cali. Este es un correo automático, no lo respondas.</p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;

  return {
    from: remitente,
    to: [usuario.email],
    subject: asunto,
    html,
    text: texto,
    ...(env.CORREO_RESPUESTA ? { reply_to: env.CORREO_RESPUESTA } : {})
  };
}
