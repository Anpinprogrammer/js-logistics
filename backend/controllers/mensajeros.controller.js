/* Personal: la oficina ve la lista; cada mensajero solo su ficha; solo administración la cambia. */
import * as Mensajero from "../models/mensajero.model.js";
import * as Auditoria from "../models/auditoria.model.js";
import { transaccion } from "../config/db.js";
import { conflicto, noEncontrado, prohibido } from "../helpers/errores.js";
import { esOficina } from "../middleware/autorizar.js";

export async function listar(req, res) {
  const incluirInactivos = req.query.inactivos === "true";
  res.json({ mensajeros: await Mensajero.listar({ incluirInactivos }) });
}

export async function obtener(req, res) {
  const { id } = req.valido.params;
  if (!esOficina(req.usuario) && req.usuario.mensajeroId !== id) throw prohibido();
  const m = await Mensajero.buscarPorId(id);
  if (!m) throw noEncontrado("La persona no existe");
  res.json({ mensajero: m });
}

export async function crear(req, res) {
  const m = await Mensajero.crear(req.valido.body);
  await Auditoria.registrar({ uid: req.usuario.id, accion: `Agregó a ${m.nombre} al personal`, tabla: "mensajeros", registro: m.id });
  res.status(201).json({ mensajero: m });
}

export async function actualizar(req, res) {
  const { id } = req.valido.params;
  const m = await Mensajero.actualizar(id, req.valido.body);
  if (!m) throw noEncontrado("La persona no existe");
  await Auditoria.registrar({ uid: req.usuario.id, accion: `Editó a ${m.nombre}`, tabla: "mensajeros", registro: id, datos: req.valido.body });
  res.json({ mensajero: m });
}

export async function eliminar(req, res) {
  const { id } = req.valido.params;
  await transaccion(async db => {
    const m = await Mensajero.buscarPorId(id, db);
    if (!m) throw noEncontrado("La persona no existe");
    try {
      await Mensajero.eliminar(id, db);
    } catch (e) {
      if (e.code === "23503") throw conflicto("Tiene pedidos o movimientos de caja. Desactívala en vez de borrarla.", "EN_USO");
      throw e;
    }
    await Auditoria.aPapelera({ tabla: "mensajeros", registro: id, datos: m, uid: req.usuario.id }, db);
    await Auditoria.registrar({ uid: req.usuario.id, accion: `Borró a ${m.nombre} del personal`, tabla: "mensajeros", registro: id }, db);
  });
  res.status(204).end();
}
