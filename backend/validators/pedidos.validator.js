import { z } from "zod";
import { id, texto, pesos, medio } from "./comunes.js";
import { METODOS_ENTREGA, CUENTAS_JS, MOTIVOS } from "../helpers/negocio.js";
import { TIPOS_ARCHIVO } from "../helpers/imagenes.js";

export const paramGuia = z.object({ guia: z.string().trim().regex(/^JS-\d{5,}$/, "Guía inválida") });

const fecha = z.coerce.date();

export const listar = z.object({
  estado: z.enum(["pendiente", "entregado", "devuelto"]).optional(),
  mensajeroId: id.optional(),
  clienteId: id.optional(),
  desde: fecha.optional(),
  hasta: fecha.optional(),
  entregadoDesde: fecha.optional(),
  entregadoHasta: fecha.optional(),
  cerrados: z.enum(["true", "false"]).transform(v => v === "true").optional(),
  buscar: texto(60).optional(),
  conDiferencia: z.enum(["true", "false"]).transform(v => v === "true").optional(),
  limite: z.coerce.number().int().min(1).max(500).default(100),
  cursor: z.coerce.number().int().positive().optional()
});

// El mensajero solo manda el body vacío: la guía queda a su nombre y en cero.
export const crear = z.object({
  mensajeroId: id.optional(),
  clienteId: id.nullish(),
  valorServicio: pesos.default(0),
  aCobrar: pesos.default(0)
});

const conCuenta = (d, ctx) => {
  if (d.metodo === "transf_js" && !d.cuentaJs)
    ctx.addIssue({ code: "custom", path: ["cuentaJs"], message: "Elige a qué cuenta llegó la transferencia" });
};

export const entrega = z.object({
  destinatario: texto(120).min(1, "Escribe quién recibió"),
  valorCobrado: pesos,
  metodo: z.enum(METODOS_ENTREGA),
  cuentaJs: z.enum(CUENTAS_JS).optional(),
  cambio: z.boolean().default(false),
  gasto: pesos.default(0),
  gastoNota: texto(200).default("")
}).superRefine(conCuenta);

export const noEntregado = z.object({
  motivo: z.enum(MOTIVOS),
  nota: texto(300).default("")
}).refine(d => d.motivo !== "otro" || d.nota, { message: "Escribe qué pasó", path: ["nota"] });

// Corrección del mensajero dentro de las 24 horas siguientes a la entrega o devolución.
export const correccion = z.object({
  destinatario: texto(120).optional(),
  valorCobrado: pesos.optional(),
  metodo: z.enum(METODOS_ENTREGA).optional(),
  cuentaJs: z.enum(CUENTAS_JS).optional(),
  cambio: z.boolean().optional(),
  gasto: pesos.optional(),
  gastoNota: texto(200).optional(),
  motivoDev: z.enum(MOTIVOS).optional(),
  notaDev: texto(300).optional()
}).superRefine(conCuenta);

// Lo que organiza la oficina. valorCobrado y metodo solo los corrige administración (lo valida el controlador).
export const actualizar = z.object({
  mensajeroId: id.optional(),
  clienteId: id.nullable().optional(),
  valorServicio: pesos.optional(),
  aCobrar: pesos.optional(),
  gasto: pesos.optional(),
  gastoNota: texto(200).optional(),
  cobrarDev: z.boolean().optional(),
  difRevisada: z.boolean().optional(),
  domiPagado: z.boolean().optional(),
  domiPagoMedio: medio.optional(),
  domiPagoValor: pesos.optional(),
  valorCobrado: pesos.optional(),
  metodo: z.enum(METODOS_ENTREGA).optional(),
  cuentaJs: z.enum(["", ...CUENTAS_JS]).optional()
}); // si domiPagado viene sin medio o sin valor, el servidor usa los que ya tenía la guía (o responde qué falta)

export const pagoDomicilio = z.object({ medio, valor: pesos.refine(v => v > 0, "Escribe el valor que pagó") });
export const enBloque = z.object({
  modo: z.enum(["sin", "serv"]),
  guias: z.array(paramGuia.shape.guia).min(1).max(1000),
  clienteId: id.optional(),
  valorServicio: pesos.optional(),
  usarTarifaCliente: z.boolean().default(true)
});

export const paramArchivo = paramGuia.extend({ tipo: z.enum(TIPOS_ARCHIVO, { error: "Tipo de archivo inválido" }) });
