/* Prueba de equivalencia: ejecuta el app/js/app.js ORIGINAL (el que está en producción) en una máquina virtual
   con un navegador falso, le carga los mismos datos que al servidor y compara resultado por resultado:
   saldos, períodos de mensajeros, libro y resumen de caja, cajas de oficina, arqueos, sueldos, cuadres y repetidos.
   Si alguien cambia la lógica en un lado y no en el otro, esta prueba falla. */
process.env.TZ = "America/Bogota"; // la app usa la hora del equipo; en la oficina es la de Colombia

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import vm from "node:vm";
import { generarDatos } from "./generador.js";
import { crearCalculos, resultadoArqueo, netoArqueo } from "../helpers/calculos.js";
import { diasSemana, moverDia, hoy, semanaDe, moverSemana } from "../helpers/fechas.js";

const RUTA_APP = new URL("../../app/js/app.js", import.meta.url);

function cargarAppOriginal() {
  const nada = new Proxy(function () {}, {
    get: (t, k) => (k === Symbol.toPrimitive ? () => "" : k === Symbol.iterator ? function* () {} : k === "then" ? undefined : k === "length" ? 0 : nada),
    apply: () => nada, construct: () => nada, set: () => true, has: () => true
  });
  const ctx = vm.createContext({
    document: nada, navigator: { onLine: true }, localStorage: { getItem: () => null, setItem() {} }, location: { reload() {} },
    addEventListener() {}, setInterval() {}, setTimeout() {}, clearTimeout() {}, scrollTo() {}, console, URL, Blob: function () {}, Image: function () {}
  });
  ctx.window = ctx;
  vm.runInContext(readFileSync(RUTA_APP, "utf8"), ctx, { filename: "app.js" });
  return ctx;
}

const r = x => JSON.parse(JSON.stringify(x, (k, v) => (typeof v === "number" ? Math.round(v * 100) / 100 : v)));

test("los cálculos del servidor dan exactamente lo mismo que app/js/app.js", { skip: !existsSync(RUTA_APP) && "no se encontró app/js/app.js" }, () => {
  for (const semilla of [7, 21, 1234]) {
    const datos = generarDatos(semilla);
    const ctx = cargarAppOriginal();
    ctx.__datos = JSON.stringify(datos);
    vm.runInContext(`{ const d = JSON.parse(__datos); for (const k of Object.keys(S)) { S[k] = {}; Object.assign(S[k], d[k] || {}); } }`, ctx);
    const app = code => r(vm.runInContext(code, ctx));
    const srv = crearCalculos(JSON.parse(JSON.stringify(datos)), { corteRemoto: 0 });
    const cids = Object.keys(datos.clientes), mids = Object.keys(datos.mensajeros), h = hoy();
    const dias = [...Array(12)].map((_, i) => moverDia(h, -i * 3));
    const semanas = [0, 1, 2, 3, 5].map(i => moverSemana(semanaDe(h), -i));

    const casos = {
      saldoCliente: [`Object.keys(S.clientes).map(saldoCliente)`, cids.map(srv.saldoCliente)],
      filasCuenta: [`Object.keys(S.clientes).map(filasCuenta)`, cids.map(srv.filasCuenta)],
      periodoMensajero: [`Object.keys(S.mensajeros).map(m=>{const p=periodoMensajero(m);return {...p,ps:p.ps.map(x=>x.guia),recs:p.recs.map(x=>x.id),bases:p.bases.map(x=>x.id)}})`,
        // cobros y cobrosCli (pagos de clientes que recibió el mensajero) no existen en la app vieja: se comparan aparte en dinero.test.js.
        mids.map(m => { const { cobros, cobrosCli, ...p } = srv.periodoMensajero(m); return { ...p, ps: p.ps.map(x => x.guia), recs: p.recs.map(x => x.id), bases: p.bases.map(x => x.id) }; })],
      libroCaja: [`libroCaja()`, srv.libroCaja()],
      resumenCaja: [`(({L,...x})=>x)(resumenCaja())`, (({ L, ...x }) => x)(srv.resumenCaja())],
      cajaOficina: [`["a1","a2","ad"].map(cajaOficina)`, ["a1", "a2", "ad"].map(srv.cajaOficina)],
      esperadoArqueo: [`esperadoArqueo()`, srv.esperadoArqueo()],
      corteCaja: [`corteCaja()`, srv.corteCaja()],
      sueldosDia: [`${JSON.stringify(dias)}.map(sueldosDia)`, dias.map(srv.sueldosDia)],
      resumenSemana: [`${JSON.stringify(semanas)}.map(s=>{const x=resumenSemana(s);return {...x,filas:x.filas.map(f=>({...f,m:f.m.id,adelantos:f.adelantos.map(c=>c.id)}))}})`,
        semanas.map(s => { const x = srv.resumenSemana(s); return { ...x, filas: x.filas.map(f => ({ ...f, m: f.m.id, adelantos: f.adelantos.map(c => c.id) })) }; })],
      sueldoPersonaSemana: [`${JSON.stringify(semanas)}.flatMap(s=>Object.keys(S.mensajeros).map(m=>{const x=sueldoPersonaSemana(m,s);return {...x,adelantos:x.adelantos.map(c=>c.id),pagos:x.pagos.map(c=>c.id)}}))`,
        semanas.flatMap(s => mids.map(m => { const x = srv.sueldoPersonaSemana(m, s); return { ...x, adelantos: x.adelantos.map(c => c.id), pagos: x.pagos.map(c => c.id) }; }))],
      pendienteAnterior: [`Object.keys(S.mensajeros).map(m=>pendienteAnterior(m,semanaDe(hoy())).map(x=>[x.sem,x.neto]))`, mids.map(m => srv.pendienteAnterior(m, semanaDe(h)).map(x => [x.sem, x.neto]))],
      cuadreDia: [`${JSON.stringify(dias)}.map(cuadreDia)`, dias.map(srv.cuadreDia)],
      gruposRepetidos: [`gruposRepetidos().map(g=>g.map(c=>c.id))`, srv.gruposRepetidos().map(g => g.map(c => c.id))],
      parecidos: [`parecidos("Tienda Luna","3110000000").map(d=>[d.c.id,d.igual])`, srv.parecidos("Tienda Luna", "3110000000").map(d => [d.c.id, d.igual])],
      pendientesCierre: [`(x=>({mens:x.mens.map(y=>[y.m.id,y.debe]),ofis:x.ofis.map(y=>[y.u.uid,y.s]),sinRem:x.sinRem.length,sinServ:x.sinServ.length,enRuta:x.enRuta.length,arqueoHoy:x.arqueoHoy}))(pendientesCierre())`,
        (x => ({ mens: x.mens.map(y => [y.m.id, y.debe]), ofis: x.ofis.map(y => [y.u.uid, y.s]), sinRem: x.sinRem.length, sinServ: x.sinServ.length, enRuta: x.enRuta.length, arqueoHoy: x.arqueoHoy }))(srv.pendientesCierre())],
      saldoCuenta: [`["cu1","cu2","cu3"].map(saldoCuenta)`, ["cu1", "cu2", "cu3"].map(srv.saldoCuenta)],
      yaContado: [`[Date.now(), Date.now()-3*864e5, Date.now()-20*864e5].map(yaContado)`, [Date.now(), Date.now() - 3 * 864e5, Date.now() - 20 * 864e5].map(srv.yaContado)],
      semanasAdelanto: [`semanasAdelanto().map(x=>x[0])`, srv.semanasAdelanto().map(x => x[0])],
      diasSemana: [`diasSemana(semanaDe(hoy()))`, diasSemana(semanaDe(h))]
    };
    casos.resultadoArqueo = [`arqueosCaja().map(a=>[a.id,resultadoArqueo(a),netoArqueo(a)])`, srv.arqueosCaja().map(a => [a.id, resultadoArqueo(a), netoArqueo(a)])];

    for (const [nombre, [codigoApp, valorSrv]] of Object.entries(casos)) {
      assert.deepEqual(r(valorSrv), app(codigoApp), `${nombre} no coincide con la app (semilla ${semilla})`);
    }
  }
});

