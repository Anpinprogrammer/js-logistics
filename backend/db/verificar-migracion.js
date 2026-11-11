/* Compara la exportación de Firestore con lo que quedó en Postgres después de importarla, usando las MISMAS
   cuentas de la app (helpers/calculos.js es copia fiel de app/js/app.js). Solo lee: no cambia nada.

   Revisa cuántos registros hay de cada cosa, el saldo de cada cliente, lo que debe cada mensajero,
   la caja general (total y por medio), las cajas de oficina, las cuentas internas y la hora del último arqueo.

   Uso (desde backend/, con el .env apuntando a la base que se importó):
     npm run db:verificar -- --carpeta ../exportacion-2026-11-16-0700

   Deja `verificacion-migracion.json` en la carpeta. Termina con error (código 1) si algo no da igual. */
import { parseArgs } from "node:util";
import { createReadStream } from "node:fs";
import { access, writeFile } from "node:fs/promises";
import { createInterface } from "node:readline";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { pool } from "../config/db.js";
import { crearCalculos } from "../helpers/calculos.js";
import { cargarEstado, Meta } from "../models/documentos.js";

const COLS = ["pedidos", "clientes", "mensajeros", "movimientos", "recaudos", "liquidaciones", "jornadas", "cajamovs", "cuentas", "usuarios", "vinculos"];

async function leerColeccion(carpeta, nombre) {
  const ruta = join(carpeta, `${nombre}.jsonl`), out = {};
  try { await access(ruta); } catch { return out; }
  const lineas = createInterface({ input: createReadStream(ruta, { encoding: "utf8" }), crlfDelay: Infinity });
  for await (const l of lineas) if (l.trim()) { const { id, datos } = JSON.parse(l); out[id] = datos; }
  return out;
}

/** El estado S tal como lo armaba la app vieja (cada documento con sus datos, indexado por su ID). */
export async function estadoViejo(carpeta) {
  const S = {};
  for (const c of COLS) S[c] = await leerColeccion(carpeta, c);
  // La app guarda el ID dentro del documento (guia en pedidos, id en lo demás); si un documento viejo no lo trae, se pone.
  for (const [g, p] of Object.entries(S.pedidos)) if (!p.guia) S.pedidos[g] = { ...p, guia: g };
  for (const c of ["clientes", "mensajeros", "movimientos", "recaudos", "liquidaciones", "jornadas", "cajamovs", "cuentas"])
    for (const [id, d] of Object.entries(S[c])) if (!d.id) S[c][id] = { ...d, id };
  const admins = await leerColeccion(carpeta, "admins");
  for (const [id, u] of Object.entries(S.usuarios)) S.usuarios[id] = { ...u, uid: u.uid || id, rol: id in admins ? "admin" : u.rol };
  const meta = await leerColeccion(carpeta, "meta");
  return { S, corte: Number(meta.caja?.corte) || 0 };
}

/** Resumen comparable de un estado: conteos y cuentas de dinero. Si un cálculo falla con estos datos
    (por ejemplo, una guía cerrada sin hora en Firebase), queda el error en su lugar y sale como diferencia. */
export function resumir(S, corte) {
  const k = crearCalculos(S, { corteRemoto: corte });
  const n = v => Math.round(Number(v) || 0);
  const seguro = f => { try { return f(); } catch (e) { return { error: e.message }; } };
  const mapa = (ids, f) => Object.fromEntries([...ids].sort().map(id => [id, seguro(() => n(f(id)))]));
  return {
    conteos: Object.fromEntries(COLS.filter(c => c !== "vinculos").map(c => [c, Object.keys(S[c] || {}).length])),
    caja: seguro(() => {
      const caja = k.resumenCaja(), porMedio = {};
      for (const [m, v] of Object.entries(caja.porMedio)) if (n(v)) porMedio[m] = n(v);
      return { total: n(caja.total), porPagar: n(caja.porPagar), porCobrar: n(caja.porCobrar), enMensajeros: n(caja.enMens),
        sueldosPendientes: n(caja.sueldosPend), disponible: n(caja.disponible), sobrantes: n(caja.sobrantes.total), porMedio };
    }),
    ultimoArqueo: k.corteCaja() ? new Date(k.corteCaja()).toISOString() : null,
    saldosClientes: mapa(Object.keys(S.clientes), k.saldoCliente),
    debeMensajeros: mapa(Object.keys(S.mensajeros), id => k.periodoMensajero(id).debe),
    cajasOficina: seguro(() => Object.fromEntries(k.asistentes().map(u => [u.uid, Object.fromEntries(Object.entries(k.cajaOficina(u.uid).saldo).map(([m, v]) => [m, n(v)]))]))),
    cuentasInternas: mapa(Object.keys(S.cuentas), k.saldoCuenta)
  };
}

/** Lista de diferencias entre dos resúmenes: [{ dato, firebase, postgres }]. */
export function diferencias(a, b, ruta = "") {
  const out = [];
  if (a && b && typeof a === "object" && typeof b === "object") {
    for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) out.push(...diferencias(a[k], b[k], ruta ? `${ruta}.${k}` : k));
  } else if (JSON.stringify(a ?? null) !== JSON.stringify(b ?? null)) out.push({ dato: ruta, firebase: a ?? null, postgres: b ?? null });
  return out;
}

export async function verificar({ carpeta, db = pool }) {
  const viejo = await estadoViejo(resolve(carpeta));
  const S = await cargarEstado(db);
  const antes = resumir(viejo.S, viejo.corte), despues = resumir(S, await Meta.corte(db));
  return { fecha: new Date().toISOString(), firebase: antes, postgres: despues, diferencias: diferencias(antes, despues) };
}

// ---------- Terminal ----------

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { values: a } = parseArgs({ options: { carpeta: { type: "string" } } });
  try {
    if (!a.carpeta) throw new Error("Falta --carpeta con la exportación de Firestore que se importó");
    console.log("Calculando con los datos de Firebase y con los de la base nueva…");
    const r = await verificar({ carpeta: a.carpeta });
    const $ = v => (typeof v === "number" ? v.toLocaleString("es-CO") : JSON.stringify(v));
    console.log("\nConteos (Firebase → base nueva):");
    for (const [c, x] of Object.entries(r.firebase.conteos)) console.log(`  ${c.padEnd(14)} ${String(x).padStart(7)} → ${String(r.postgres.conteos[c]).padStart(7)}${x === r.postgres.conteos[c] ? "" : "   ≠"}`);
    console.log(`\nCaja general: ${$(r.firebase.caja.total ?? r.firebase.caja)} → ${$(r.postgres.caja.total ?? r.postgres.caja)}`);
    if (!r.diferencias.length) console.log("\nTodo da igual: conteos, saldos de clientes, mensajeros, caja, cajas de oficina y cuentas internas.");
    else {
      console.log(`\n${r.diferencias.length} diferencia(s):`);
      for (const d of r.diferencias.slice(0, 40)) console.log(`  - ${d.dato}: Firebase ${$(d.firebase)} · base nueva ${$(d.postgres)}`);
      if (r.diferencias.length > 40) console.log("  …");
      console.log("Revisa el informe-importacion.json: lo omitido por datos inválidos explica parte de las diferencias de conteo.");
      process.exitCode = 1;
    }
    const ruta = join(resolve(a.carpeta), "verificacion-migracion.json");
    await writeFile(ruta, JSON.stringify(r, null, 2));
    console.log(`\nDetalle en ${ruta}`);
  } catch (e) {
    console.error("No se pudo verificar:", e.message);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}
