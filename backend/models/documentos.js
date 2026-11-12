/* Las tablas vistas como los documentos que usa app/js/app.js (camelCase, como en Firestore).
   Los cálculos de helpers/calculos.js y los servicios trabajan sobre esta forma, para que el servidor dé
   exactamente lo mismo que la app:
   - Fechas en milisegundos (en la base son TIMESTAMPTZ) y días en texto AAAA-MM-DD.
   - Un valor NULL no se devuelve (en Firestore ese campo "no existe"), así `p.domiPagoValor != null` da igual.
   - Al guardar, "" en una referencia (cliente, mensajero, cuenta…) pasa a NULL y el dinero se redondea a pesos enteros.
   Tipos de campo:
     texto  columna NOT NULL DEFAULT ''        ref    texto que puede ser NULL ("" → NULL)
     num    pesos NOT NULL (se redondea)        num?   pesos que pueden ser NULL
     int    entero                              bool   NOT NULL
     ms     TIMESTAMPTZ que puede ser NULL      ms!    TIMESTAMPTZ NOT NULL (si falta, la hora actual)
     dia    DATE (AAAA-MM-DD)                   arr    TEXT[] que puede ser NULL           json   JSONB */
import { aSnake } from "../helpers/sql.js";
import { diaDe } from "../helpers/fechas.js";
import { ahora } from "../helpers/reloj.js";

const esDiaTxt = v => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v);
const aFecha = v => {
  if (v === null || v === undefined || v === "" || v === 0) return null;
  const n = typeof v === "number" ? v : v instanceof Date ? v.getTime() : Number.isFinite(Number(v)) ? Number(v) : Date.parse(v);
  return Number.isFinite(n) && n > 0 ? new Date(n) : null;
};
const aPesos = v => { const n = Math.round(Number(v)); return Number.isFinite(n) ? n : 0; };

/** Valor de un campo del documento → valor de la columna. */
function aColumna(tipo, v) {
  switch (tipo) {
    case "texto": return v === null || v === undefined ? "" : String(v);
    case "ref": return v === null || v === undefined || v === "" ? null : String(v);
    case "num": case "int": return v === null || v === undefined || v === "" ? 0 : aPesos(v);
    case "num?": return v === null || v === undefined || v === "" ? null : aPesos(v);
    case "bool": return !!v;
    case "ms": return aFecha(v);
    case "ms!": return aFecha(v) ?? new Date(ahora());
    case "dia": return esDiaTxt(v) ? v : null;
    case "arr": return Array.isArray(v) ? v.map(String) : null;
    case "json": return v === null || v === undefined ? null : JSON.stringify(v);
    default: throw new Error("Tipo de campo desconocido: " + tipo);
  }
}
/** Valor de la columna → valor del documento (undefined = el campo no existe). */
function aCampo(tipo, v) {
  if (v === null || v === undefined) return undefined;
  if (tipo === "ms" || tipo === "ms!") return v instanceof Date ? v.getTime() : aFecha(v)?.getTime();
  if (tipo === "num" || tipo === "num?" || tipo === "int") return Number(v);
  return v;
}

/**
 * Modelo de una tabla con forma de documento.
 * campos: { campo: tipo | [tipo, columna] }. extra: la tabla tiene la columna JSONB `extra` para lo que no tiene columna.
 * actualizado: la tabla tiene `actualizado` y se pone en now() al cambiar. donde: condición fija (por ejemplo, solo activos).
 * leer(doc, fila): ajusta lo leído. alGuardar(doc): completa un documento entero antes de guardarlo (no se usa al actualizar campos sueltos).
 */
export function crearModelo({ col, tabla = col, pk, campos, extra = false, actualizado = false, donde = "", leer, alGuardar }) {
  const defs = Object.entries(campos).map(([campo, d]) => { const [tipo, columna] = Array.isArray(d) ? d : [d, aSnake(campo)]; return { campo, tipo, columna }; });
  const porCampo = Object.fromEntries(defs.map(d => [d.campo, d]));
  const pkCol = porCampo[pk].columna;
  const fijo = donde ? ` AND (${donde})` : "";

  function aDocumento(fila) {
    if (!fila) return null;
    const d = {};
    if (extra && fila.extra && typeof fila.extra === "object") Object.assign(d, fila.extra);
    for (const { campo, tipo, columna } of defs) {
      const v = aCampo(tipo, fila[columna]);
      if (v !== undefined) d[campo] = v;
    }
    return leer ? leer(d, fila) : d;
  }
  /** Separa el documento en columnas conocidas y lo demás (a `extra`, si la tabla lo tiene). */
  function separar(doc) {
    const cols = {}, resto = {};
    for (const [k, v] of Object.entries(doc || {})) {
      if (v === undefined || k === "actualizado") continue;
      if (porCampo[k]) cols[k] = v; else if (extra) resto[k] = v;
    }
    return { cols, resto };
  }
  const marca = (d, i) => (d.tipo === "json" ? `$${i}::jsonb` : `$${i}`);

  function construirDonde(filtro, params) {
    if (!filtro) return "";
    const grupos = Array.isArray(filtro) ? filtro : [filtro];
    const partes = grupos.map(g => {
      const conds = Object.entries(g).map(([campo, cond]) => {
        const d = porCampo[campo];
        if (!d) throw new Error(`Campo desconocido en ${tabla}: ${campo}`);
        if (cond && typeof cond === "object" && !Array.isArray(cond) && "in" in cond) { params.push(cond.in); return `${d.columna} = ANY($${params.length})`; }
        params.push(aColumna(d.tipo, cond));
        return params[params.length - 1] === null ? (params.pop(), `${d.columna} IS NULL`) : `${d.columna} = $${params.length}`;
      });
      return conds.length ? "(" + conds.join(" AND ") + ")" : "true";
    });
    return " AND " + (partes.length > 1 ? "(" + partes.join(" OR ") + ")" : partes[0]);
  }

  const m = {
    col, tabla, pk, campos: porCampo, aDocumento,

    async obtener(c, id, { bloquear = false } = {}) {
      const r = await c.query(`SELECT * FROM ${tabla} WHERE ${pkCol} = $1${fijo}${bloquear ? " FOR UPDATE" : ""}`, [id]);
      return aDocumento(r.rows[0]);
    },
    /** filtro: { campo: valor | { in: [...] } } o una lista de esos objetos (se unen con "o"). */
    async listar(c, { filtro, orden, limite } = {}) {
      const params = [];
      let sql = `SELECT * FROM ${tabla} WHERE true${fijo}` + construirDonde(filtro, params);
      if (orden) { const [k, dir] = orden.split(" "); sql += ` ORDER BY ${porCampo[k].columna}${dir === "desc" ? " DESC" : ""}`; }
      if (limite) { params.push(limite); sql += ` LIMIT $${params.length}`; }
      return (await c.query(sql, params)).rows.map(aDocumento);
    },
    /** Una página con el total del filtro: COUNT + LIMIT/OFFSET, sin traer todo a memoria. */
    async paginar(c, { filtro, orden, pagina = 1, porPagina = 20 } = {}) {
      const params = [];
      const where = `WHERE true${fijo}` + construirDonde(filtro, params);
      const total = (await c.query(`SELECT count(*)::int AS total FROM ${tabla} ${where}`, params)).rows[0]?.total || 0;
      const tam = Math.max(1, Math.min(5000, Number(porPagina) || 20));
      const paginas = Math.max(1, Math.ceil(total / tam));
      const actual = Math.min(Math.max(1, Number(pagina) || 1), paginas);
      const offset = (actual - 1) * tam;
      let sql = `SELECT * FROM ${tabla} ${where}`;
      if (orden) { const [k, dir] = orden.split(" "); sql += ` ORDER BY ${porCampo[k].columna}${dir === "desc" ? " DESC" : ""}`; }
      const valores = [...params, tam, offset];
      sql += ` LIMIT $${valores.length - 1} OFFSET $${valores.length}`;
      return { filas: (await c.query(sql, valores)).rows.map(aDocumento), total, pagina: actual, porPagina: tam, paginas };
    },
    async existe(c, id) {
      return (await c.query(`SELECT 1 FROM ${tabla} WHERE ${pkCol} = $1${fijo}`, [id])).rowCount > 0;
    },
    /** Crea o reemplaza el documento completo (set() de Firestore). */
    async guardar(c, doc) {
      const { cols, resto } = separar(alGuardar ? alGuardar({ ...doc }) : doc);
      if (cols[pk] == null) throw new Error(`Falta ${pk} al guardar en ${tabla}`);
      const params = [], nombres = [], marcas = [];
      for (const d of defs) { params.push(aColumna(d.tipo, cols[d.campo])); nombres.push(d.columna); marcas.push(marca(d, params.length)); }
      if (extra) { params.push(Object.keys(resto).length ? JSON.stringify(resto) : "{}"); nombres.push("extra"); marcas.push(`$${params.length}::jsonb`); }
      const set = nombres.filter(n => n !== pkCol).map(n => `${n} = EXCLUDED.${n}`).concat(actualizado ? ["actualizado = now()"] : []).join(", ");
      const r = await c.query(`INSERT INTO ${tabla} (${nombres.join(", ")}) VALUES (${marcas.join(", ")})
        ON CONFLICT (${pkCol}) DO UPDATE SET ${set} RETURNING *`, params);
      return aDocumento(r.rows[0]);
    },
    /** Cambia solo los campos dados de un documento que ya existe (update() de Firestore). null si no existe. */
    async actualizar(c, id, cambios) {
      const { cols, resto } = separar(cambios);
      delete cols[pk];
      const params = [], sets = [];
      for (const [campo, v] of Object.entries(cols)) { const d = porCampo[campo]; params.push(aColumna(d.tipo, v)); sets.push(`${d.columna} = ${marca(d, params.length)}`); }
      if (extra && Object.keys(resto).length) { params.push(JSON.stringify(resto)); sets.push(`extra = COALESCE(extra, '{}'::jsonb) || $${params.length}::jsonb`); }
      if (!sets.length) return m.obtener(c, id);
      if (actualizado) sets.push("actualizado = now()");
      params.push(id);
      const r = await c.query(`UPDATE ${tabla} SET ${sets.join(", ")} WHERE ${pkCol} = $${params.length}${fijo} RETURNING *`, params);
      return aDocumento(r.rows[0]);
    },
    /** Borra y devuelve lo que había (null si no existía). */
    async borrar(c, id) {
      const r = await c.query(`DELETE FROM ${tabla} WHERE ${pkCol} = $1${fijo} RETURNING *`, [id]);
      return aDocumento(r.rows[0]);
    }
  };
  return m;
}

/* ---------- colecciones de la app ---------- */

const pedidosBase = crearModelo({
  col: "pedidos", pk: "guia", actualizado: true,
  campos: {
    guia: "texto", n: "int", estado: "texto", creado: "ms!", por: ["ref", "creado_por"], mensajeroId: "ref", clienteId: "ref",
    valorServicio: "num", aCobrar: "num", entregado: "ms", destinatario: "texto", valorCobrado: "num", metodo: "texto", cuentaJs: "texto",
    difCobro: "num", difRevisada: "bool", entregoUid: "ref", motivoDev: "texto", notaDev: "texto", cobrarDev: "bool",
    cambio: "bool", cambioRecibido: "ms", cambioConfirmo: "ref", gasto: "num", gastoNota: "texto",
    domiPagado: "bool", domiPagoMedio: "ref", domiPagoValor: "num?", domiPagoFecha: "ms", domiPagoUid: "ref", fotosBorradas: "bool",
    destinoDev: "texto", reintentoDe: "ref", reintentoPedido: "ms"
  },
  // El nombre del remitente sale de la tabla de clientes (la app lo copiaba en el pedido para los mensajeros).
  leer: (d, fila) => (fila.cliente_nombre ? { ...d, clienteNombre: fila.cliente_nombre } : d)
});
const CON_NOMBRE = `SELECT p.*, c.nombre AS cliente_nombre FROM pedidos p LEFT JOIN clientes c ON c.id = p.cliente_id`;
const INTENTOS = `COALESCE((SELECT json_agg(json_build_object('fecha', (extract(epoch FROM i.fecha) * 1000)::bigint, 'motivo', i.motivo, 'nota', i.nota, 'uid', i.por) ORDER BY i.fecha, i.id)
  FROM pedido_intentos i WHERE i.guia = p.guia), '[]'::json) AS intentos`;
const conIntentos = d => (d ? { ...d, intentos: (d._intentos || []).map(i => (i.uid ? i : { fecha: i.fecha, motivo: i.motivo, nota: i.nota })) } : d);

async function ponerIntentos(c, guia, intentos) {
  await c.query(`DELETE FROM pedido_intentos WHERE guia = $1`, [guia]);
  for (const i of intentos || []) {
    await c.query(`INSERT INTO pedido_intentos (guia, fecha, motivo, nota, por) VALUES ($1, $2, $3, $4, $5)`,
      [guia, aFecha(i.fecha) ?? new Date(ahora()), i.motivo, String(i.nota ?? ""), i.uid || null]);
  }
}

/** Pedidos. Los intentos fallidos viven en pedido_intentos y las fotos en pedido_archivos (rutas del bucket). */
export const Pedidos = {
  ...pedidosBase,
  async obtener(c, guia, { bloquear = false } = {}) {
    if (bloquear) await c.query(`SELECT 1 FROM pedidos WHERE guia = $1 FOR UPDATE`, [guia]);
    const r = await c.query(`SELECT q.*, ${INTENTOS.replace(/p\.guia/g, "q.guia")} FROM (${CON_NOMBRE} WHERE p.guia = $1) q`, [guia]);
    const f = r.rows[0];
    return f ? conIntentos({ ...pedidosBase.aDocumento(f), _intentos: f.intentos }) : null;
  },
  /** Sin intentos, salvo que se pidan: para los cálculos no hacen falta. */
  async listar(c, { filtro, intentos = false } = {}) {
    const params = [], cond = [];
    for (const [k, v] of Object.entries(filtro || {})) {
      const d = pedidosBase.campos[k];
      if (v && typeof v === "object" && "in" in v) { params.push(v.in); cond.push(`p.${d.columna} = ANY($${params.length})`); }
      else { params.push(v); cond.push(`p.${d.columna} = $${params.length}`); }
    }
    const r = await c.query(`SELECT p.*, c.nombre AS cliente_nombre${intentos ? ", " + INTENTOS : ""} FROM pedidos p LEFT JOIN clientes c ON c.id = p.cliente_id
      ${cond.length ? "WHERE " + cond.join(" AND ") : ""} ORDER BY p.n`, params);
    return r.rows.map(f => { const d = pedidosBase.aDocumento(f); return intentos ? conIntentos({ ...d, _intentos: f.intentos }) : d; });
  },
  async guardar(c, doc) {
    const d = await pedidosBase.guardar(c, doc);
    if (Array.isArray(doc.intentos)) await ponerIntentos(c, doc.guia, doc.intentos);
    return Pedidos.obtener(c, d.guia);
  },
  async actualizar(c, guia, cambios) {
    const { intentos, ...resto } = cambios;
    const d = await pedidosBase.actualizar(c, guia, resto);
    if (!d) return null;
    if (Array.isArray(intentos)) await ponerIntentos(c, guia, intentos);
    return Pedidos.obtener(c, guia);
  },
  /** Borra el pedido y devuelve todo lo necesario para restaurarlo: intentos y archivos (las rutas del bucket). */
  async borrar(c, guia) {
    const antes = await Pedidos.obtener(c, guia);
    if (!antes) return null;
    const a = await c.query(`SELECT tipo, ruta, (extract(epoch FROM creado) * 1000)::bigint AS creado, por FROM pedido_archivos WHERE guia = $1 ORDER BY id`, [guia]);
    await c.query(`DELETE FROM pedidos WHERE guia = $1`, [guia]);
    return { ...antes, _archivos: a.rows.map(x => ({ ...x, creado: Number(x.creado) })) };
  },
  /** Vuelve a poner los archivos de un pedido restaurado de la papelera. */
  async ponerArchivos(c, guia, archivos) {
    for (const x of archivos || []) {
      await c.query(`INSERT INTO pedido_archivos (guia, tipo, ruta, creado, por) VALUES ($1, $2, $3, $4, $5)`,
        [guia, x.tipo, x.ruta, aFecha(x.creado) ?? new Date(), x.por || null]);
    }
  }
};

export const Clientes = crearModelo({ col: "clientes", pk: "id", actualizado: true, campos: { id: "texto", nombre: "texto", telefono: "texto", tarifa: "num" } });

/** Personal. Quien se desactiva en el sistema nuevo cuenta como borrado en la app: no entra en los cálculos. */
export const Mensajeros = crearModelo({
  col: "mensajeros", pk: "id", actualizado: true, donde: "activo",
  campos: { id: "texto", nombre: "texto", telefono: "texto", tipo: "texto", tarifa: "num" },
  alGuardar: d => { if (!d.tipo) d.tipo = "mensajero"; return d; } // sin tipo, la app lo toma como mensajero (tipoDe)
});

/** Cuentas de la app. En Firestore el rol de admin y el vínculo con Personal eran colecciones aparte (admins, vinculos). */
export const Usuarios = crearModelo({
  col: "usuarios", pk: "uid", actualizado: true,
  campos: { uid: ["texto", "id"], email: "texto", nombre: "texto", rol: "texto", clienteId: "ref", mensajeroId: "ref", creado: "ms!" }
});

export const Movimientos = crearModelo({
  col: "movimientos", pk: "id",
  campos: { id: "texto", clienteId: "ref", tipo: "texto", valor: "num", medio: "ref", nota: "texto", fecha: "ms!", porUid: "ref", porNombre: "texto",
    medioAntes: "ref", medioCambio: "ms", reversoDe: "ref" }
});

export const Recaudos = crearModelo({
  col: "recaudos", pk: "id",
  campos: { id: "texto", mensajeroId: "ref", valor: "num", medio: "texto", nota: "texto", fecha: "ms!", porUid: "ref", porNombre: "texto", medioAntes: "ref", medioCambio: "ms" },
  alGuardar: d => { if (!d.medio) d.medio = "efectivo"; return d; } // la app toma un recaudo sin medio como efectivo
});

export const Liquidaciones = crearModelo({
  col: "liquidaciones", pk: "id",
  campos: {
    id: "texto", mensajeroId: "ref", desde: "ms", fecha: "ms!", dia: "dia", entregas: "int", guias: "arr", efectivo: "num", base: "num", gastos: "num",
    anterior: "num", recibidoAntes: "num", entregaFinal: "num", recibido: "num", debe: "num", adelanto: "num", ajuste: "num",
    transfJs: "num", transfCli: "num", sueldo: "num", enRuta: "int"
  },
  alGuardar: d => { if (!esDiaTxt(d.dia)) d.dia = diaDe(d.fecha ?? ahora()); return d; }
});

export const Cajamovs = crearModelo({
  col: "cajamovs", pk: "id", extra: true,
  campos: {
    id: "texto", tipo: "texto", cat: "texto", valor: "num", medio: "ref", concepto: "texto", fecha: "ms!", personaId: "ref", personaUid: "ref",
    cuentaId: "ref", semana: "ref", adelantoId: "ref", devuelto: "num", deLiquidacion: "ref", inicial: "bool", nivel: "bool", arqueoId: "ref",
    porUid: "ref", porNombre: "texto", medioAntes: "ref", medioCambio: "ms"
  }
});

export const Cuentas = crearModelo({ col: "cuentas", pk: "id", campos: { id: "texto", nombre: "texto", tipo: "texto", creado: "ms!" } });

/** Días de pago fijo y sueldo anterior al empalme. En los "previo", `dia` es el sábado en que empieza la semana. */
export const Jornadas = crearModelo({
  col: "jornadas", pk: "id",
  campos: { id: "texto", personaId: "ref", dia: "dia", semana: "ref", valor: "num", previo: "bool", nota: "texto" },
  leer: d => { const { semana, ...x } = d; if (!x.dia && semana) x.dia = semana; if (!x.previo) delete x.previo; if (!x.nota) delete x.nota; return x; },
  alGuardar: d => { d.semana = d.previo ? d.dia : null; return d; }
});

export const MODELOS = { pedidos: Pedidos, clientes: Clientes, mensajeros: Mensajeros, usuarios: Usuarios, movimientos: Movimientos, recaudos: Recaudos,
  liquidaciones: Liquidaciones, cajamovs: Cajamovs, cuentas: Cuentas, jornadas: Jornadas };

/** Colecciones del estado S de la app (con las que se calculan saldos, caja y sueldos). */
export const COLS_ESTADO = ["pedidos", "clientes", "mensajeros", "movimientos", "recaudos", "liquidaciones", "jornadas", "cajamovs", "vinculos", "usuarios", "cuentas"];

/** ¿Es el cliente de una transacción? (pg no deja dos consultas a la vez en el mismo cliente). */
export const enTransaccion = c => typeof c?.release === "function";

/** Carga colecciones con la forma de S: { pedidos: { "JS-00001": {...} }, ... }. */
export async function cargarEstado(c, cols = COLS_ESTADO) {
  const S = Object.fromEntries(COLS_ESTADO.map(k => [k, {}]));
  const lista = new Set(cols);
  if (lista.has("vinculos")) lista.add("usuarios");
  const leer = async col => { const m = MODELOS[col]; for (const d of await m.listar(c)) S[col][d[m.pk]] = d; };
  const cols2 = [...lista].filter(k => MODELOS[k]);
  // Con el pool se lee en paralelo; dentro de una transacción (un solo cliente) va una consulta tras otra.
  if (enTransaccion(c)) for (const col of cols2) await leer(col); else await Promise.all(cols2.map(leer));
  if (cols.includes("vinculos")) for (const u of Object.values(S.usuarios)) if (u.mensajeroId) S.vinculos[u.uid] = { uid: u.uid, mensajeroId: u.mensajeroId };
  if (!cols.includes("usuarios")) S.usuarios = {};
  return S;
}

/* ---------- configuración, historial y papelera ---------- */

/** Hora del último arqueo (meta/caja.corte en Firestore): lo de antes ya se contó y no se cambia. */
export const Meta = {
  async corte(c) {
    const r = await c.query(`SELECT valor->>'corte' AS corte FROM ajustes WHERE clave = 'caja'`);
    return aFecha(r.rows[0]?.corte)?.getTime() || 0;
  },
  async guardarCorte(c, ms) {
    await c.query(`INSERT INTO ajustes (clave, valor) VALUES ('caja', $1::jsonb)
      ON CONFLICT (clave) DO UPDATE SET valor = EXCLUDED.valor, actualizado = now()`, [JSON.stringify({ corte: ms ? new Date(ms).toISOString() : null })]);
  }
};

/** Historial: una fila por acción, con el texto que escribe la app. */
export const Historial = {
  async agregar(c, { uid, t, a, m, r, tabla = null, registro = null }) {
    await c.query(`INSERT INTO historial (fecha, uid, accion, tabla, registro, datos) VALUES ($1, (SELECT id FROM usuarios WHERE id = $2), $3, $4, $5, $6::jsonb)`,
      [new Date(t), uid || null, a, tabla, registro, JSON.stringify({ rol: r || null, mensajeroId: m || null })]);
  },
  /** Entradas desde una fecha (ms); uid: solo las de esa persona. Lo más nuevo primero. */
  async listar(c, { desde, uid, limite = 2000 }) {
    const params = [new Date(desde)];
    let sql = `SELECT h.id, h.fecha, h.uid, h.accion, h.tabla, h.registro, h.datos->>'rol' AS rol, h.datos->>'mensajeroId' AS mensajero_id,
      COALESCE(NULLIF(u.nombre, ''), u.email, '') AS quien FROM historial h LEFT JOIN usuarios u ON u.id = h.uid WHERE h.fecha >= $1`;
    if (uid) { params.push(uid); sql += ` AND h.uid = $2`; }
    params.push(limite);
    sql += ` ORDER BY h.fecha DESC, h.id DESC LIMIT $${params.length}`;
    return (await c.query(sql, params)).rows;
  },
  /** Una página del historial con el total del filtro, para no traer todo a la vez. */
  async paginar(c, { desde, uid, buscar = "", pagina = 1, porPagina = 20 } = {}) {
    const params = [new Date(desde)], cond = ["h.fecha >= $1"];
    if (uid) { params.push(uid); cond.push(`h.uid = $${params.length}`); }
    if (buscar) { params.push(`%${buscar}%`); cond.push(`h.accion ILIKE $${params.length}`); }
    const where = cond.join(" AND ");
    const total = (await c.query(`SELECT count(*)::int AS total FROM historial h WHERE ${where}`, params)).rows[0]?.total || 0;
    const tam = Math.max(1, Math.min(5000, Number(porPagina) || 20));
    const paginas = Math.max(1, Math.ceil(total / tam));
    const actual = Math.min(Math.max(1, Number(pagina) || 1), paginas);
    const offset = (actual - 1) * tam;
    const filas = (await c.query(
      `SELECT h.id, h.fecha, h.uid, h.accion, h.tabla, h.registro, h.datos->>'rol' AS rol, h.datos->>'mensajeroId' AS mensajero_id,
        COALESCE(NULLIF(u.nombre, ''), u.email, '') AS quien
       FROM historial h LEFT JOIN usuarios u ON u.id = h.uid WHERE ${where}
       ORDER BY h.fecha DESC, h.id DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, tam, offset]
    )).rows;
    return { filas, total, pagina: actual, porPagina: tam, paginas };
  }
};

/** Papelera: copia de lo borrado (con la forma de documento de la app) para poder restaurarlo. */
export const Papelera = {
  aDocumento: f => (f ? { id: String(f.id), col: f.tabla, docId: f.registro, data: f.datos, grupo: f.grupo || "", fecha: f.fecha?.getTime?.() ?? null, uid: f.uid || "" } : null),
  async guardar(c, { col, docId, data, uid, grupo }) {
    const r = await c.query(`INSERT INTO papelera (tabla, registro, datos, grupo, uid) VALUES ($1, $2, $3::jsonb, $4, (SELECT id FROM usuarios WHERE id = $5)) RETURNING *`,
      [col, docId, JSON.stringify(data), grupo || null, uid || null]);
    return Papelera.aDocumento(r.rows[0]);
  },
  async obtener(c, id) {
    if (!/^\d+$/.test(String(id))) return null;
    return Papelera.aDocumento((await c.query(`SELECT * FROM papelera WHERE id = $1`, [id])).rows[0]);
  },
  async listar(c, { limite = 300, grupo } = {}) {
    const r = grupo
      ? await c.query(`SELECT * FROM papelera WHERE grupo = $1 ORDER BY id`, [grupo])
      : await c.query(`SELECT * FROM papelera ORDER BY fecha DESC, id DESC LIMIT $1`, [limite]);
    return r.rows.map(Papelera.aDocumento);
  },
  async borrar(c, id) {
    if (!/^\d+$/.test(String(id))) return null;
    return Papelera.aDocumento((await c.query(`DELETE FROM papelera WHERE id = $1 RETURNING *`, [id])).rows[0]);
  }
};
