/* Pedidos. Reglas tomadas de firestore.rules y de la app (los cambios de estado y de dinero están en servicios/pedidos.js):
   - Oficina (admin y asistente) ve y organiza todos; borrar solo administración.
   - El mensajero crea guías a su nombre y en cero, entrega o devuelve las suyas pendientes,
     y corrige algunos datos durante 24 horas.
   - El cliente solo ve sus pedidos y confirma que recibió una prenda de cambio. */
import * as Pedido from "../models/pedido.model.js";
import * as Cliente from "../models/cliente.model.js";
import * as Mensajero from "../models/mensajero.model.js";
import * as Auditoria from "../models/auditoria.model.js";
import { transaccion } from "../config/db.js";
import { noEncontrado, prohibido, invalido } from "../helpers/errores.js";
import { VENTANA_CORRECCION_MS } from "../helpers/negocio.js";
import * as Servicio from "../servicios/pedidos.js";
import { ctxDe, responder } from "./accion.js";
import { esOficina } from "../middleware/autorizar.js";
import { firmarUrls, subirArchivo as subirAlBucket, borrarArchivos, storageConfigurado } from "../helpers/storage.js";
import { tipoDeImagen } from "../helpers/imagenes.js";
import { HttpError } from "../helpers/errores.js";
import { nuevoId } from "../helpers/ids.js";

/** Cambia la ruta interna de la miniatura por una URL firmada (`mini`), sin exponer la ruta del bucket. */
async function conMini(pedidos) {
  const urls = await firmarUrls(pedidos.map(p => p.miniRuta).filter(Boolean)).catch(e => { console.error(e.message); return {}; });
  return pedidos.map(({ miniRuta, ...p }) => ({ ...p, mini: (miniRuta && urls[miniRuta]) || null }));
}

const pesos = v => "$ " + Number(v || 0).toLocaleString("es-CO");

/** ¿Puede esta cuenta ver el pedido? */
const puedeVer = (u, p) =>
  esOficina(u) || (u.rol === "mensajero" && u.mensajeroId && p.mensajeroId === u.mensajeroId)
  || (u.rol === "cliente" && u.clienteId && p.clienteId === u.clienteId);

const esMio = (u, p) => u.rol === "mensajero" && !!u.mensajeroId && p.mensajeroId === u.mensajeroId;

export async function listar(req, res) {
  const filtros = { ...req.valido.query };
  const u = req.usuario;
  // Cada rol ve solo lo suyo: el filtro lo pone el servidor, no la petición.
  if (u.rol === "mensajero") {
    if (!u.mensajeroId) throw prohibido("Tu cuenta no está vinculada con tu nombre en Personal");
    filtros.mensajeroId = u.mensajeroId;
  } else if (u.rol === "cliente") {
    if (!u.clienteId) throw prohibido("Tu cuenta no está vinculada con un cliente");
    filtros.clienteId = u.clienteId;
  }
  if (filtros.pagina) { // paginador: el servidor filtra, cuenta y corta; la pantalla solo dibuja
    const { cursor: _c, limite: _l, ...resto } = filtros;
    const r = await Pedido.listarPagina(resto);
    return res.json({ ...r, pedidos: await conMini(r.pedidos) });
  }
  delete filtros.porPagina;
  const pedidos = await Pedido.listar(filtros);
  const siguiente = pedidos.length === filtros.limite ? pedidos[pedidos.length - 1].n : null;
  res.json({ pedidos: await conMini(pedidos), siguiente });
}

export async function obtener(req, res) {
  const p = await Pedido.buscarPorGuia(req.valido.params.guia);
  if (!p || !puedeVer(req.usuario, p)) throw noEncontrado("La guía no existe"); // no se dice si existe a quien no la puede ver
  res.json({ pedido: (await conMini([p]))[0] });
}

/** Fotos y firmas del pedido con URL firmadas que vencen en 1 hora. */
export async function archivos(req, res) {
  const { guia } = req.valido.params;
  const p = await Pedido.buscarPorGuia(guia);
  if (!p || !puedeVer(req.usuario, p)) throw noEncontrado("La guía no existe");
  const lista = await Pedido.listarArchivos(guia, { incluirPrevias: esOficina(req.usuario) });
  const urls = await firmarUrls(lista.map(a => a.ruta));
  res.json({ archivos: lista.filter(a => urls[a.ruta]).map(a => ({ tipo: a.tipo, url: urls[a.ruta], creado: a.creado })) });
}

/** Sube una foto o firma (cuerpo binario JPEG, PNG o WebP) y la deja en el pedido.
    Oficina: cualquier guía. Mensajero: las suyas, mientras estén por recoger, en ruta o dentro de las 24 horas de corrección. */
export async function subirArchivo(req, res) {
  const { guia, tipo } = req.valido.params, u = req.usuario;
  if (!storageConfigurado())
    throw new HttpError(503, "FOTOS_NO_CONFIGURADAS", "Las fotos todavía no están configuradas en el servidor. Avísale a administración.");
  const p = await Pedido.buscarPorGuia(guia);
  if (!p || !(esOficina(u) || esMio(u, p))) throw noEncontrado("La guía no existe");
  const cerrada = p.estado === "entregado" || p.estado === "devuelto"; // "aceptado" (por recoger) y "pendiente" siguen abiertas
  if (!esOficina(u) && cerrada && Date.now() - new Date(p.entregado).getTime() > VENTANA_CORRECCION_MS)
    throw prohibido("Ya pasaron 24 horas: pídele a administración que agregue la foto");

  // El tipo se decide por el contenido, no por lo que diga el navegador.
  const img = tipoDeImagen(req.body);
  if (!img) throw new HttpError(415, "NO_ES_IMAGEN", "El archivo no es una foto válida. Usa una foto JPG, PNG o WebP.");

  // El nombre lo pone el servidor: nadie puede escribir sobre la foto de otro.
  const ruta = `${guia}/${tipo}-${Date.now()}-${nuevoId(8)}.${img.ext}`;
  await subirAlBucket(ruta, req.body, img.mime);
  let archivo;
  try {
    archivo = await transaccion(async db => {
      const a = await Pedido.agregarArchivo({ guia, tipo, ruta, por: u.id }, db);
      if (tipo !== "mini") await Auditoria.registrar({ uid: u.id, accion: `Agregó ${tipo === "firma" ? "la firma" : "foto de " + tipo} a ${guia}`, tabla: "pedidos", registro: guia }, db);
      return a;
    });
  } catch (e) {
    await borrarArchivos([ruta]).catch(x => console.error(x.message)); // que no quede un archivo sin registro
    throw e;
  }
  const urls = await firmarUrls([ruta]).catch(() => ({}));
  res.status(201).json({ archivo: { tipo, url: urls[ruta] ?? null, creado: archivo.creado } });
}

export async function crear(req, res) {
  const u = req.usuario, b = req.valido.body;
  let datos;
  if (u.rol === "mensajero") {
    if (!u.mensajeroId) throw prohibido("Tu cuenta no está vinculada con tu nombre en Personal");
    datos = { mensajeroId: u.mensajeroId, clienteId: null, valorServicio: 0, aCobrar: 0 }; // los valores los pone la oficina
  } else {
    if (!b.mensajeroId) throw invalido("Elige el mensajero", [{ campo: "mensajeroId", mensaje: "Obligatorio" }]);
    if (!(await Mensajero.buscarPorId(b.mensajeroId))) throw invalido("El mensajero no existe");
    if (b.clienteId && !(await Cliente.buscarPorId(b.clienteId))) throw invalido("El cliente no existe");
    datos = { mensajeroId: b.mensajeroId, clienteId: b.clienteId ?? null, valorServicio: b.valorServicio, aCobrar: b.aCobrar };
  }
  const p = await Pedido.crear({ ...datos, creadoPor: u.id });
  await Auditoria.registrar({ uid: u.id, accion: `Creó la guía ${p.guia}`, tabla: "pedidos", registro: p.guia });
  res.status(201).json({ pedido: p });
}

/* ---- Cambios de estado y de dinero: las reglas de la app están en servicios/pedidos.js.
   La respuesta es el pedido completo, con la misma forma que GET /pedidos/:guia. ---- */
const conPedido = fn => async (req, res) => {
  const { guia } = req.valido.params;
  await fn(ctxDe(req), guia, req.valido.body ?? {});
  res.json({ pedido: (await conMini([await Pedido.buscarPorGuia(guia)]))[0] });
};

/** Lo que organiza la oficina: remitente, valores, mensajero, domicilio pagado y (administración) la corrección de lo cobrado. */
export const actualizar = conPedido(Servicio.editarOficina);
/** El mensajero (o la oficina) recoge una guía "aceptado": con la foto de salida ya subida, pasa a en ruta. */
export const recoger = conPedido(Servicio.recoger);
/** El mensajero (o la oficina) registra la entrega de una guía pendiente. Con el bucket configurado, exige la foto y la firma. */
export const entregar = conPedido(Servicio.entregar);
/** No se pudo entregar: "reprogramar" deja la guía en ruta y anota el intento; los demás motivos la devuelven. */
export const noEntregado = conPedido(Servicio.noEntregado);
/** El mensajero corrige lo que registró, solo durante 24 horas. No cambia el estado ni la hora. */
export const corregir = conPedido(Servicio.corregir);
/** El mensajero pone el remitente de su guía pendiente que todavía no tiene uno. */
export const asignarRemitente = conPedido(Servicio.asignarRemitente);
/** El cliente (o la oficina) confirma que la prenda de un cambio llegó. */
export const confirmarCambio = conPedido(Servicio.cambioRecibido);
/** Administración devuelve la guía a "por entregar". Las pruebas de la entrega quedan como "previas". */
export const reabrir = conPedido(Servicio.reabrir);
export const pagoDomicilio = conPedido(Servicio.registrarPagoDomicilio);
export const quitarPagoDomicilio = conPedido(Servicio.quitarPagoDomicilio);
export const diferenciaRevisada = conPedido(Servicio.marcarDiferenciaRevisada);

/** Solo administración. Va a la papelera con sus intentos y fotos. Lo ya contado en un arqueo no se borra. */
export async function eliminar(req, res) {
  await Servicio.eliminar(ctxDe(req), req.valido.params.guia);
  res.status(204).end();
}

/** Remitente o valor del domicilio a varias guías a la vez. */
export const enBloque = responder((ctx, req) => Servicio.enBloque(ctx, req.valido.body));
