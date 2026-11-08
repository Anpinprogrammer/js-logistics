/* Importa a Postgres (y a Supabase Storage) la carpeta que genera migracion/exportar-firestore.js.

   Se puede correr las veces que haga falta para SINCRONIZAR mientras la app vieja sigue en producción:
   cada registro se inserta o se actualiza por su ID de Firestore, y las fotos ya subidas no se repiten.
   Con --reemplazar, además, borra primero lo que haya en la base (menos las contraseñas de las cuentas),
   para que lo borrado en Firebase también desaparezca aquí.

   Uso (desde backend/):
     npm run db:importar -- --carpeta ../exportacion-2026-11-08-1030 --simular     # ver qué pasaría, sin guardar
     npm run db:importar -- --carpeta ../exportacion-2026-11-08-1030               # importar
     npm run db:importar -- --carpeta ... --reemplazar --si                        # recargar todo desde cero
     npm run db:importar -- --carpeta ... --sin-fotos                              # solo datos

   Al terminar deja `informe-importacion.json` en la carpeta, con lo que se importó y lo que se omitió y por qué. */
import { parseArgs } from "node:util";
import { createReadStream } from "node:fs";
import { readFile, writeFile, access } from "node:fs/promises";
import { createInterface } from "node:readline";
import { createHash } from "node:crypto";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { pool } from "../config/db.js";
import { MEDIOS, ROLES, TIPOS_PERSONAL, MOTIVOS } from "../helpers/negocio.js";
import { tipoDeImagen } from "../helpers/imagenes.js";
import { subirArchivo, storageConfigurado } from "../helpers/storage.js";

const ESTADOS = ["pendiente", "entregado", "devuelto"];
const METODOS = ["", "efectivo", "transf_js", "transf_cliente", "devuelto"];
const TIPOS_MOV = ["cargo", "abono", "pago_de_cliente", "pago_a_cliente", "compra_cliente", "ganancia"];
const CATS = ["inicial", "otro_entra", "gasto", "arriendo", "otro", "base", "adelanto", "devolucion", "sueldo", "interna", "oficina", "sobrante", "arqueo"];
// Colecciones de Firestore cuya copia en la papelera se conserva, con su tabla en Postgres.
const TABLA_DE = { pedidos: "pedidos", clientes: "clientes", movimientos: "movimientos", recaudos: "recaudos", liquidaciones: "liquidaciones", cajamovs: "cajamovs", mensajeros: "mensajeros" };

// ---------- Conversión de valores (la app vieja no validaba tipos: aquí se limpian) ----------

/** Pesos enteros. Lo que no es número queda en 0. */
export const pesos = v => { const n = Math.round(Number(v)); return Number.isFinite(n) ? n : 0; };
/** Milisegundos (o texto de fecha) → Date; 0, vacío o inválido → null. */
export const fecha = v => {
  if (v === null || v === undefined || v === "" || v === 0) return null;
  const d = new Date(typeof v === "number" || /^\d+$/.test(String(v)) ? Number(v) : v);
  return Number.isNaN(d.getTime()) ? null : d;
};
const texto = v => (v === null || v === undefined ? "" : String(v)).trim();
const uno = (v, lista, porDefecto = null) => (lista.includes(v) ? v : porDefecto);
/** Día de negocio (AAAA-MM-DD) en hora de Colombia. */
export const diaColombia = d => new Date(d.getTime() - 5 * 3_600_000).toISOString().slice(0, 10);

/** Lee un .jsonl de la exportación línea por línea. Si la colección no está, no devuelve nada. */
async function* leer(carpeta, nombre) {
  const ruta = join(carpeta, `${nombre}.jsonl`);
  try { await access(ruta); } catch { return; }
  const lineas = createInterface({ input: createReadStream(ruta, { encoding: "utf8" }), crlfDelay: Infinity });
  for await (const l of lineas) if (l.trim()) yield JSON.parse(l);
}
const leerTodo = async (carpeta, nombre) => { const out = []; for await (const d of leer(carpeta, nombre)) out.push(d); return out; };

// ---------- Informe ----------

function crearInforme() {
  const colecciones = {};
  const de = c => (colecciones[c] ??= { importados: 0, omitidos: 0, avisos: {} });
  return {
    colecciones,
    ok: c => { de(c).importados++; },
    omitir: (c, motivo, id) => { const x = de(c); x.omitidos++; (x.avisos[motivo] ??= []).push(id); },
    avisar: (c, motivo, id) => { (de(c).avisos[motivo] ??= []).push(id); }
  };
}

// ---------- Escritura por lotes ----------
// Con Supabase cada consulta viaja por internet (~100 ms). Una por registro tardaría horas con miles de guías:
// por eso se escribe de a cientos de filas por consulta.

/** INSERT … ON CONFLICT DO UPDATE de muchas filas a la vez. `filas` son arreglos en el orden de `cols`. */
async function upsert(q, tabla, cols, filas, { clave = "id", conservar = [], extra = [] } = {}) {
  const set = [...cols.filter(c => c !== clave && !conservar.includes(c)).map(c => `${c} = EXCLUDED.${c}`), ...extra].join(", ");
  const lote = Math.max(1, Math.min(500, Math.floor(30_000 / cols.length)));
  for (let i = 0; i < filas.length; i += lote) {
    const v = [];
    const ph = filas.slice(i, i + lote).map(f => "(" + f.map(x => { v.push(x); return "$" + v.length; }).join(",") + ")");
    await q(`INSERT INTO ${tabla} (${cols.join(", ")}) VALUES ${ph.join(", ")} ON CONFLICT (${clave}) DO UPDATE SET ${set}`, v);
  }
}

/** INSERT simple de muchas filas (tablas sin clave propia: intentos, historial, papelera). */
async function insertar(q, tabla, cols, filas) {
  const lote = Math.max(1, Math.min(500, Math.floor(30_000 / cols.length)));
  for (let i = 0; i < filas.length; i += lote) {
    const v = [];
    const ph = filas.slice(i, i + lote).map(f => "(" + f.map(x => { v.push(x); return "$" + v.length; }).join(",") + ")");
    await q(`INSERT INTO ${tabla} (${cols.join(", ")}) VALUES ${ph.join(", ")}`, v);
  }
}

// ---------- Importación ----------

export async function importar({ carpeta, simular = false, conFotos = true, reemplazar = false, log = console.log }) {
  carpeta = resolve(carpeta);
  const manifiesto = JSON.parse(await readFile(join(carpeta, "manifiesto.json"), "utf8"));
  const inf = crearInforme();
  const t0 = Date.now(), seg = () => `${Math.round((Date.now() - t0) / 1000)} s`;
  log(`Exportación de ${manifiesto.proyecto} del ${new Date(manifiesto.fecha).toLocaleString("es-CO", { timeZone: "America/Bogota" })}`);
  if (manifiesto.parcial) log("Ojo: la exportación es PARCIAL (--solo). Solo se actualizan las colecciones que trae.");

  log("Leyendo los archivos…");
  const L = {};
  for (const c of ["mensajeros", "clientes", "cuentas", "usuarios", "admins", "vinculos", "meta", "pedidos", "movimientos",
    "recaudos", "liquidaciones", "cajamovs", "jornadas", "historial", "papelera", "auth"]) L[c] = await leerTodo(carpeta, c);
  const porId = lista => new Map(lista.map(d => [d.id, d.datos]));
  const auth = porId(L.auth), admins = new Set(L.admins.map(d => d.id)), vinculos = porId(L.vinculos), meta = porId(L.meta);

  log("Conectando con la base de datos…");
  const db = await pool.connect();
  const q = (sql, v) => db.query(sql, v);
  const listo = (c, n) => log(`  ${c.padEnd(14)} ${String(n).padStart(6)}  (${seg()})`);
  try {
    await q("BEGIN");
    // Supabase corta las consultas largas (statement_timeout). Una importación grande puede pasar ese límite;
    // SET LOCAL lo quita solo para esta transacción.
    await q("SET LOCAL statement_timeout = 0");
    await q("SET LOCAL idle_in_transaction_session_timeout = 0");

    if (reemplazar) {
      // DELETE en orden (no TRUNCATE ... CASCADE, que se llevaría también las cuentas y sus contraseñas).
      await q(`UPDATE usuarios SET cliente_id = NULL, mensajero_id = NULL WHERE rol <> 'cliente'`);
      for (const t of ["pedido_archivos", "pedido_intentos", "historial", "papelera", "jornadas", "cajamovs", "liquidaciones",
        "recaudos", "movimientos", "pedidos", "cuentas"]) await q(`DELETE FROM ${t}`);
      await q(`DELETE FROM usuarios WHERE rol = 'cliente'`); // dependen de un cliente; se vuelven a crear abajo
      await q(`DELETE FROM clientes`);
      await q(`DELETE FROM mensajeros`);
      await q(`UPDATE contadores SET n = 0 WHERE nombre = 'guia'`);
      log("Base vaciada (las cuentas de oficina y mensajeros se conservan con su contraseña).");
    }
    log("Guardando:");

    // Personal
    const filasM = [];
    for (const { id, datos: d } of L.mensajeros) {
      if (!texto(d.nombre)) { inf.omitir("mensajeros", "sin nombre", id); continue; }
      filasM.push([id, texto(d.nombre), texto(d.telefono), uno(d.tipo, TIPOS_PERSONAL, "mensajero"), Math.max(0, pesos(d.tarifa)), true]);
      inf.ok("mensajeros");
    }
    await upsert(q, "mensajeros", ["id", "nombre", "telefono", "tipo", "tarifa", "activo"], filasM, { extra: ["actualizado = now()"] });
    listo("mensajeros", filasM.length);

    // Clientes
    const filasC = [];
    for (const { id, datos: d } of L.clientes) {
      if (!texto(d.nombre)) { inf.omitir("clientes", "sin nombre", id); continue; }
      filasC.push([id, texto(d.nombre), texto(d.telefono), Math.max(0, pesos(d.tarifa))]);
      inf.ok("clientes");
    }
    await upsert(q, "clientes", ["id", "nombre", "telefono", "tarifa"], filasC, { extra: ["actualizado = now()"] });
    listo("clientes", filasC.length);

    // Cuentas internas
    const filasK = L.cuentas.map(({ id, datos: d }) => { inf.ok("cuentas"); return [id, texto(d.nombre) || id, uno(d.tipo, ["socio", "base"], "socio"), fecha(d.creado) ?? new Date()]; });
    await upsert(q, "cuentas", ["id", "nombre", "tipo", "creado"], filasK, { conservar: ["creado"] });

    const existe = async tabla => new Set((await q(`SELECT id FROM ${tabla}`)).rows.map(r => r.id));
    const mensajeros = await existe("mensajeros"), clientes = await existe("clientes"), cuentas = await existe("cuentas");

    // Cuentas de la app: usuarios + admins + vinculos + Firebase Auth. Las contraseñas de Firebase no se pueden pasar:
    // las cuentas nuevas quedan sin contraseña (no pueden entrar) hasta que administración les asigne una.
    const correos = new Map((await q(`SELECT id, lower(email) AS email FROM usuarios`)).rows.map(r => [r.email, r.id]));
    const filasU = [], vistos = new Set();
    for (const { id, datos: d } of L.usuarios) {
      const email = texto(d.email || auth.get(id)?.email).toLowerCase();
      if (!email) { inf.omitir("usuarios", "sin correo", id); continue; }
      const rol = admins.has(id) ? "admin" : uno(d.rol, ROLES);
      if (!rol) { inf.omitir("usuarios", "rol desconocido", id); continue; }
      const clienteId = d.clienteId && clientes.has(d.clienteId) ? d.clienteId : null;
      if (rol === "cliente" && !clienteId) { inf.omitir("usuarios", "cuenta de cliente sin cliente que exista", id); continue; }
      const vin = vinculos.get(id)?.mensajeroId;
      const mensajeroId = vin && mensajeros.has(vin) ? vin : null;
      if (vin && !mensajeroId) inf.avisar("usuarios", "vínculo con una persona que ya no está en Personal", id);
      const otra = correos.get(email);
      if ((otra && otra !== id) || vistos.has(email)) { inf.omitir("usuarios", `el correo ya lo usa otra cuenta (${otra || "repetido en Firebase"})`, id); continue; }
      vistos.add(email);
      filasU.push([id, email, texto(d.nombre || auth.get(id)?.nombre), rol, clienteId, mensajeroId, !auth.get(id)?.desactivada, fecha(d.creado) ?? new Date()]);
      inf.ok("usuarios");
    }
    await upsert(q, "usuarios", ["id", "email", "nombre", "rol", "cliente_id", "mensajero_id", "activo", "creado"], filasU,
      { conservar: ["creado"], extra: ["actualizado = now()"] }); // nunca toca clave_hash ni version_sesion
    listo("usuarios", filasU.length);
    const usuarios = await existe("usuarios");
    const uidO = v => (v && usuarios.has(v) ? v : null);

    // Ajustes: hora del último arqueo (lo contado antes no se modifica)
    const corte = fecha(meta.get("caja")?.corte);
    if (corte) {
      await q(`INSERT INTO ajustes (clave, valor) VALUES ('caja', $1)
        ON CONFLICT (clave) DO UPDATE SET valor = EXCLUDED.valor, actualizado = now()`, [{ corte: corte.toISOString() }]);
    }

    // Pedidos e intentos
    const guias = [], filasP = [], filasI = [];
    for (const { id, datos: d } of L.pedidos) {
      const n = pesos(d.n) || pesos(String(id).replace(/\D/g, ""));
      if (!/^JS-\d{5,}$/.test(id) || !n) { inf.omitir("pedidos", "número de guía inválido", id); continue; }
      const estado = uno(d.estado, ESTADOS, "pendiente");
      let entregado = fecha(d.entregado);
      if (estado !== "pendiente" && !entregado) { entregado = fecha(d.creado) ?? new Date(0); inf.avisar("pedidos", "cerrada sin hora de entrega: se usó la de salida", id); }
      if (d.mensajeroId && !mensajeros.has(d.mensajeroId)) inf.avisar("pedidos", "mensajero que ya no existe: queda sin mensajero", id);
      if (d.clienteId && !clientes.has(d.clienteId)) inf.avisar("pedidos", "remitente que ya no existe: queda sin remitente", id);
      const negativos = ["valorServicio", "aCobrar", "valorCobrado", "gasto"].filter(k => pesos(d[k]) < 0);
      if (negativos.length) inf.avisar("pedidos", `valores negativos puestos en 0 (${negativos.join(", ")})`, id);
      filasP.push([
        id, n, estado, fecha(d.creado) ?? new Date(), uidO(d.por), mensajeros.has(d.mensajeroId) ? d.mensajeroId : null,
        clientes.has(d.clienteId) ? d.clienteId : null, Math.max(0, pesos(d.valorServicio)), Math.max(0, pesos(d.aCobrar)),
        estado === "pendiente" ? null : entregado, texto(d.destinatario), Math.max(0, pesos(d.valorCobrado)), uno(d.metodo, METODOS, ""),
        uno(d.cuentaJs, ["nequi", "bancolombia"], ""), pesos(d.difCobro), !!d.difRevisada, uidO(d.entregoUid),
        uno(d.motivoDev, MOTIVOS, ""), texto(d.notaDev), !!d.cobrarDev, !!d.cambio, fecha(d.cambioRecibido), uidO(d.cambioConfirmo),
        Math.max(0, pesos(d.gasto)), texto(d.gastoNota), !!d.domiPagado, uno(d.domiPagoMedio, MEDIOS),
        d.domiPagoValor == null || d.domiPagoValor === "" ? null : Math.max(0, pesos(d.domiPagoValor)), fecha(d.domiPagoFecha),
        uidO(d.domiPagoUid), !!d.fotosBorradas
      ]);
      guias.push(id);
      for (const it of Array.isArray(d.intentos) ? d.intentos : []) {
        const motivo = uno(it?.motivo, MOTIVOS);
        if (!motivo) { inf.avisar("pedidos", "intento con motivo desconocido (omitido)", id); continue; }
        filasI.push([id, fecha(it.fecha) ?? new Date(), motivo, texto(it.nota)]);
      }
      inf.ok("pedidos");
    }
    await upsert(q, "pedidos", ["guia", "n", "estado", "creado", "creado_por", "mensajero_id", "cliente_id", "valor_servicio", "a_cobrar",
      "entregado", "destinatario", "valor_cobrado", "metodo", "cuenta_js", "dif_cobro", "dif_revisada", "entrego_uid", "motivo_dev", "nota_dev",
      "cobrar_dev", "cambio", "cambio_recibido", "cambio_confirmo", "gasto", "gasto_nota", "domi_pagado", "domi_pago_medio", "domi_pago_valor",
      "domi_pago_fecha", "domi_pago_uid", "fotos_borradas"], filasP, { clave: "guia", extra: ["actualizado = now()"] });
    // Los intentos se reemplazan completos: en Firestore eran un arreglo dentro del pedido.
    await q(`DELETE FROM pedido_intentos WHERE guia = ANY($1)`, [guias]);
    await insertar(q, "pedido_intentos", ["guia", "fecha", "motivo", "nota"], filasI);
    // El consecutivo nunca baja: las guías nuevas siguen después de la última que exista.
    const ultima = Math.max(pesos(meta.get("contador")?.n), ...L.pedidos.map(p => pesos(p.datos.n)), 0);
    await q(`UPDATE contadores SET n = GREATEST(n, $1, (SELECT COALESCE(max(n), 0) FROM pedidos)) WHERE nombre = 'guia'`, [ultima]);
    listo("pedidos", filasP.length);

    // Movimientos de clientes (el reverso apunta a otro movimiento: se enlaza al final)
    const filasMv = [], reversos = [];
    for (const { id, datos: d } of L.movimientos) {
      if (!clientes.has(d.clienteId)) { inf.omitir("movimientos", "cliente que no existe", id); continue; }
      const tipo = uno(d.tipo, TIPOS_MOV);
      if (!tipo) { inf.omitir("movimientos", "tipo desconocido", id); continue; }
      if (pesos(d.valor) <= 0) { inf.omitir("movimientos", "valor en cero o negativo", id); continue; }
      filasMv.push([id, d.clienteId, tipo, pesos(d.valor), uno(d.medio, MEDIOS), texto(d.nota), fecha(d.fecha) ?? new Date(), uidO(d.porUid),
        texto(d.porNombre), uno(d.medioAntes, MEDIOS), fecha(d.medioCambio)]);
      if (d.reversoDe) reversos.push([id, String(d.reversoDe)]);
      inf.ok("movimientos");
    }
    await upsert(q, "movimientos", ["id", "cliente_id", "tipo", "valor", "medio", "nota", "fecha", "por_uid", "por_nombre", "medio_antes", "medio_cambio"], filasMv);
    if (reversos.length) {
      await q(`UPDATE movimientos m SET reverso_de = r.de FROM unnest($1::text[], $2::text[]) AS r(id, de)
        WHERE m.id = r.id AND EXISTS (SELECT 1 FROM movimientos x WHERE x.id = r.de)`, [reversos.map(r => r[0]), reversos.map(r => r[1])]);
    }
    listo("movimientos", filasMv.length);

    // Dinero que entregan los mensajeros
    const filasR = [];
    for (const { id, datos: d } of L.recaudos) {
      if (!mensajeros.has(d.mensajeroId)) { inf.omitir("recaudos", "mensajero que no existe", id); continue; }
      if (pesos(d.valor) <= 0) { inf.omitir("recaudos", "valor en cero o negativo", id); continue; }
      const medio = uno(d.medio, MEDIOS, "efectivo");
      if (medio !== d.medio) inf.avisar("recaudos", "sin medio de pago: quedó como efectivo", id);
      filasR.push([id, d.mensajeroId, pesos(d.valor), medio, texto(d.nota), fecha(d.fecha) ?? new Date(), uidO(d.porUid), texto(d.porNombre),
        uno(d.medioAntes, MEDIOS), fecha(d.medioCambio)]);
      inf.ok("recaudos");
    }
    await upsert(q, "recaudos", ["id", "mensajero_id", "valor", "medio", "nota", "fecha", "por_uid", "por_nombre", "medio_antes", "medio_cambio"], filasR);
    listo("recaudos", filasR.length);

    // Liquidaciones
    const filasL = [];
    for (const { id, datos: d } of L.liquidaciones) {
      if (!mensajeros.has(d.mensajeroId)) { inf.omitir("liquidaciones", "mensajero que no existe", id); continue; }
      const f = fecha(d.fecha);
      if (!f) { inf.omitir("liquidaciones", "sin fecha", id); continue; }
      const dia = /^\d{4}-\d{2}-\d{2}$/.test(d.dia) ? d.dia : diaColombia(f);
      const n = k => pesos(d[k]);
      filasL.push([id, d.mensajeroId, fecha(d.desde), f, dia, n("entregas"), (Array.isArray(d.guias) ? d.guias : []).map(String), n("efectivo"),
        n("base"), n("gastos"), n("anterior"), n("recibidoAntes"), n("entregaFinal"), n("recibido"), n("debe"), n("adelanto"),
        n("transfJs"), n("transfCli"), n("sueldo"), n("enRuta"), n("ajuste"), uidO(d.porUid)]);
      inf.ok("liquidaciones");
    }
    await upsert(q, "liquidaciones", ["id", "mensajero_id", "desde", "fecha", "dia", "entregas", "guias", "efectivo", "base", "gastos", "anterior",
      "recibido_antes", "entrega_final", "recibido", "debe", "adelanto", "transf_js", "transf_cli", "sueldo", "en_ruta", "ajuste", "por_uid"], filasL);
    listo("liquidaciones", filasL.length);

    // Caja. Lo que no tiene columna propia va en `extra` para no perder nada.
    const CONOCIDOS = new Set(["id", "tipo", "cat", "valor", "medio", "concepto", "fecha", "personaId", "personaUid", "cuentaId", "semana",
      "adelantoId", "devuelto", "deLiquidacion", "inicial", "nivel", "arqueoId", "porUid", "porNombre", "medioAntes", "medioCambio"]);
    const filasCj = [], adelantos = [];
    for (const { id, datos: d } of L.cajamovs) {
      const cat = uno(d.cat, CATS);
      if (!cat) { inf.omitir("cajamovs", `categoría desconocida (${d.cat})`, id); continue; }
      if (d.personaId && !mensajeros.has(d.personaId)) inf.avisar("cajamovs", "persona que ya no está en Personal: queda sin persona", id);
      if (d.cuentaId && !cuentas.has(d.cuentaId)) inf.avisar("cajamovs", "cuenta interna que no existe: queda sin cuenta", id);
      const extra = Object.fromEntries(Object.entries(d).filter(([k]) => !CONOCIDOS.has(k)));
      if (typeof d.deLiquidacion === "string" && d.deLiquidacion) extra.liquidacionId = d.deLiquidacion; // en la app es el ID, no un sí/no
      filasCj.push([id, texto(d.tipo) || "entra", cat, Math.abs(pesos(d.valor)), uno(d.medio, MEDIOS), texto(d.concepto), fecha(d.fecha) ?? new Date(),
        mensajeros.has(d.personaId) ? d.personaId : null, uidO(d.personaUid), cuentas.has(d.cuentaId) ? d.cuentaId : null,
        texto(d.semana) || null, Math.max(0, pesos(d.devuelto)), !!d.deLiquidacion, !!d.inicial, !!d.nivel, texto(d.arqueoId) || null,
        JSON.stringify(extra), uidO(d.porUid), texto(d.porNombre), uno(d.medioAntes, MEDIOS), fecha(d.medioCambio)]);
      if (d.adelantoId) adelantos.push([id, String(d.adelantoId)]);
      inf.ok("cajamovs");
    }
    await upsert(q, "cajamovs", ["id", "tipo", "cat", "valor", "medio", "concepto", "fecha", "persona_id", "persona_uid", "cuenta_id", "semana", "devuelto",
      "de_liquidacion", "inicial", "nivel", "arqueo_id", "extra", "por_uid", "por_nombre", "medio_antes", "medio_cambio"], filasCj);
    if (adelantos.length) {
      await q(`UPDATE cajamovs c SET adelanto_id = r.de FROM unnest($1::text[], $2::text[]) AS r(id, de)
        WHERE c.id = r.id AND EXISTS (SELECT 1 FROM cajamovs x WHERE x.id = r.de)`, [adelantos.map(r => r[0]), adelantos.map(r => r[1])]);
    }
    listo("cajamovs", filasCj.length);

    // Días de sueldo. Los "previo" (sueldo de antes del empalme) guardan la semana en `dia`.
    const filasJ = [];
    for (const { id, datos: d } of L.jornadas) {
      if (!mensajeros.has(d.personaId)) { inf.omitir("jornadas", "persona que no existe", id); continue; }
      const previo = !!d.previo;
      const dia = !previo && /^\d{4}-\d{2}-\d{2}$/.test(d.dia) ? d.dia : null;
      if (!previo && !dia) { inf.omitir("jornadas", "día inválido", id); continue; }
      filasJ.push([id, d.personaId, dia, previo ? texto(d.dia || d.semana) : null, Math.max(0, pesos(d.valor)), previo]);
      inf.ok("jornadas");
    }
    await upsert(q, "jornadas", ["id", "persona_id", "dia", "semana", "valor", "previo"], filasJ);
    listo("jornadas", filasJ.length);

    // Historial: en Firestore era un documento por día y persona con las entradas adentro. Se recarga completo.
    if (L.historial.length) {
      const filasH = [];
      for (const { id, datos: d } of L.historial) {
        for (const e of Array.isArray(d.e) ? d.e : []) {
          if (!texto(e?.a)) continue;
          filasH.push([fecha(e.t) ?? new Date(), uidO(e.u || d.uid), texto(e.a),
            JSON.stringify({ origen: "firestore", doc: id, rol: e.r || null, mensajeroId: e.m || null })]);
        }
        inf.ok("historial");
      }
      await q(`DELETE FROM historial WHERE datos->>'origen' = 'firestore'`);
      await insertar(q, "historial", ["fecha", "uid", "accion", "datos"], filasH);
      listo("historial", filasH.length);
    }

    // Papelera (copias de lo borrado). Se marca con grupo "firestore:…" para poder recargarla.
    if (L.papelera.length) {
      const filasPa = [];
      for (const { id, datos: d } of L.papelera) {
        const tabla = TABLA_DE[d.col];
        if (!tabla || !d.data) { inf.omitir("papelera", "colección sin tabla en el sistema nuevo", id); continue; }
        filasPa.push([tabla, texto(d.docId), JSON.stringify(d.data), `firestore:${d.grupo || id}`, fecha(d.fecha) ?? new Date(), uidO(d.uid)]);
        inf.ok("papelera");
      }
      await q(`DELETE FROM papelera WHERE grupo LIKE 'firestore:%'`);
      await insertar(q, "papelera", ["tabla", "registro", "datos", "grupo", "fecha", "uid"], filasPa);
      listo("papelera", filasPa.length);
    }

    await q(simular ? "ROLLBACK" : "COMMIT");
    log(simular ? `Simulación terminada en ${seg()} (no se guardó nada).` : `Datos guardados en ${seg()}.`);
    if (!simular && conFotos) await importarFotos({ carpeta, guias: new Set(guias), inf, log });
    else if (conFotos) log("Simulación: las fotos no se suben.");
  } catch (e) {
    await q("ROLLBACK").catch(() => {});
    throw e;
  } finally {
    db.release();
  }

  const informe = { fecha: new Date().toISOString(), simulacion: simular, reemplazar, exportacion: manifiesto, colecciones: inf.colecciones };
  if (!simular) await writeFile(join(carpeta, "informe-importacion.json"), JSON.stringify(informe, null, 2));
  return informe;
}

// ---------- Fotos: de dataURL dentro de Firestore a archivos en Supabase Storage ----------

/** "data:image/jpeg;base64,…" → Buffer (solo si de verdad es una imagen). */
export function deDataUrl(v) {
  const m = /^data:image\/[a-z+.-]+;base64,(.+)$/i.exec(String(v || ""));
  if (!m) return null;
  const b = Buffer.from(m[1], "base64");
  const tipo = tipoDeImagen(b);
  return tipo ? { b, ...tipo } : null;
}

async function importarFotos({ carpeta, guias, inf, log }) {
  if (!storageConfigurado()) { log("Fotos: Storage no está configurado (SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY). Se omiten."); return; }
  // El nombre lleva un resumen del contenido: la misma foto da el mismo nombre y no se sube dos veces.
  const yaEstan = new Set((await pool.query(`SELECT ruta FROM pedido_archivos WHERE ruta LIKE '%-fs-%'`)).rows.map(r => r.ruta));
  const pendientes = [];
  const agregar = (guia, tipo, dataUrl) => {
    const img = deDataUrl(dataUrl);
    if (!img) return;
    const ruta = `${guia}/${tipo}-fs-${createHash("sha256").update(img.b).digest("hex").slice(0, 16)}.${img.ext}`;
    if (!yaEstan.has(ruta)) { yaEstan.add(ruta); pendientes.push({ guia, tipo, ruta, img }); }
  };
  const vaciar = async () => {
    const lote = pendientes.splice(0);
    for (let i = 0; i < lote.length; i += 4) {
      await Promise.all(lote.slice(i, i + 4).map(async x => {
        try {
          await subirArchivo(x.ruta, x.img.b, x.img.mime, { reemplazar: true });
          await pool.query(`INSERT INTO pedido_archivos (guia, tipo, ruta) VALUES ($1, $2, $3)`, [x.guia, x.tipo, x.ruta]);
          inf.ok("fotos");
        } catch (e) { inf.omitir("fotos", `no se pudo subir: ${e.message}`, x.ruta); }
      }));
    }
  };
  let n = 0;
  const avance = () => { if (++n % 200 === 0) log(`Fotos: ${n} guías revisadas…`); };

  for await (const { id, datos: d } of leer(carpeta, "pedidos")) { if (guias.has(id)) agregar(id, "mini", d.mini); if (pendientes.length >= 40) await vaciar(); }
  await vaciar();
  for await (const { id, datos: d } of leer(carpeta, "fotos")) { avance(); if (guias.has(id)) agregar(id, "salida", d.salida); if (pendientes.length >= 40) await vaciar(); }
  await vaciar();
  for await (const { id, datos: d } of leer(carpeta, "entregas")) {
    avance();
    if (!guias.has(id)) continue;
    agregar(id, "entrega", d.foto);
    agregar(id, "firma", d.firma);
    for (const p of Array.isArray(d.previas) ? d.previas : []) { agregar(id, "previa", p?.foto); agregar(id, "previa", p?.firma); }
    if (pendientes.length >= 40) await vaciar();
  }
  await vaciar();
}

// ---------- Terminal ----------

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { values: a } = parseArgs({
    options: { carpeta: { type: "string" }, simular: { type: "boolean" }, "sin-fotos": { type: "boolean" }, reemplazar: { type: "boolean" }, si: { type: "boolean" } }
  });
  try {
    if (!a.carpeta) throw new Error("Falta --carpeta con la exportación de Firestore");
    if (a.reemplazar && !a.si && !a.simular) throw new Error("--reemplazar borra los datos actuales de la base: agrega --si para confirmar");
    const informe = await importar({ carpeta: a.carpeta, simular: !!a.simular, conFotos: !a["sin-fotos"], reemplazar: !!a.reemplazar });
    console.log(informe.simulacion ? "\nSIMULACIÓN (no se guardó nada):" : "\nImportación terminada:");
    for (const [c, x] of Object.entries(informe.colecciones)) {
      console.log(`  ${c.padEnd(14)} ${String(x.importados).padStart(6)} importados${x.omitidos ? ` · ${x.omitidos} omitidos` : ""}`);
      for (const [motivo, ids] of Object.entries(x.avisos))
        console.log(`      - ${motivo}: ${ids.length} (${ids.slice(0, 5).join(", ")}${ids.length > 5 ? "…" : ""})`);
    }
    if (!informe.simulacion) console.log(`\nDetalle en ${join(resolve(a.carpeta), "informe-importacion.json")}`);
  } catch (e) {
    console.error("No se pudo importar:", e.message);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}
