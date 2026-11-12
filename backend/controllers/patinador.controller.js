/* Caja del patinador: anota lo que le pagan los clientes en su ruta y ve el total acumulado.
   El patinador solo ve y anota en su caja (la de su ficha en Personal); la oficina puede consultar la de cualquiera. */
import { transaccion } from "../config/db.js";
import * as Caja from "../models/cajaPatinador.model.js";
import * as Cliente from "../models/cliente.model.js";
import * as Auditoria from "../models/auditoria.model.js";
import { esOficina } from "../middleware/autorizar.js";
import { invalido, noEncontrado, prohibido } from "../helpers/errores.js";

const pesos = n => new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 }).format(n);

/** Ficha del patinador que hace la petición. Sin vínculo no hay caja donde anotar. */
function fichaPropia(u) {
  if (!u.mensajeroId) throw prohibido("Tu cuenta no está vinculada con tu nombre en Personal. Pídele a administración que la vincule.");
  return u.mensajeroId;
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

/** POST /patinador/caja: anota un pago. Responde 201 { registro, resumen } para pintar el total nuevo sin otra petición. */
export async function registrar(req, res) {
  const mensajeroId = fichaPropia(req.usuario);
  const { clienteId, concepto, valor } = req.valido.body;
  const r = await transaccion(async db => {
    const c = await Cliente.buscarPorId(clienteId, db);
    if (!c) throw noEncontrado("Ese cliente ya no existe. Búscalo de nuevo.");
    const registro = await Caja.crear({ mensajeroId, clienteId, concepto, valor, porUid: req.usuario.id }, db);
    await Auditoria.registrar({
      uid: req.usuario.id, accion: `Recibió ${pesos(valor)} de ${c.nombre} (${concepto})`,
      tabla: "caja_patinador", registro: registro.id, datos: { clienteId, concepto, valor }
    }, db);
    return { registro, resumen: await Caja.resumen(mensajeroId, db) };
  });
  res.status(201).json(r);
}
