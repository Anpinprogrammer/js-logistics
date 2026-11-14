/* Crear una solicitud de envío a nombre de un cliente con sesión. Lo usan el portal (POST /solicitudes/portal) y el
   asistente (JSBot, cuando la persona confirma el borrador): así las reglas son una sola y no se duplican. */
import * as Solicitud from "../models/solicitud.model.js";
import * as Cliente from "../models/cliente.model.js";
import * as Auditoria from "../models/auditoria.model.js";
import { HttpError, invalido, prohibido } from "../helpers/errores.js";
import { limpiarTexto } from "../helpers/textoSeguro.js";
import { eventos } from "./eventos.js";

const limpio = t => limpiarTexto(t).replace(/\s+/g, " ").trim();

// Tope de solicitudes sin revisar por cliente desde el portal: evita que una cuenta llene la campanita.
export const MAX_PENDIENTES_CLIENTE = 20;

/**
 * `usuario` es la sesión (req.usuario) y `datos` ya pasó por `crearPortal` (validators/solicitudes.validator.js).
 * La ficha del cliente sale SIEMPRE de la sesión, nunca de `datos`.
 * Devuelve { repetida } (true si ya había una igual sin revisar: no se crea otra).
 */
export async function crearSolicitudDeCliente({ usuario, datos: b, viaChatbot = false }) {
  const clienteId = usuario.clienteId;
  if (!clienteId) throw prohibido("Tu cuenta no está vinculada con un cliente. Escríbenos por WhatsApp.");
  if (!(await Cliente.buscarPorId(clienteId))) throw prohibido("Tu ficha de cliente ya no existe. Escríbenos por WhatsApp.");
  const d = {
    nombre: limpio(b.nombre), telefono: limpio(b.telefono), email: b.email || usuario.email || "",
    direccionRecogida: limpio(b.direccionRecogida), paquetes: b.paquetes, pesoKg: b.pesoKg,
    destinatarioNombre: limpio(b.destinatarioNombre), destinatarioTelefono: limpio(b.destinatarioTelefono),
    direccionEntrega: limpio(b.direccionEntrega), origen: "portal", clienteId, viaChatbot
  };
  if (!d.nombre || !d.direccionRecogida || !d.destinatarioNombre || !d.direccionEntrega) throw invalido("Completa los campos obligatorios");
  if (await Solicitud.hayRepetidaReciente(d)) return { repetida: true, solicitudId: null };
  if ((await Solicitud.contarPendientesDeCliente(clienteId)) >= MAX_PENDIENTES_CLIENTE) {
    throw new HttpError(429, "DEMASIADAS_SOLICITUDES", "Tienes muchas solicitudes sin revisar. Espera a que la oficina las atienda o escríbenos por WhatsApp.");
  }
  const s = await Solicitud.crear(d);
  await Auditoria.registrar({
    uid: usuario.id,
    accion: `Pidió un envío ${viaChatbot ? "por el asistente (JSBot)" : "desde su portal"} (${d.direccionRecogida} → ${d.direccionEntrega})`,
    tabla: "solicitudes", registro: s.id
  });
  eventos.emitir(["solicitudes"], { solicitudClienteId: clienteId });
  return { repetida: false, solicitudId: s.id };
}
