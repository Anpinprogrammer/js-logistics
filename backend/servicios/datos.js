/* Lectura de datos por rol (lo que en la app hacían las suscripciones de cargarDatos()), historial, papelera y respaldo. */
import { MODELOS, COLS_ESTADO, Historial, Papelera, Pedidos, Usuarios, Meta, cargarEstado } from "../models/documentos.js";
import { COL_NOM } from "../helpers/constantes.js";
import { esDia, hoy } from "../helpers/fechas.js";
import { env } from "../config/env.js";
import { borrarArchivos, storageConfigurado } from "../helpers/storage.js";
import { datosInvalidos, noEncontrado } from "./errores.js";
import { enTransaccion } from "./transaccion.js";
import { registrar, resumenDoc } from "./historial.js";
import { exigirAdmin, exigirEquipo, texto } from "./contexto.js";

/** Qué puede leer cada rol, igual que firestore.rules + cargarDatos(). null = todo; objeto o lista = filtro. */
export function lecturasDe(a) {
  if (a.esCliente) return a.clienteId ? { pedidos: { clienteId: a.clienteId }, clientes: { id: a.clienteId }, movimientos: { clienteId: a.clienteId } } : {};
  if (a.esAdmin) return Object.fromEntries(COLS_ESTADO.map(c => [c, null]));
  const mid = a.mensajeroId, L = { vinculos: { uid: a.uid } };
  if (a.esAsistente) {
    Object.assign(L, { pedidos: null, clientes: null, mensajeros: null, movimientos: null, cuentas: null, recaudos: null, liquidaciones: null });
    L.cajamovs = [{ cat: "interna" }, { cat: "base" }, { personaUid: a.uid }];
  } else if (mid) Object.assign(L, { pedidos: { mensajeroId: mid }, mensajeros: { id: mid } });
  if (mid) {
    L.jornadas = { personaId: mid };
    if (!a.esAsistente) Object.assign(L, { recaudos: { mensajeroId: mid }, liquidaciones: { mensajeroId: mid } });
    L.cajamovs = [...(L.cajamovs || []), { personaId: mid }];
  }
  return L;
}
/** Colecciones de las que cada rol recibe avisos en tiempo real. */
export const visiblesDe = a => [...Object.keys(lecturasDe(a)), ...(a.esEquipo ? ["meta", "papelera"] : []), ...(a.esOficina ? ["solicitudes"] : [])];

/** Lista una colección con el filtro de su rol. */
export async function leer(db, col, filtro) {
  if (col === "vinculos") {
    const us = await Usuarios.listar(db, { filtro: filtro || undefined });
    return us.filter(u => u.mensajeroId).map(u => ({ uid: u.uid, mensajeroId: u.mensajeroId }));
  }
  if (col === "usuarios") return (await MODELOS.usuarios.listar(db, { filtro: filtro || undefined }));
  if (col === "pedidos") return Pedidos.listar(db, { filtro: filtro || undefined, intentos: true });
  return MODELOS[col].listar(db, { filtro: filtro || undefined });
}

/** Lo que el rol puede leer de una colección: null en lecturasDe = todo; si la colección no está, nada. */
export function leerDe(ctx, col) {
  const L = lecturasDe(ctx.actor);
  return col in L ? leer(ctx.db, col, L[col]) : Promise.resolve([]);
}

/** Todo lo que el usuario puede ver, en la forma de la app: { coleccion: { id: documento } }. */
export async function sincronizar(ctx) {
  const a = ctx.actor, L = lecturasDe(a), datos = {};
  await Promise.all(Object.entries(L).map(async ([col, filtro]) => {
    const pk = col === "vinculos" ? "uid" : MODELOS[col].pk;
    datos[col] = Object.fromEntries((await leer(ctx.db, col, filtro)).map(d => [d[pk], d]));
  }));
  return { datos, corte: a.esOficina ? await Meta.corte(ctx.db) : undefined };
}

/* ---------- historial ---------- */
const opDe = txt => (/^Creó /.test(txt) ? "crear" : /^Eliminó /.test(txt) ? "borrar" : "editar");
/** Cambios desde un día (AAAA-MM-DD en Colombia), lo más nuevo primero. Administración ve todo; los demás, lo suyo. */
export async function historial(ctx, { desde, buscar = "", limite = 600, pagina, porPagina } = {}) {
  const a = ctx.actor;
  exigirEquipo(a);
  const dia = desde || hoy();
  if (!esDia(dia)) throw datosInvalidos("El día no es válido (AAAA-MM-DD).");
  // Con pagina/porPagina se pagina en PostgreSQL; sin ellos se mantiene el tope antiguo de 600.
  const paginado = pagina !== undefined || porPagina !== undefined;
  const tam = paginado ? Math.min(100, Math.max(1, Number(porPagina) || 13)) : Math.min(5000, Math.max(1, Number(limite) || 600));
  const p = await Historial.paginar(ctx.db, {
    desde: Date.parse(dia + "T00:00:00-05:00"),
    uid: a.esAdmin ? null : a.uid,
    buscar: texto(buscar, 80),
    pagina: paginado ? pagina : 1,
    porPagina: tam
  });
  return {
    cambios: p.filas.map(f => ({ id: String(f.id), fecha: f.fecha, quien: f.quien || "", op: opDe(f.accion), col: f.tabla || "", docId: f.registro || "", resumen: f.accion })),
    pagina: p.pagina, porPagina: p.porPagina, total: p.total, paginas: p.paginas
  };
}
/** Anotaciones que la app hace directamente (por ejemplo, "Envió saldo por WhatsApp a …"). */
export async function anotar(ctx, { texto: txt }) {
  exigirEquipo(ctx.actor);
  const a = texto(txt, 1000);
  if (!a) throw datosInvalidos("Falta el texto.");
  await enTransaccion(ctx, t => registrar(t, a));
  return { anotado: true };
}

/* ---------- papelera ---------- */
export async function papelera(ctx) {
  exigirAdmin(ctx.actor);
  const N = await cargarEstado(ctx.db, ["clientes", "mensajeros"]);
  const quien = Object.fromEntries((await Usuarios.listar(ctx.db)).map(u => [u.uid, u.nombre || u.email]));
  const lista = await Papelera.listar(ctx.db, { limite: 300 });
  return lista.map(x => ({ id: x.id, col: x.col, docId: x.docId, tipo: COL_NOM[x.col] || x.col, resumen: resumenDoc(N, x.col, x.docId, x.data),
    fecha: x.fecha, quien: quien[x.uid] || "" }));
}
/** Restaurar tal como estaba. Un pedido vuelve con sus intentos y sus fotos (los archivos siguen en el bucket). */
export async function restaurar(ctx, id) {
  exigirAdmin(ctx.actor);
  return enTransaccion(ctx, async t => {
    const x = await Papelera.obtener(t.c, id);
    if (!x) throw noEncontrado("Ya no está en la papelera.");
    const M = MODELOS[x.col];
    if (!M) throw datosInvalidos("Ese registro no se puede restaurar aquí.");
    const { _archivos, ...doc } = x.data || {};
    if (await M.existe(t.c, x.docId)) throw datosInvalidos("Ya existe un registro con ese mismo código: no se puede restaurar encima.");
    await M.guardar(t.c, { ...doc, [M.pk]: doc[M.pk] ?? x.docId });
    if (x.col === "pedidos") await Pedidos.ponerArchivos(t.c, x.docId, _archivos);
    t.cambios.add(x.col);
    await Papelera.borrar(t.c, id);
    t.cambios.add("papelera");
    await registrar(t, "Restauró " + (COL_NOM[x.col] || x.col) + ": " + resumenDoc(await cargarEstado(t.c, ["clientes", "mensajeros"]), x.col, x.docId, x.data), { col: x.col, id: x.docId });
    return { col: x.col, id: x.docId };
  });
}
/** Borrar del todo. Las fotos de un pedido se borran del bucket. Sin id: vacía la papelera. */
export async function eliminarDefinitivo(ctx, id) {
  exigirAdmin(ctx.actor);
  const rutas = [];
  const r = await enTransaccion(ctx, async t => {
    const xs = id ? [await Papelera.obtener(t.c, id)].filter(Boolean) : await Papelera.listar(t.c, { limite: 100000 });
    if (id && !xs.length) throw noEncontrado("Ya no está en la papelera.");
    for (const x of xs) {
      if (x.col === "pedidos") rutas.push(...(x.data?._archivos || []).map(f => f.ruta).filter(Boolean));
      await Papelera.borrar(t.c, x.id);
    }
    t.cambios.add("papelera");
    if (xs.length) await registrar(t, id ? "Borró del todo de la papelera: " + (COL_NOM[xs[0].col] || xs[0].col) + " " + xs[0].docId : "Vació la papelera (" + xs.length + ")");
    return { borrados: xs.length };
  });
  // Los archivos se borran después de confirmar la transacción. Si falla, quedan en el bucket sin registro (no se pierde nada de la base).
  if (rutas.length && storageConfigurado()) await borrarArchivos(rutas).catch(e => console.error("No se pudieron borrar fotos de la papelera:", e.message));
  return r;
}

/* ---------- respaldo ---------- */
/** Copia completa en JSON { coleccion: { id: documento } }. Las fotos quedan como rutas del bucket (en pedido_archivos). */
export async function exportar(ctx) {
  exigirAdmin(ctx.actor);
  const out = {};
  for (const col of Object.keys(MODELOS)) {
    const m = MODELOS[col];
    out[col] = Object.fromEntries((await leer(ctx.db, col)).map(d => [d[m.pk], d]));
  }
  out.archivos = (await ctx.db.query(`SELECT guia, tipo, ruta, creado FROM pedido_archivos ORDER BY id`)).rows;
  out.ajustes = Object.fromEntries((await ctx.db.query(`SELECT clave, valor FROM ajustes`)).rows.map(r => [r.clave, r.valor]));
  out.exportado = new Date().toISOString();
  return out;
}
/** Espacio usado: base de datos y fotos del bucket. */
export async function espacio(ctx) {
  exigirAdmin(ctx.actor);
  const db = (await ctx.db.query(`SELECT pg_database_size(current_database()) AS bytes`)).rows[0].bytes;
  const tablas = (await ctx.db.query(`SELECT relname AS tabla, pg_total_relation_size(relid) AS bytes, n_live_tup AS filas FROM pg_stat_user_tables ORDER BY 2 DESC`)).rows;
  let fotos = null;
  try { // en Supabase, los archivos del bucket están en storage.objects
    fotos = (await ctx.db.query(`SELECT count(*)::int AS archivos, COALESCE(sum((metadata->>'size')::bigint), 0) AS bytes FROM storage.objects WHERE bucket_id = $1`,
      [env.STORAGE_BUCKET])).rows[0];
  } catch { fotos = null; }
  return { baseDeDatos: { bytes: Number(db), tablas: tablas.map(t => ({ ...t, bytes: Number(t.bytes), filas: Number(t.filas) })) }, fotos, hoy: hoy() };
}
