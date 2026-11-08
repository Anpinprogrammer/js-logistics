/* La base guarda los datos sin cambiar las cuentas: se guarda un estado S de la app (generador.js) en las tablas
   de Postgres, se vuelve a leer con cargarEstado y los cálculos tienen que dar exactamente lo mismo que con S.
   Junto con equivalencia.test.js (servidor = app.js), prueba que el sistema nuevo cuadra con el de producción. */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { pool, reiniciarBase } from "./ayuda.js";
import { generarDatos } from "./generador.js";
import { crearCalculos } from "../helpers/calculos.js";
import { MODELOS, cargarEstado, COLS_ESTADO } from "../models/documentos.js";
import { moverDia, hoy, semanaDe, moverSemana } from "../helpers/fechas.js";

before(reiniciarBase);
after(() => pool.end());

/** Guarda S en la base con los modelos (lo que no cabe en el esquema queda como lo dejaría la importación). */
async function guardarEstado(S) {
  const c = await pool.connect();
  try {
    await c.query("BEGIN");
    for (const col of ["clientes", "mensajeros", "cuentas", "usuarios", "pedidos", "movimientos", "recaudos", "liquidaciones", "cajamovs", "jornadas"]) {
      for (const d of Object.values(S[col])) {
        const doc = col === "usuarios" ? { ...d, email: d.email || d.uid + "@sin-correo.test" } : d;
        await MODELOS[col].guardar(c, doc);
      }
    }
    await c.query("COMMIT");
  } catch (e) { await c.query("ROLLBACK"); throw e; } finally { c.release(); }
}

const r = x => JSON.parse(JSON.stringify(x, (k, v) => (typeof v === "number" ? Math.round(v * 100) / 100 : v)));
const sinPedido = rs => rs.map(x => ({ ...x, lineas: x.lineas.map(({ p, ...l }) => l) }));

test("los cálculos dan lo mismo leyendo de Postgres que con los datos originales", async () => {
  for (const semilla of [7, 21]) {
    await reiniciarBase();
    const S = generarDatos(semilla);
    // El generador deja algunos cobros negativos (la app no los deja escribir); la importación los pasa a 0.
    for (const p of Object.values(S.pedidos)) if (p.valorCobrado < 0) p.valorCobrado = 0;
    await guardarEstado(JSON.parse(JSON.stringify(S)));
    const L = await cargarEstado(pool, COLS_ESTADO);
    const a = crearCalculos(S), b = crearCalculos(L);
    const cids = Object.keys(S.clientes), mids = Object.keys(S.mensajeros), h = hoy();
    const dias = [...Array(12)].map((_, i) => moverDia(h, -i * 3)), semanas = [0, 1, 2, 3, 5].map(i => moverSemana(semanaDe(h), -i));
    const periodo = x => mids.map(m => { const p = x.periodoMensajero(m); return { ...p, ul: p.ul?.id, ps: p.ps.map(y => y.guia), recs: p.recs.map(y => y.id), bases: p.bases.map(y => y.id) }; });
    const casos = {
      saldoCliente: x => cids.map(x.saldoCliente),
      filasCuenta: x => cids.map(x.filasCuenta),
      periodoMensajero: periodo,
      libroCaja: x => x.libroCaja(),
      resumenCaja: x => (({ L, ...y }) => y)(x.resumenCaja()),
      cajaOficina: x => ["a1", "a2", "ad"].map(x.cajaOficina),
      esperadoArqueo: x => x.esperadoArqueo(),
      arqueos: x => x.arqueosCaja(),
      sueldosDia: x => dias.map(x.sueldosDia),
      resumenSemana: x => semanas.map(s => { const y = x.resumenSemana(s); return { ...y, filas: y.filas.map(f => ({ ...f, m: f.m.id, adelantos: f.adelantos.map(c => c.id) })) }; }),
      cuadreDia: x => dias.map(d => sinPedido(x.cuadreDia(d))),
      gruposRepetidos: x => x.gruposRepetidos().map(g => g.map(c => c.id)),
      pendientesCierre: x => (y => ({ mens: y.mens.map(z => [z.m.id, z.debe]), ofis: y.ofis.map(z => [z.u.uid, z.s]), sinRem: y.sinRem.length, sinServ: y.sinServ.length, enRuta: y.enRuta.length }))(x.pendientesCierre()),
      saldoCuenta: x => ["cu1", "cu2", "cu3"].map(x.saldoCuenta)
    };
    for (const [nombre, f] of Object.entries(casos)) assert.deepEqual(r(f(b)), r(f(a)), `${nombre} cambia al pasar por la base (semilla ${semilla})`);
  }
});
