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

/** Mensaje principal. Para el reinicio usa el texto exacto de la especificación. */
function introduccion(tipo, origen) {
  if (tipo === "activacion") {
    return "Administración creó tu acceso a JS Logistics. Antes de entrar, crea tu contraseña.";
  }
  if (origen === "admin") {
    return "Administración de JS Logistics te envió un enlace para restablecer la contraseña de tu cuenta.";
  }
  return "Recibimos una solicitud para restablecer la contraseña de tu cuenta en JS Logistics.";
}

function vigencia(tipo) {
  return tipo === "activacion"
    ? `Este enlace expira en ${dias(env.ENLACE_ACTIVACION_DIAS)}.`
    : `Este enlace expira en ${minutos(env.ENLACE_CLAVE_MINUTOS)}.`;
}

function seguridad(tipo) {
  return tipo === "activacion"
    ? "Si no esperabas este correo, puedes ignorar este mensaje de forma segura; nadie podrá entrar sin la contraseña que crees aquí."
    : "Si no solicitaste este cambio, puedes ignorar este mensaje de forma segura; tu contraseña actual permanecerá sin cambios.";
}

/**
 * Arma el mensaje que se manda a Resend: `{ from, to, subject, html, text, reply_to }`.
 * `tipo` es "activacion" o "clave"; `origen` es "sistema", "autoservicio" o "admin".
 *
 * El HTML usa tablas y estilos inline para Gmail, Outlook 2016+, Apple Mail y Yahoo.
 * El logo va como URL absoluta (CORREO_LOGO_URL); en un correo no funcionan rutas como /public/logo.webp.
 */
export function correoDeEnlace({ usuario, tipo, enlace, origen = "sistema" }) {
  const nombre = usuario.nombre?.trim() || usuario.email;
  const activacion = tipo === "activacion";
  const asunto = activacion ? "Activa tu cuenta de JS Logistics" : "Restablece tu contraseña de JS Logistics";
  const titulo = activacion ? "Activa tu cuenta" : "Restablece tu contraseña";
  const boton = activacion ? "Crear mi contraseña" : "Restablecer contraseña";
  const preheader = activacion
    ? "Activa tu cuenta de JS Logistics."
    : "Restablece la contraseña de tu cuenta de JS Logistics.";
  const mensaje = introduccion(tipo, origen);
  const expira = vigencia(tipo);
  const aviso = seguridad(tipo);
  const remitente = `${env.CORREO_NOMBRE} <${env.CORREO_REMITENTE}>`;
  const logo = escapar(env.CORREO_LOGO_URL);
  const href = escapar(enlace);

  const texto = [
    `Hola, ${nombre}.`,
    "",
    mensaje,
    "",
    `${boton}: ${enlace}`,
    "",
    expira,
    "Si pides un enlace nuevo, el anterior dejará de servir.",
    aviso,
    "",
    "JS Logistics · Cali, Colombia",
    "Este es un mensaje automático, por favor no respondas a este correo."
  ].join("\n");

  const html = `<!doctype html>
<html lang="es">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="x-apple-disable-message-reformatting" />
    <meta name="color-scheme" content="light" />
    <meta name="supported-color-schemes" content="light" />
    <title>${escapar(asunto)}</title>
    <style>
      @media only screen and (max-width: 620px) {
        .jsl-card { width: 100% !important; }
        .jsl-pad { padding-left: 20px !important; padding-right: 20px !important; }
        .jsl-title { font-size: 22px !important; line-height: 1.25 !important; }
      }
    </style>
  </head>
  <body style="margin:0;padding:0;background:#f1f5f9;font-family:Arial,Helvetica,sans-serif;color:#111827;">
    <div style="display:none;font-size:1px;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;mso-hide:all;color:#f1f5f9;">${escapar(preheader)}</div>

    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;background:#f1f5f9;border-collapse:collapse;">
      <tr>
        <td align="center" style="padding:28px 12px;">
          <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" class="jsl-card" style="width:100%;max-width:600px;background:#ffffff;border:1px solid #e2e8f0;border-radius:12px;overflow:hidden;border-collapse:separate;">
            <!-- Encabezado con logo -->
            <tr>
              <td align="center" bgcolor="#0b192c" style="background:#0b192c;padding:24px 28px;">
                <img src="${logo}" alt="JS Logistics Cali" width="64" style="display:block;width:64px;max-width:64px;height:auto;border:0;outline:none;text-decoration:none;-ms-interpolation-mode:bicubic;" />
              </td>
            </tr>

            <!-- Contenido principal -->
            <tr>
              <td class="jsl-pad" style="padding:32px 32px 8px;">
                <h1 class="jsl-title" style="margin:0 0 20px;font-family:Arial,Helvetica,sans-serif;font-size:24px;line-height:1.3;font-weight:bold;color:#111827;">${escapar(titulo)}</h1>
                <p style="margin:0 0 12px;font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:1.6;color:#374151;">Hola, <strong style="color:#111827;">${escapar(nombre)}</strong>.</p>
                <p style="margin:0 0 28px;font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:1.65;color:#374151;">${escapar(mensaje)}</p>

                <!-- Botón principal: enlace estándar dentro de una celda con fondo -->
                <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 28px;border-collapse:collapse;">
                  <tr>
                    <td align="center" bgcolor="#0084c7" style="background:#0084c7;border-radius:8px;mso-padding-alt:12px 28px;">
                      <a href="${href}" target="_blank" rel="noopener" style="display:inline-block;padding:12px 28px;font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:1.2;font-weight:bold;color:#ffffff;text-decoration:none;border-radius:8px;">${escapar(boton)}</a>
                    </td>
                  </tr>
                </table>

                <!-- Aviso de vigencia y seguridad -->
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;border-collapse:separate;">
                  <tr>
                    <td style="padding:16px 18px;">
                      <p style="margin:0 0 8px;font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.6;color:#111827;"><strong>${escapar(expira)}</strong></p>
                      <p style="margin:0;font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.6;color:#475569;">${escapar(aviso)}</p>
                      <p style="margin:10px 0 0;font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:1.5;color:#64748b;">Si pides un enlace nuevo, el anterior dejará de servir.</p>
                    </td>
                  </tr>
                </table>

                <!-- Enlace alternativo -->
                <p style="margin:24px 0 8px;font-family:Arial,Helvetica,sans-serif;font-size:13px;line-height:1.6;color:#64748b;">Si el botón no funciona, copia y pega el siguiente enlace en tu navegador:</p>
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;background:#f8fafc;border:1px solid #e2e8f0;border-radius:6px;border-collapse:separate;">
                  <tr>
                    <td style="padding:12px 14px;font-family:'Courier New',Courier,monospace;font-size:12px;line-height:1.5;color:#0284c7;word-break:break-all;overflow-wrap:anywhere;">
                      <a href="${href}" target="_blank" rel="noopener" style="color:#0284c7;text-decoration:none;word-break:break-all;">${escapar(enlace)}</a>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>

            <!-- Pie -->
            <tr>
              <td class="jsl-pad" style="padding:24px 32px 28px;">
                <hr style="border:0;border-top:1px solid #e2e8f0;margin:0 0 16px;" />
                <p style="margin:0;font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:1.6;color:#94a3b8;">JS Logistics · Cali, Colombia | Este es un mensaje automático, por favor no respondas a este correo.</p>
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
