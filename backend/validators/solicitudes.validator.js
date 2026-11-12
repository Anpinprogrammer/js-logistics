/* Validación de las solicitudes de envío: el formulario público y las acciones de la oficina. */
import { z } from "zod";
import { id, texto, pesos, email, telefono } from "./comunes.js";

const obligatorio = (max, msg) => texto(max).min(1, msg);
// Un celular o fijo de Colombia tiene al menos 7 dígitos; se cuentan solo los dígitos.
const telefonoReal = telefono.refine(v => v.replace(/\D/g, "").length >= 7, "Escribe un teléfono de contacto válido");

/** Formulario público. `sitio` es una trampa para robots: un humano no ve ese campo y lo deja vacío. */
export const crear = z.object({
  nombre: obligatorio(120, "Escribe tu nombre"),
  telefono: telefonoReal,
  email,
  direccionRecogida: obligatorio(200, "Escribe la dirección de recogida"),
  paquetes: z.coerce.number().int("Escribe un número entero").min(1, "Debe ser al menos 1 paquete").max(100, "Para más de 100 paquetes escríbenos por WhatsApp"),
  pesoKg: z.union([z.literal(""), z.null(), z.coerce.number().positive("El peso debe ser mayor que 0").max(1000, "Para más de 1.000 kg escríbenos por WhatsApp")])
    .optional().transform(v => (v === "" || v == null ? null : Math.round(v * 10) / 10)),
  destinatarioNombre: obligatorio(120, "Escribe el nombre de quien recibe"),
  destinatarioTelefono: telefono.default(""),
  direccionEntrega: obligatorio(200, "Escribe la dirección de entrega"),
  sitio: z.string().max(200).optional()
}).strict();

/** Desde el portal: los mismos campos, sin trampa para robots. El correo es opcional (si no llega, se usa el de la
   cuenta). `strict()` impide mandar clienteId, origen, estado o valor: esos los decide el servidor. */
export const crearPortal = crear.omit({ sitio: true, email: true }).extend({ email: email.optional() }).strict();

export const listar = z.object({
  estado: z.enum(["pendiente", "cotizada", "confirmada", "asignada", "rechazada"]).optional(),
  abiertas: z.enum(["true", "false"]).optional().transform(v => v === "true"),
  limite: z.coerce.number().int().min(1).max(200).default(50),
  // Pantalla de Solicitudes: con `grupo` o `pagina` responde una página del filtro.
  grupo: z.enum(["todas", "pendientes", "por-confirmar", "aceptadas", "rechazadas"]).optional(),
  pagina: z.coerce.number().int().min(1).optional(),
  porPagina: z.coerce.number().int().min(1).max(100).default(20),
  // Consulta filtrada de la pantalla administrativa; la API anterior sigue disponible.
  page: z.coerce.number().int().min(1).max(100_000).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
  status: z.enum(["todas", "pendientes", "por_confirmar", "aceptadas", "rechazadas"]).optional(),
  search: z.string().trim().max(120).optional(),
  source: z.enum(["todos", "portal", "web"]).optional(),
  date: z.iso.date().optional()
});

export const aceptar = z.object({ valor: pesos.refine(v => v > 0, "Escribe el valor del domicilio") });
// El cliente responde la propuesta: acepta o rechaza. La razón es opcional; si no la escribe, se guarda una genérica.
export const responderCliente = z.object({
  aceptar: z.boolean(),
  motivo: texto(300).refine(v => v.length === 0 || v.length >= 3, "Si escribes una razón, que tenga al menos 3 letras").optional()
}).strict();
// La razón es obligatoria: el cliente la ve en "Mis solicitudes" de su portal.
export const rechazar = z.object({ motivo: texto(300).min(3, "Escribe la razón del rechazo: el cliente la va a ver") });
export const mias = z.object({
  pagina: z.coerce.number().int().min(1).max(100_000).default(1),
  porPagina: z.coerce.number().int().min(1).max(50).default(10),
  // Con `sinTotal` el portal no consulta el total: la respuesta trae `hayMas`.
  sinTotal: z.enum(["true", "false"]).transform(v => v === "true").optional()
});
export const asignar = z.object({
  mensajeroId: id,
  // Remitente: un cliente que ya existe o, sin clienteId, uno nuevo con los datos de la solicitud.
  clienteId: id.optional()
});
