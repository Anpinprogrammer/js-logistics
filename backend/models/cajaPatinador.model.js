/* Caja del patinador: cada pago que recibe de un cliente en su ruta (tabla caja_patinador). */
import { query } from "../config/db.js";
import { filaAObjeto, paginaEnParalelo } from "../helpers/sql.js";
import { nuevoId } from "../helpers/ids.js";

const CON_CLIENTE = `
  SELECT r.id, r.mensajero_id, r.cliente_id, c.nombre AS cliente_nombre, r.concepto, r.valor, r.fecha, 'pago' AS tipo
  FROM caja_patinador r JOIN clientes c ON c.id = r.cliente_id`;

// "Hoy" es el día de Colombia, no el del servidor (que corre en UTC).
const ES_HOY = `(r.fecha AT TIME ZONE 'America/Bogota')::date = (now() AT TIME ZONE 'America/Bogota')::date`;

/** La fecha la pone la base (now()): el patinador no puede anotar un pago con otra hora. */
export async function crear({ mensajeroId, clienteId, concepto, valor, porUid, movimientoId = null }, db = { query }) {
  const id = nuevoId();
  await db.query(
    `INSERT INTO caja_patinador (id, mensajero_id, cliente_id, concepto, valor, por_uid, movimiento_id) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [id, mensajeroId, clienteId, concepto, valor, porUid, movimientoId]
  );
  const { rows } = await db.query(`${CON_CLIENTE} WHERE r.id = $1`, [id]);
  return filaAObjeto(rows[0]);
}

/** Lo recibido (total, hoy), lo que ya entregó a la oficina (recaudos) y lo que le queda en la caja (`enCaja`, puede ser negativo
    si la oficina registró de más). Cuando la oficina recibe su dinero (POST /recaudos), `enCaja` baja solo: no hay otro dato que sincronizar. */
export async function resumen(mensajeroId, db = { query }) {
  const { rows } = await db.query(
    `SELECT coalesce(sum(r.valor), 0)::bigint AS total, count(*)::int AS registros,
            coalesce(sum(r.valor) FILTER (WHERE ${ES_HOY}), 0)::bigint AS total_hoy,
            (count(*) FILTER (WHERE ${ES_HOY}))::int AS registros_hoy,
            coalesce((SELECT sum(e.valor) FROM recaudos e WHERE e.mensajero_id = $1), 0)::bigint AS entregado,
            coalesce((SELECT sum(e.valor) FROM recaudos e WHERE e.mensajero_id = $1 AND (e.fecha AT TIME ZONE 'America/Bogota')::date = (now() AT TIME ZONE 'America/Bogota')::date), 0)::bigint AS entregado_hoy
     FROM caja_patinador r WHERE r.mensajero_id = $1`,
    [mensajeroId]
  );
  const o = filaAObjeto(rows[0]);
  o.enCaja = o.total - o.entregado;
  return o;
}

/** Movimientos de la caja de un patinador, los más nuevos primero, por páginas (paginador de pantalla). Mezcla los pagos que
    recibió (`tipo: "pago"`) con las entregas de dinero que administración le recibió (`tipo: "entrega"`, de `recaudos`),
    para que vea en su historial cuándo se le descontó plata de la caja. En las entregas `clienteNombre` es quién las recibió. */
const MOVIMIENTOS = `
  SELECT r.id, r.mensajero_id, r.cliente_id, c.nombre AS cliente_nombre, r.concepto, r.valor, r.fecha, 'pago' AS tipo, NULL::text AS medio
  FROM caja_patinador r JOIN clientes c ON c.id = r.cliente_id WHERE r.mensajero_id = $1
  UNION ALL
  SELECT e.id, e.mensajero_id, NULL, CASE WHEN e.por_nombre <> '' THEN 'Entregado a ' || e.por_nombre ELSE 'Entregado a la oficina' END,
         e.nota, e.valor, e.fecha, 'entrega', e.medio
  FROM recaudos e WHERE e.mensajero_id = $1`;

export async function listarPagina({ mensajeroId, pagina = 1, porPagina = 8 }) {
  const r = await paginaEnParalelo({
    pagina, porPagina,
    contar: async () => (await query(`SELECT count(*)::int AS total FROM (${MOVIMIENTOS}) m`, [mensajeroId])).rows[0].total,
    traer: async offset => (await query(
      `SELECT * FROM (${MOVIMIENTOS}) m ORDER BY m.fecha DESC, m.id LIMIT $2 OFFSET $3`,
      [mensajeroId, porPagina, offset]
    )).rows
  });
  return { registros: r.filas.map(filaAObjeto), pagina: r.pagina, porPagina, total: r.total, paginas: r.paginas };
}

/* ---- lo que ve la oficina: cuánto recibió cada patinador de los clientes y cuánto ya le entregó al admin ----
   Lo entregado son los mismos `recaudos` de los mensajeros (así entra a la caja de la empresa); lo que debe
   es lo recibido menos lo entregado, sin períodos: los patinadores no se liquidan. */
const FILAS_RESUMEN = `
  SELECT m.id AS mensajero_id, m.nombre, m.activo,
    coalesce((SELECT sum(valor) FROM caja_patinador r WHERE r.mensajero_id = m.id), 0)::bigint AS recibido,
    coalesce((SELECT sum(valor) FROM caja_patinador r WHERE r.mensajero_id = m.id AND ${ES_HOY}), 0)::bigint AS recibido_hoy,
    (SELECT count(*) FROM caja_patinador r WHERE r.mensajero_id = m.id)::int AS registros,
    coalesce((SELECT sum(valor) FROM recaudos r WHERE r.mensajero_id = m.id), 0)::bigint AS entregado,
    coalesce((SELECT sum(valor) FROM recaudos r WHERE r.mensajero_id = m.id AND ${ES_HOY}), 0)::bigint AS entregado_hoy
  FROM mensajeros m WHERE m.tipo = 'patinador'`;

const conDebe = f => { const o = filaAObjeto(f); o.debe = o.recibido - o.entregado; return o; };

/** Todos los patinadores activos (aunque no hayan anotado nada) y los inactivos que aún deben o tienen de más. */
export async function resumenPatinadores(db = { query }) {
  const { rows } = await db.query(`SELECT * FROM (${FILAS_RESUMEN}) x WHERE activo OR recibido <> entregado ORDER BY lower(nombre)`);
  return rows.map(conDebe);
}

/** Lo mismo para uno (null si esa ficha no es de un patinador). */
export async function resumenDe(mensajeroId, db = { query }) {
  const { rows } = await db.query(`${FILAS_RESUMEN} AND m.id = $1`, [mensajeroId]);
  return rows[0] ? conDebe(rows[0]) : null;
}

/* ---- solicitudes de recogida del patinador: las guías de solicitudes que la oficina le asignó y todavía no recoge ---- */
const RECOGIDAS = `
  FROM pedidos p JOIN solicitudes s ON s.guia = p.guia
  LEFT JOIN clientes c ON c.id = p.cliente_id
  WHERE p.mensajero_id = $1 AND p.estado = 'aceptado'`;

/** Las que tiene por recoger, de la más antigua a la más nueva (la que lleva más tiempo esperando va primero), por páginas. */
export async function recogidasPendientes({ mensajeroId, pagina = 1, porPagina = 10 }) {
  const r = await paginaEnParalelo({
    pagina, porPagina,
    contar: async () => (await query(`SELECT count(*)::int AS total ${RECOGIDAS}`, [mensajeroId])).rows[0].total,
    traer: async offset => (await query(
      `SELECT p.guia, p.creado AS fecha, coalesce(c.nombre, s.nombre) AS remitente, s.direccion_recogida, s.paquetes,
              s.destinatario_nombre, s.direccion_entrega
       ${RECOGIDAS} ORDER BY p.creado, p.guia LIMIT $2 OFFSET $3`,
      [mensajeroId, porPagina, offset]
    )).rows
  });
  return { registros: r.filas.map(filaAObjeto), pagina: r.pagina, total: r.total, paginas: r.paginas };
}
