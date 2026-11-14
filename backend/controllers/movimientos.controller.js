/* Movimientos de la cuenta de los clientes (pagos, pagos a clientes, compras por encargo, ganancias, cargos y abonos).
   Las reglas están en servicios/movimientos.js. */
import * as S from "../servicios/movimientos.js";
import { leerDe } from "../servicios/datos.js";
import * as Movimiento from "../models/movimiento.model.js";
import { invalido, prohibido } from "../helpers/errores.js";
import { responder, diaDeFecha } from "./accion.js";

const conDia = b => ({ ...b, dia: b.dia ?? diaDeFecha(b.fecha) });
const soloMedio = b => Object.keys(b).length === 1 && b.medio !== undefined;

export const listar = responder(async ctx => {
  return leerDe(ctx, "movimientos");
}, { clave: "movimientos" });
export const crear = responder((ctx, req) => S.crear(ctx, conDia(req.valido.body)), { clave: "movimiento", status: 201 });
/** Solo { medio }: el asistente corrige el medio de un pago suyo. Lo demás: administración edita el movimiento. */
export const actualizar = responder((ctx, req) => {
  const b = req.valido.body, id = req.valido.params.id;
  return soloMedio(b) ? S.cambiarMedio(ctx, "movimientos", id, b) : S.editar(ctx, id, conDia(b));
}, { clave: "movimiento" });
export const eliminar = responder((ctx, req) => S.eliminar(ctx, req.valido.params.id));
export const reversar = responder((ctx, req) => S.reversarPagos(ctx, req.valido.body));
export const pagina = responder((ctx, req) => S.paginaOficina(ctx, req.valido.query));
export const ganancias = responder((ctx, req) => S.gananciasPorCliente(ctx, req.valido.query));

/** POST /movimientos/recibidos: 201 { movimiento, clienteNombre, saldoCliente, debe }. */
export const recibir = responder((ctx, req) => S.recibirDeMensajero(ctx, req.valido.body), { status: 201 });

/** De cuál mensajero se piden los datos: el mensajero ve lo suyo (lo que mande la petición no cuenta); la oficina dice de cuál. */
function mensajeroDePeticion(req) {
  const u = req.usuario, pedido = req.valido.query.mensajeroId;
  if (u.rol === "admin" || u.rol === "asistente") {
    const mensajeroId = pedido || u.mensajeroId;
    if (!mensajeroId) throw invalido("Elige el mensajero", { mensajeroId: "Elige el mensajero" });
    return mensajeroId;
  }
  if (!u.mensajeroId) throw prohibido("Tu cuenta no está vinculada con tu nombre en Personal. Pídele a administración que la vincule.");
  return u.mensajeroId;
}

/** GET /movimientos/recibidos: { resumen, registros, pagina, porPagina, total, paginas }, igual a la caja del patinador.
    El mensajero ve lo suyo (lo que mande la petición no cuenta); la oficina dice de cuál mensajero. */
export async function recibidos(req, res) {
  const { pagina, porPagina } = req.valido.query, mensajeroId = mensajeroDePeticion(req);
  const [resumen, lista] = await Promise.all([Movimiento.resumenRecibidos(mensajeroId), Movimiento.recibidosPagina({ mensajeroId, pagina, porPagina })]);
  res.json({ resumen, ...lista });
}

/** GET /movimientos/recibidos/historial?buscar=&tipo=&dia=&pagina=&porPagina=&mensajeroId=: { registros, pagina, porPagina, total, paginas }.
    Mezcla lo que recibió de clientes (`tipo: "pago"`) con lo que entregó a la oficina (`tipo: "entrega"`, incluida la liquidación). */
export async function historialRecibidos(req, res) {
  const { pagina, porPagina, buscar, tipo, dia, medio } = req.valido.query;
  res.json(await Movimiento.historialRecibidos({ mensajeroId: mensajeroDePeticion(req), pagina, porPagina, buscar, tipo, dia, medio }));
}
