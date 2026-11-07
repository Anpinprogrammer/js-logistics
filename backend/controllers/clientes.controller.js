/* Clientes: la oficina los ve y registra; borrar solo administración; el cliente ve solo su ficha. */
import * as Cliente from "../models/cliente.model.js";
import * as Auditoria from "../models/auditoria.model.js";
import { transaccion } from "../config/db.js";
import { conflicto, noEncontrado, prohibido } from "../helpers/errores.js";
import { esOficina } from "../middleware/autorizar.js";

export async function listar(req, res) {
  res.json({ clientes: await Cliente.listar(req.valido.query) });
}

export async function obtener(req, res) {
  const { id } = req.valido.params;
  if (!esOficina(req.usuario) && req.usuario.clienteId !== id) throw prohibido();
  const c = await Cliente.buscarPorId(id);
  if (!c) throw noEncontrado("El cliente no existe");
  res.json({ cliente: c });
}

export async function crear(req, res) {
  const { confirmarRepetido, ...datos } = req.valido.body;
  if (!confirmarRepetido) {
    const parecidos = await Cliente.parecidos(datos);
    if (parecidos.length) {
      return res.status(409).json({
        error: { code: "POSIBLE_REPETIDO", message: "Ya hay un cliente parecido. Envía confirmarRepetido: true para crearlo igual." },
        parecidos
      });
    }
  }
  const c = await Cliente.crear(datos);
  await Auditoria.registrar({ uid: req.usuario.id, accion: `Creó el cliente ${c.nombre}`, tabla: "clientes", registro: c.id });
  res.status(201).json({ cliente: c });
}

export async function actualizar(req, res) {
  const { id } = req.valido.params;
  const c = await Cliente.actualizar(id, req.valido.body);
  if (!c) throw noEncontrado("El cliente no existe");
  await Auditoria.registrar({ uid: req.usuario.id, accion: `Editó el cliente ${c.nombre}`, tabla: "clientes", registro: id, datos: req.valido.body });
  res.json({ cliente: c });
}

/** Borra y deja copia en la papelera. Si tiene pedidos o movimientos, la base no deja borrarlo. */
export async function eliminar(req, res) {
  const { id } = req.valido.params;
  await transaccion(async db => {
    const c = await Cliente.buscarPorId(id, db);
    if (!c) throw noEncontrado("El cliente no existe");
    try {
      await Cliente.eliminar(id, db);
    } catch (e) {
      if (e.code === "23503") throw conflicto("El cliente tiene pedidos o movimientos. Únelo con otro en vez de borrarlo.", "EN_USO");
      throw e;
    }
    await Auditoria.aPapelera({ tabla: "clientes", registro: id, datos: c, uid: req.usuario.id }, db);
    await Auditoria.registrar({ uid: req.usuario.id, accion: `Borró el cliente ${c.nombre}`, tabla: "clientes", registro: id }, db);
  });
  res.status(204).end();
}
