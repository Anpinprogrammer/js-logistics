/* Esquemas de caja, movimientos de clientes, recaudos, liquidaciones, cuentas internas, sueldos, historial y papelera.
   Aquí se revisa la forma (tipos y largos). Las reglas del negocio, con los mismos mensajes que la app,
   las revisan los servicios (servicios/*.js), porque muchas dependen de lo que hay en la base. */
import { z } from "zod";
import { id, pesos, texto } from "./comunes.js";

const valor = z.union([z.number(), z.string().max(20)]);
const fecha = z.union([z.string().max(40), z.number()]).nullish();
const dia = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "El día no es válido (AAAA-MM-DD).");

export const paramId = z.object({ id: z.string().trim().min(1).max(120) });
export const paramUid = z.object({ uid: id });

export const movimiento = z.looseObject({
  clienteId: id.nullish(), tipo: z.string().max(40).optional(), valor: valor.optional(), medio: z.string().max(20).nullish(),
  nota: texto(300).optional(), dia: dia.optional(), fecha
});
/** Recepción → Recibir dinero (mensajero). La hora la pone el servidor: no se aceptan campos de más. */
export const recibido = z.object({
  clienteId: id,
  concepto: z.string().trim().min(1, "Escribe el concepto").max(80, "El concepto es muy largo (máximo 80 letras)"),
  valor: pesos.refine(v => v > 0, "Escribe un valor mayor a cero"),
  // Efectivo: lo tiene el mensajero. Nequi o Bancolombia: el cliente transfirió a la cuenta de JS.
  medio: z.enum(["efectivo", "nequi", "bancolombia"], { error: "Elige cómo pagó: efectivo, Nequi o Bancolombia" }).default("efectivo"),
  mensajeroId: id.optional() // solo administración (cuando actúa como un mensajero); al mensajero se le ignora
}).strict();
export const recibidos = z.object({
  mensajeroId: id.optional(),
  pagina: z.coerce.number().int().min(1).default(1),
  porPagina: z.coerce.number().int().min(1).max(100).default(8)
});
/** Historial de Recepción: lo recibido y lo entregado, con texto, tipo (ingresos = pagos, salidas = entregas) y día de Colombia. */
export const recibidosHistorial = recibidos.extend({
  buscar: z.string().trim().max(60).optional(),
  tipo: z.enum(["todos", "ingresos", "salidas"]).default("todos"),
  medio: z.enum(["efectivo", "nequi", "bancolombia"]).optional(),
  dia: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Fecha inválida").optional()
});
export const reversar = z.object({ ids: z.array(id).min(1).max(500) });

/** Pestaña Cuentas: página de movimientos de clientes y ganancias por cliente. */
const pagina = z.coerce.number().int().min(1).optional();
const porPagina = z.coerce.number().int().min(1).max(100).optional();
export const movimientosPagina = z.object({
  buscar: texto(80).optional(),
  tipo: z.enum(["todos", "pagos", "compras", "ganancias"]).default("todos"),
  desde: dia.optional(), hasta: dia.optional(), pagina, porPagina
});
export const gananciasPagina = z.object({ buscar: texto(80).optional(), desde: dia.optional(), hasta: dia.optional(), pagina, porPagina });
export const movimientosCuentaPagina = z.object({
  dia: dia.optional(),
  medio: z.enum(["efectivo", "nequi", "bancolombia"]).optional(),
  pagina, porPagina
});

export const recaudo = z.looseObject({ mensajeroId: id.optional(), valor: valor.optional(), medio: z.string().max(20).optional(), nota: texto(200).optional(), fecha });

export const liquidacion = z.looseObject({
  mensajeroId: id, entregaFinal: valor.optional(), medio: z.string().max(20).optional(), adelanto: valor.optional(),
  pasarAdelanto: z.boolean().optional(), semanaAdelanto: z.string().max(10).optional(), semana: z.string().max(10).optional()
});
export const ajusteLiquidacion = z.object({ debe: valor, adelanto: valor });
export const liquidacionesPagina = z.object({
  pagina: z.coerce.number().int().min(1).optional(),
  porPagina: z.coerce.number().int().min(1).max(100).optional(),
  dia: dia.optional(),
  estado: z.enum(["todos", "cobrar", "favor", "paz"]).default("todos"),
  buscar: texto(80).optional()
});

export const cajaMov = z.looseObject({
  tipo: z.string().max(20), cat: z.string().max(20).optional(), valor: valor.optional(), medio: z.string().max(20).nullish(),
  concepto: texto(300).optional(), personaId: z.string().max(64).nullish(), personaUid: z.string().max(64).nullish(),
  cuentaId: z.string().max(64).nullish(), semana: z.string().max(10).nullish(), adelantoId: z.string().max(64).nullish(),
  nivel: z.boolean().optional(), dia: dia.optional(), fecha
});
export const devuelto = z.object({ devuelto: valor });
export const base = z.object({ mensajeroId: id, valor, concepto: texto(200).optional() });
export const baseOficina = z.object({ valor, nota: texto(200).optional() });
export const cierreOficina = z.object({ efectivo: valor.optional(), nequi: valor.optional(), bancolombia: valor.optional(), nota: texto(200).optional() });
// La app interna manda también lo que esperaba; se ignora: lo esperado lo calcula el servidor.
export const arqueo = z.object({
  contado: z.record(z.string(), valor).optional(), efectivo: valor.optional(), nequi: valor.optional(), bancolombia: valor.optional(),
  esperado: z.unknown().optional(), nota: texto(300).optional()
});
export const devolucion = z.object({ valor, medio: z.string().max(20) });

export const cuenta = z.object({ nombre: texto(80), tipo: z.string().max(20) });
export const movCuenta = z.object({ tipo: z.string().max(10), valor, medio: z.string().max(20), concepto: texto(300), dia: dia.optional(), fecha });

export const jornada = z.looseObject({ personaId: id, dia, valor: valor.optional(), previo: z.boolean().optional(), nota: texto(200).optional() });
export const semana = z.object({ semana: dia.optional() });
export const diaQuery = z.object({ dia: dia.optional() });
export const cuadre = z.object({ dia: dia.optional(), clienteId: id.optional() });

export const unir = z.object({ otros: z.array(id).min(1).max(100) });
export const pagarSaldos = z.object({ clienteIds: z.array(id).min(1).max(1000), medio: z.string().max(20) });

export const historial = z.object({
  desde: dia.optional(),
  buscar: texto(80).optional(),
  limite: z.coerce.number().int().min(1).max(5000).default(600),
  pagina: z.coerce.number().int().min(1).optional(),
  porPagina: z.coerce.number().int().min(1).max(100).optional()
});
export const nota = z.object({ texto: texto(1000) });
