/* Caja del patinador: anota lo que le pagan los clientes en su ruta y ve el total acumulado.
   El patinador solo ve y anota en su caja (la de su ficha en Personal); la oficina puede consultar la de cualquiera, y
   administración también puede anotar en ella (el modo Patinador de su app, igual que el modo Mensajero). */
import { enTransaccion, guardar } from "../servicios/transaccion.js";
import { ctxDe } from "./accion.js";
import { nuevoId } from "../helpers/ids.js";
import { ahora } from "../helpers/reloj.js";
import * as Caja from "../models/cajaPatinador.model.js";
import * as Cliente from "../models/cliente.model.js";
import * as Mensajero from "../models/mensajero.model.js";
import * as Auditoria from "../models/auditoria.model.js";
import { esAdmin, esOficina } from "../middleware/autorizar.js";
import { invalido, noEncontrado, prohibido } from "../helpers/errores.js";

const pesos = n => new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 }).format(n);

/** Ficha del patinador que hace la petición. Sin vínculo no hay caja donde anotar. */
function fichaPropia(u) {
  if (!u.mensajeroId) throw prohibido("Tu cuenta no está vinculada con tu nombre en Personal. Pídele a administración que la vincule.");
  return u.mensajeroId;
}

/** Ficha en la que anota administración: la que eligió, y tiene que ser un patinador. */
async function fichaElegida(mensajeroId, db) {
  if (!mensajeroId) throw invalido("Elige el patinador", { mensajeroId: "Elige el patinador" });
  const m = await Mensajero.buscarPorId(mensajeroId, db);
  if (!m) throw noEncontrado("Ese patinador ya no existe. Elígelo de nuevo.");
  if (m.tipo !== "patinador") throw invalido("Esa persona no es patinador", { mensajeroId: "Elige un patinador" });
  return m;
}

/** GET /patinador/caja: { resumen, registros, pagina, porPagina, total, paginas }. */
export async function caja(req, res) {
  const { mensajeroId: pedido, pagina, porPagina } = req.valido.query;
  let mensajeroId;
  if (esOficina(req.usuario)) {
    if (!pedido) throw invalido("Elige el patinador", { mensajeroId: "Elige el patinador" });
    mensajeroId = pedido;
  } else mensajeroId = fichaPropia(req.usuario); // lo que mande la petición no cuenta
  const [resumen, lista] = await Promise.all([Caja.resumen(mensajeroId), Caja.listarPagina({ mensajeroId, pagina, porPagina })]);
  res.json({ resumen, ...lista });
}

/** POST /patinador/caja: anota un pago. Responde 201 { registro, resumen } para pintar el total nuevo sin otra petición.
    Lo que paga el cliente queda a su favor en su cuenta (un abono), como cuando el mensajero cobra al entregar; la caja de JS
    no se mueve hasta que el patinador entregue el dinero a la oficina. Todo en una transacción: o quedan las dos cosas o ninguna. */
export async function registrar(req, res) {
  const { mensajeroId: elegido, clienteId, concepto, valor } = req.valido.body;
  const admin = esAdmin(req.usuario);
  if (!admin && elegido) throw invalido("Solo puedes anotar en tu caja", { mensajeroId: "Solo puedes anotar en tu caja" });
  const mensajeroId = admin ? elegido : fichaPropia(req.usuario);
  const r = await enTransaccion(ctxDe(req), async t => {
    // Quién recibió la plata: la ficha del patinador (si anota administración, no es quien hace la petición).
    const ficha = admin ? await fichaElegida(mensajeroId, t.c) : null;
    const quien = ficha ? ficha.nombre : t.actor.nombre;
    const c = await Cliente.buscarPorId(clienteId, t.c);
    if (!c) throw noEncontrado("Ese cliente ya no existe. Búscalo de nuevo.");
    const movimientoId = nuevoId();
    await guardar(t, "movimientos", {
      id: movimientoId, clienteId, tipo: "abono", valor, medio: "", nota: `Recibido por ${quien}: ${concepto}`.slice(0, 300),
      fecha: ahora(), porUid: req.usuario.id, porNombre: t.actor.nombre
    });
    const registro = await Caja.crear({ mensajeroId, clienteId, concepto, valor, porUid: req.usuario.id, movimientoId }, t.c);
    await Auditoria.registrar({
      uid: req.usuario.id,
      accion: ficha ? `Anotó en la caja de ${ficha.nombre}: recibió ${pesos(valor)} de ${c.nombre} (${concepto})` : `Recibió ${pesos(valor)} de ${c.nombre} (${concepto})`,
      tabla: "caja_patinador", registro: registro.id, datos: { mensajeroId, clienteId, concepto, valor }
    }, t.c);
    return { registro, resumen: await Caja.resumen(mensajeroId, t.c) };
  });
  res.status(201).json(r);
}

/** GET /patinador/resumen (oficina): cuánto recibió cada patinador, cuánto ya entregó y cuánto debe. */
export async function resumen(_req, res) {
  res.json({ patinadores: await Caja.resumenPatinadores() });
}
