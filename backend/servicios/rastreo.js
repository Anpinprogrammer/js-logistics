/* Rastreo público de una guía: solo los pasos del envío y la fecha en que empezó cada uno.
   Nunca devuelve remitente, destinatario, mensajero, direcciones, valores, motivos ni notas: eso es del portal.
   Los pasos son los mismos para todos los pedidos; lo que cambia es hasta cuál llegó el envío:
   - Con solicitud (el cliente lo pidió por la página): Solicitado = cuando llegó la solicitud; Guía generada = cuando
     la oficina la asignó (la solicitud no se vuelve a tocar después); Recogido/En ruta = cuando el mensajero la recogió
     (`pedidos.creado` se reescribe con esa hora, ver `recoger`); Entregado/Devuelto = `pedidos.entregado`.
   - Sin solicitud (el mensajero tomó la foto y la guía nació en ruta): no hay pasos intermedios reales, así que
     Solicitado, Guía generada, Recogido y En ruta quedan completos con la misma fecha (la de `pedidos.creado`). */
import { env } from "../config/env.js";
import { query } from "../config/db.js";
import { filaAObjeto } from "../helpers/sql.js";
import { noEncontrado } from "../helpers/errores.js";
import * as Pedido from "../models/pedido.model.js";

const iso = f => (f ? new Date(f).toISOString() : null);

/** Fechas de la solicitud que originó la guía, si la hubo (si no, null). */
async function fechasSolicitud(guia) {
  const { rows } = await query(`SELECT creado, actualizado FROM solicitudes WHERE guia = $1 AND estado = 'asignada' LIMIT 1`, [guia]);
  return filaAObjeto(rows[0]);
}

/** Enlace de WhatsApp de la empresa para preguntar por una novedad (null si no está configurado). */
function enlaceWhatsapp(guia) {
  const n = env.CHATBOT_WHATSAPP;
  if (!n) return null;
  return `https://wa.me/${n}?text=${encodeURIComponent(`Hola, quiero saber más de la novedad de mi envío ${guia}.`)}`;
}

/** Arma la vista pública. `p` es el pedido (con `estado`, `creado`, `entregado`); `solicitud` trae `creado` y `actualizado`. */
export function armarRastreo(p, solicitud) {
  const enRuta = p.estado !== "aceptado"; // "aceptado" = guía asignada que el mensajero todavía no recoge
  const cerrado = p.estado === "entregado" || p.estado === "devuelto";
  const devuelto = p.estado === "devuelto";
  const fechaGuia = solicitud ? solicitud.actualizado : p.creado;
  const fechaRecogido = enRuta ? p.creado : null;
  const pasos = [
    { clave: "solicitado", titulo: "Solicitado", fecha: solicitud ? solicitud.creado : p.creado, completado: true },
    { clave: "guia_generada", titulo: "Guía generada", fecha: fechaGuia, completado: true },
    { clave: "recogido", titulo: "Recogido", fecha: fechaRecogido, completado: enRuta },
    { clave: "en_ruta", titulo: "En ruta", fecha: fechaRecogido, completado: enRuta },
    devuelto
      ? { clave: "devuelto", titulo: "Novedad con el envío", fecha: p.entregado, completado: true }
      : { clave: "entregado", titulo: "Entregado", fecha: cerrado ? p.entregado : null, completado: cerrado }
  ].map(s => ({ ...s, fecha: iso(s.fecha) }));
  const actual = devuelto ? "devuelto" : p.estado === "entregado" ? "entregado" : enRuta ? "en_ruta" : "guia_generada";
  return {
    guia: p.guia,
    estado: actual,
    estadoTexto: pasos.find(s => s.clave === actual).titulo,
    pasos,
    novedad: devuelto,
    whatsapp: devuelto ? enlaceWhatsapp(p.guia) : null
  };
}

export async function rastrear(guia) {
  const p = await Pedido.buscarPorGuia(guia);
  if (!p) throw noEncontrado("No encontramos esa guía. Revisa el número e intenta de nuevo.");
  return armarRastreo(p, await fechasSolicitud(guia));
}
