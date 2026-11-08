/* Rutas de dinero: movimientos de clientes, recaudos, liquidaciones, caja, arqueo, adelantos, cuentas internas,
   sueldos, historial y papelera. Los cálculos ya están probados contra app.js (equivalencia.test.js);
   aquí se prueba que cada ruta los usa, quién puede hacer qué y que lo ya contado no se cambia. */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { pool, reiniciarBase, crearCuenta, sesion } from "./ayuda.js";
import { hoy, semanaDe } from "../helpers/fechas.js";

let admin, asistente, mensajero, cliente, m1, pat, c1, guia;

before(async () => {
  await reiniciarBase();
  await crearCuenta({ email: "admin@js.co", rol: "admin" });
  await crearCuenta({ email: "asis@js.co", rol: "asistente" });
  admin = await sesion("admin@js.co");
  asistente = await sesion("asis@js.co");
  m1 = (await admin.post("/api/mensajeros").send({ nombre: "Carlos" })).body.mensajero;
  pat = (await admin.post("/api/mensajeros").send({ nombre: "Pedro", tipo: "patinador", tarifa: 40000 })).body.mensajero;
  c1 = (await asistente.post("/api/clientes").send({ nombre: "Tienda Uno", telefono: "3001234567", tarifa: 8000 })).body.cliente;
  await crearCuenta({ email: "carlos@js.co", rol: "mensajero", mensajeroId: m1.id });
  await crearCuenta({ email: "tienda@js.co", rol: "cliente", clienteId: c1.id });
  mensajero = await sesion("carlos@js.co");
  cliente = await sesion("tienda@js.co");

  // Una guía entregada: Carlos cobró 50.000 en efectivo
  guia = (await admin.post("/api/pedidos").send({ mensajeroId: m1.id, clienteId: c1.id, valorServicio: 8000, aCobrar: 50000 })).body.pedido.guia;
  const e = await mensajero.post(`/api/pedidos/${guia}/entrega`).send({ destinatario: "Ana", valorCobrado: 50000, metodo: "efectivo" });
  assert.equal(e.status, 200, JSON.stringify(e.body));
});
after(() => pool.end());

const debe = async () => (await admin.get(`/api/mensajeros/${m1.id}/periodo`)).body.periodo.debe;

test("movimientos de clientes: la oficina los registra; el mensajero no; el saldo lo calcula el servidor", async () => {
  const antes = (await admin.get(`/api/clientes/${c1.id}/cuenta`)).body.saldo;
  const r = await asistente.post("/api/movimientos").send({ clienteId: c1.id, tipo: "pago_a_cliente", valor: 10000, medio: "nequi", nota: "abono" });
  assert.equal(r.status, 201, JSON.stringify(r.body));
  assert.equal(r.body.movimiento.porUid !== undefined, true);
  assert.match(r.body.movimiento.fecha, /^\d{4}-\d{2}-\d{2}T/); // ISO en la API
  const despues = (await admin.get(`/api/clientes/${c1.id}/cuenta`)).body.saldo;
  assert.equal(despues, antes - 10000);

  assert.equal((await mensajero.post("/api/movimientos").send({ clienteId: c1.id, tipo: "pago_a_cliente", valor: 1, medio: "nequi" })).status, 403);
  const malo = await asistente.post("/api/movimientos").send({ clienteId: c1.id, tipo: "inventado", valor: 1 });
  assert.equal(malo.status, 400);
  assert.equal(malo.body.error.code, "DATOS_INVALIDOS");
  // El asistente no registra cargos (solo administración)
  assert.equal((await asistente.post("/api/movimientos").send({ clienteId: c1.id, tipo: "cargo", valor: 1000 })).status, 403);

  // Cambiar el medio: el asistente, de lo suyo; queda el anterior
  const cm = await asistente.patch(`/api/movimientos/${r.body.movimiento.id}`).send({ medio: "efectivo" });
  assert.equal(cm.status, 200, JSON.stringify(cm.body));
  assert.equal(cm.body.movimiento.medioAntes, "nequi");

  // El cliente ve su cuenta, pero no la de otro (404)
  assert.equal((await cliente.get(`/api/clientes/${c1.id}/cuenta`)).status, 200);
  assert.equal((await cliente.get(`/api/clientes/otro/cuenta`)).status, 404);
  const lista = await admin.get("/api/movimientos");
  assert.equal(lista.body.movimientos.length, 1);
});

test("recaudos y liquidación: lo que entrega el mensajero baja lo que debe; liquidar cierra el período y reabrir lo devuelve", async () => {
  const d0 = await debe();
  assert.ok(d0 > 0, "Carlos debe lo que cobró");
  const r = await asistente.post("/api/recaudos").send({ mensajeroId: m1.id, valor: 20000, medio: "efectivo" });
  assert.equal(r.status, 201, JSON.stringify(r.body));
  assert.equal(r.body.debe, d0 - 20000);
  assert.equal(await debe(), d0 - 20000);
  assert.equal((await mensajero.post("/api/recaudos").send({ mensajeroId: m1.id, valor: 1, medio: "efectivo" })).status, 403);
  assert.equal((await asistente.post("/api/recaudos").send({ mensajeroId: m1.id, valor: -5, medio: "efectivo" })).status, 400);
  // El mensajero ve solo lo suyo
  assert.equal((await mensajero.get("/api/recaudos")).body.recaudos.length, 1);

  // Liquidar: lo que manda la pantalla (sus totales) no cuenta; el servidor calcula todo
  const liq = await admin.post("/api/liquidaciones").send({ mensajeroId: m1.id, entregaFinal: d0 - 20000, medio: "efectivo", debe: 999, efectivo: 1, adelanto: 0 });
  assert.equal(liq.status, 201, JSON.stringify(liq.body));
  assert.equal(liq.body.liquidacion.debe, 0);
  assert.deepEqual(liq.body.liquidacion.guias, [guia]);
  assert.equal(await debe(), 0);
  assert.equal((await asistente.post("/api/liquidaciones").send({ mensajeroId: m1.id })).status, 403);
  assert.equal((await mensajero.get("/api/liquidaciones")).body.liquidaciones.length, 1);

  // Reabrir: la guía vuelve al período; el dinero recibido (también la entrega final) se conserva
  const re = await admin.delete(`/api/liquidaciones/${liq.body.liquidacion.id}`);
  assert.equal(re.status, 200, JSON.stringify(re.body));
  assert.equal(await debe(), 0);
  assert.equal((await admin.get("/api/liquidaciones")).body.liquidaciones.length, 0);
});

test("caja: el arqueo usa lo que calcula el servidor y lo contado ya no se cambia", async () => {
  const g = await admin.post("/api/caja/movimientos").send({ tipo: "sale", cat: "gasto", valor: 3000, medio: "efectivo", concepto: "Bolsas", fecha: new Date().toISOString() });
  assert.equal(g.status, 201, JSON.stringify(g.body));
  assert.equal((await asistente.post("/api/caja/movimientos").send({ tipo: "sale", cat: "gasto", valor: 3000, medio: "efectivo" })).status, 403);

  const esp = (await admin.get("/api/caja/arqueo/esperado")).body.esperado;
  // La pantalla manda también lo que esperaba (aquí, inventado): se ignora
  const a = await admin.post("/api/caja/arqueos").send({ esperado: { efectivo: 1, nequi: 1, bancolombia: 1 }, contado: esp, nota: "Cierre" });
  assert.equal(a.status, 201, JSON.stringify(a.body));
  assert.deepEqual(a.body.arqueo.dif, {});
  assert.ok((await admin.get("/api/caja/corte")).body.corte);

  // Lo de antes del arqueo ya no se cambia
  const rec = (await admin.get("/api/recaudos")).body.recaudos[0];
  const no = await admin.patch(`/api/recaudos/${rec.id}`).send({ valor: 1, medio: "efectivo" });
  assert.equal(no.status, 409);
  assert.equal(no.body.error.code, "YA_CONTADO");
  assert.equal((await admin.delete(`/api/caja/movimientos/${g.body.movimiento.id}`)).status, 409);

  // Deshacer el último arqueo abre la caja otra vez
  assert.equal((await admin.delete(`/api/caja/arqueos/${a.body.arqueo.id}`)).status, 200);
  assert.equal((await admin.get("/api/caja/corte")).body.corte, null);
  assert.equal((await admin.delete(`/api/caja/movimientos/${g.body.movimiento.id}`)).status, 200);
});

test("adelantos: la devolución y el quitar de la pantalla actual no cuentan dos veces", async () => {
  const sem = semanaDe(hoy());
  const ad = (await admin.post("/api/caja/movimientos").send({ tipo: "sale", cat: "adelanto", personaId: m1.id, valor: 10000, medio: "efectivo", semana: sem, fecha: new Date().toISOString() })).body.movimiento;
  assert.ok(ad?.id);
  // Como lo hace la pantalla: POST de la devolución y luego PATCH de `devuelto` con el mismo total
  const dev = await admin.post("/api/caja/movimientos").send({ tipo: "entra", cat: "devolucion", personaId: m1.id, valor: 4000, medio: "efectivo", adelantoId: ad.id, fecha: new Date().toISOString() });
  assert.equal(dev.status, 201, JSON.stringify(dev.body));
  assert.equal((await admin.patch(`/api/caja/movimientos/${ad.id}`).send({ devuelto: 4000 })).status, 200);
  assert.equal((await admin.patch(`/api/caja/movimientos/${ad.id}`).send({ devuelto: 9999 })).status, 409); // a mano, no
  const ver = async () => (await admin.get("/api/caja/movimientos")).body.movimientos.find(x => x.id === ad.id).devuelto || 0;
  assert.equal(await ver(), 4000);
  // Quitar la devolución como la pantalla: PATCH con lo que queda y DELETE
  assert.equal((await admin.patch(`/api/caja/movimientos/${ad.id}`).send({ devuelto: 0 })).status, 200);
  assert.equal((await admin.delete(`/api/caja/movimientos/${dev.body.movimiento.id}`)).status, 200);
  assert.equal(await ver(), 0);
  // No se puede devolver más de lo que falta
  assert.equal((await admin.post(`/api/caja/adelantos/${ad.id}/devolucion`).send({ valor: 50000, medio: "efectivo" })).status, 400);
  assert.equal((await admin.delete(`/api/caja/adelantos/${ad.id}`)).status, 200);
});

test("cuentas internas, días de pago fijo y la planilla de sueldos", async () => {
  const cu = await admin.post("/api/cuentas").send({ nombre: "JS Envíos", tipo: "socio" });
  assert.equal(cu.status, 201, JSON.stringify(cu.body));
  const mv = await asistente.post("/api/caja/movimientos").send({ tipo: "sale", cat: "interna", cuentaId: cu.body.cuenta.id, valor: 5000, medio: "nequi", concepto: "Préstamo", fecha: new Date().toISOString() });
  assert.equal(mv.status, 201, JSON.stringify(mv.body));
  const cuentas = (await asistente.get("/api/cuentas")).body.cuentas;
  assert.equal(cuentas[0].saldo, 5000);
  assert.equal((await mensajero.get("/api/cuentas")).status, 403);

  const dia = hoy();
  const j = await admin.put(`/api/jornadas/${pat.id}_${dia}`).send({ id: "lo-ignora", personaId: pat.id, dia, valor: 40000 });
  assert.equal(j.status, 200, JSON.stringify(j.body));
  assert.equal(j.body.jornada.id, `${pat.id}_${dia}`);
  assert.equal((await admin.put(`/api/jornadas/x`).send({ personaId: m1.id, dia, valor: 1 })).status, 400); // Carlos gana por porcentaje
  const planilla = await admin.get("/api/sueldos/semana");
  assert.equal(planilla.status, 200);
  assert.equal(planilla.body.filas.find(f => f.persona.id === pat.id).total, 40000);
  assert.equal((await mensajero.get(`/api/sueldos/mensajeros/${m1.id}`)).status, 200);
  assert.equal((await mensajero.get(`/api/sueldos/mensajeros/${pat.id}`)).status, 403);
  assert.equal((await admin.delete(`/api/jornadas/${pat.id}_${dia}`)).status, 200);
});

test("reabrir una guía, historial y papelera", async () => {
  assert.equal((await asistente.post(`/api/pedidos/${guia}/reabrir`)).status, 403);
  const r = await admin.post(`/api/pedidos/${guia}/reabrir`);
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(r.body.pedido.estado, "pendiente");
  assert.equal(r.body.pedido.valorCobrado, 0);

  const mov = (await admin.post("/api/movimientos").send({ clienteId: c1.id, tipo: "cargo", valor: 2000, nota: "x" })).body.movimiento;
  assert.equal((await admin.delete(`/api/movimientos/${mov.id}`)).status, 200);
  const pap = (await admin.get("/api/papelera")).body.papelera;
  const x = pap.find(p => p.docId === mov.id);
  assert.ok(x, "quedó en la papelera");
  assert.equal((await asistente.get("/api/papelera")).status, 403);
  assert.equal((await admin.post(`/api/papelera/${x.id}/restaurar`)).status, 200);
  assert.ok((await admin.get("/api/movimientos")).body.movimientos.some(m => m.id === mov.id));

  const h = await admin.get(`/api/historial?desde=${hoy()}`);
  assert.equal(h.status, 200);
  assert.ok(h.body.cambios.some(c => /Restauró/.test(c.resumen)));
  assert.ok(h.body.cambios.every(c => c.id && c.fecha && "quien" in c && "op" in c));
  const propio = await mensajero.get(`/api/historial?desde=${hoy()}`);
  assert.ok(propio.body.cambios.length > 0 && propio.body.cambios.every(c => !/Restauró/.test(c.resumen))); // solo lo suyo
});

test("sincronizar: cada rol recibe solo lo que puede ver", async () => {
  const a = (await admin.get("/api/sincronizar")).body.datos;
  assert.ok(a.pedidos[guia] && a.clientes[c1.id] && a.usuarios);
  const m = (await mensajero.get("/api/sincronizar")).body.datos;
  assert.ok(m.pedidos[guia]);
  assert.equal(m.clientes, undefined);
  assert.equal(m.movimientos, undefined);
  const c = (await cliente.get("/api/sincronizar")).body.datos;
  assert.deepEqual(Object.keys(c.clientes), [c1.id]);
});

test("pedidos en bloque y pago del domicilio aparte", async () => {
  const a = (await mensajero.post("/api/pedidos").send({})).body.pedido.guia, b = (await mensajero.post("/api/pedidos").send({})).body.pedido.guia;
  assert.equal((await mensajero.post("/api/pedidos/en-bloque").send({ modo: "sin", guias: [a, b], clienteId: c1.id })).status, 403);
  const r = await asistente.post("/api/pedidos/en-bloque").send({ modo: "sin", guias: [a, b], clienteId: c1.id });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(r.body.actualizadas, 2);
  const s = await asistente.post("/api/pedidos/en-bloque").send({ modo: "serv", guias: [a, b] }); // usa la tarifa del cliente
  assert.equal(s.status, 200, JSON.stringify(s.body));
  assert.equal((await admin.get(`/api/pedidos/${a}`)).body.pedido.valorServicio, 8000);

  assert.equal((await asistente.post(`/api/pedidos/${a}/pago-domicilio`).send({ medio: "nequi", valor: 0 })).status, 400);
  const p = await asistente.post(`/api/pedidos/${a}/pago-domicilio`).send({ medio: "nequi", valor: 8000 });
  assert.equal(p.status, 200, JSON.stringify(p.body));
  assert.equal(p.body.pedido.domiPagado, true);
  const q = await asistente.delete(`/api/pedidos/${a}/pago-domicilio`);
  assert.equal(q.status, 200);
  assert.equal(q.body.pedido.domiPagado, false);
});
