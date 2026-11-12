/* Recepción → Recibir dinero: el mensajero anota lo que le paga un cliente en la calle.
   Abona a la cuenta del cliente como un pago de oficina, no entra a la caja hasta que el mensajero lo entrega
   y mientras tanto suma a lo que debe. Así el cierre de caja no lo cuenta dos veces ni lo pierde. */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { pool, reiniciarBase, crearCuenta, sesion } from "./ayuda.js";

let admin, asistente, mensajero, otro, cliente, idMensajero, idOtro, idPatinador, idCliente;

before(async () => {
  await reiniciarBase();
  await crearCuenta({ email: "admin@js.co", rol: "admin" });
  await crearCuenta({ email: "asis@js.co", rol: "asistente" });
  admin = await sesion("admin@js.co");
  asistente = await sesion("asis@js.co");
  idMensajero = (await admin.post("/api/mensajeros").send({ nombre: "Carlos Moto", telefono: "3200000000" })).body.mensajero.id;
  idOtro = (await admin.post("/api/mensajeros").send({ nombre: "Otro Moto" })).body.mensajero.id;
  idPatinador = (await admin.post("/api/mensajeros").send({ nombre: "Patín", tipo: "patinador", tarifa: 70000 })).body.mensajero.id;
  await crearCuenta({ email: "m@js.co", rol: "mensajero", mensajeroId: idMensajero });
  await crearCuenta({ email: "m2@js.co", rol: "mensajero", mensajeroId: idOtro });
  mensajero = await sesion("m@js.co");
  otro = await sesion("m2@js.co");
  idCliente = (await admin.post("/api/clientes").send({ nombre: "Panadería La Espiga", telefono: "3001112233", tarifa: 8000 })).body.cliente.id;
  await crearCuenta({ email: "cli@js.co", rol: "cliente", clienteId: idCliente });
  cliente = await sesion("cli@js.co");
});
after(() => pool.end());

const debe = async mid => (await admin.get(`/api/mensajeros/${mid}/periodo`)).body.periodo.debe;
const saldo = async cid => (await admin.get(`/api/clientes/${cid}/cuenta`)).body.saldo;
const caja = async () => (await admin.get("/api/caja/resumen")).body;

test("el pago que recibe el mensajero abona al cliente, suma a lo que debe y no entra a la caja", async () => {
  const [d0, s0, c0] = [await debe(idMensajero), await saldo(idCliente), await caja()];
  const r = await mensajero.post("/api/movimientos/recibidos").send({ clienteId: idCliente, concepto: "  Domicilios de la semana ", valor: 30000 });
  assert.equal(r.status, 201);
  assert.equal(r.body.movimiento.tipo, "pago_de_cliente");
  assert.equal(r.body.movimiento.medio, "efectivo");
  assert.equal(r.body.movimiento.nota, "Domicilios de la semana");
  assert.equal(r.body.movimiento.mensajeroId, idMensajero);
  assert.equal(r.body.clienteNombre, "Panadería La Espiga");
  assert.ok(Math.abs(Date.parse(r.body.movimiento.fecha) - Date.now()) < 60_000);
  assert.equal(r.body.debe, d0 + 30000);

  assert.equal(await saldo(idCliente), s0 + 30000);                    // misma lógica que un pago del cliente
  assert.equal(await debe(idMensajero), d0 + 30000);                   // la plata la tiene el mensajero
  const c1 = await caja();
  assert.equal(c1.total, c0.total);                                     // todavía no está en la caja
  assert.equal(c1.enMens, c0.enMens + 30000);                           // "todavía en manos de mensajeros"
  const libro = (await admin.get("/api/caja/libro")).body.movimientos;
  assert.ok(!libro.some(x => x.concepto.startsWith("Pago de Panadería")));

  // El cliente lo ve en su cuenta como cualquier pago.
  const cuenta = await cliente.get(`/api/clientes/${idCliente}/cuenta`);
  assert.ok(cuenta.body.filas.some(f => f.mid === r.body.movimiento.id && f.v === 30000));

  // Cuando lo entrega, entra a la caja una sola vez y deja de deberlo.
  const rec = await asistente.post("/api/recaudos").send({ mensajeroId: idMensajero, valor: 30000, medio: "efectivo" });
  assert.equal(rec.status, 201);
  assert.equal(await debe(idMensajero), d0);
  const c2 = await caja();
  assert.equal(c2.total, c0.total + 30000);
  assert.equal(c2.enMens, c0.enMens);
});

test("lo que recibió queda en su período y en la liquidación", async () => {
  await mensajero.post("/api/movimientos/recibidos").send({ clienteId: idCliente, concepto: "Envío", valor: 12000 });
  const p = (await mensajero.get(`/api/mensajeros/${idMensajero}/periodo`)).body.periodo;
  assert.equal(p.cobros, 42000);
  assert.equal(p.cobrosCli.length, 2);
  const liq = await admin.post("/api/liquidaciones").send({ mensajeroId: idMensajero, entregaFinal: p.debe, medio: "efectivo", pasarAdelanto: false });
  assert.equal(liq.status, 201);
  assert.equal(liq.body.liquidacion.cobros, 42000);
  assert.equal(liq.body.liquidacion.debe, 0);
  assert.equal(await debe(idMensajero), 0);
  // Quitar un pago ya liquidado: sale de la cuenta del cliente y la diferencia vuelve a su período abierto.
  const mov = p.cobrosCli.find(x => x.valor === 12000);
  assert.equal((await admin.delete(`/api/movimientos/${mov.id}`)).status, 200);
  assert.equal(await debe(idMensajero), -12000);
});

test("el mensajero ve solo lo que él recibió, con el nombre del cliente", async () => {
  await otro.post("/api/movimientos/recibidos").send({ clienteId: idCliente, concepto: "Otro", valor: 5000 });
  const r = await mensajero.get("/api/movimientos/recibidos?pagina=1&porPagina=5");
  assert.equal(r.status, 200);
  assert.equal(r.body.total, 1);
  assert.deepEqual(r.body.registros.map(x => [x.clienteNombre, x.concepto, x.valor]), [["Panadería La Espiga", "Domicilios de la semana", 30000]]);
  assert.equal(r.body.resumen.total, 30000);
  assert.equal(r.body.resumen.totalHoy, 30000);
  // Lo que mande en la petición no cuenta.
  assert.equal((await mensajero.get(`/api/movimientos/recibidos?mensajeroId=${idOtro}`)).body.total, 1);
  // Sus movimientos en la carga de datos: solo los suyos.
  const movs = (await mensajero.get("/api/movimientos")).body.movimientos;
  assert.ok(movs.length >= 1 && movs.every(m => m.mensajeroId === idMensajero));
  // La oficina consulta el de cualquiera.
  assert.equal((await asistente.get(`/api/movimientos/recibidos?mensajeroId=${idOtro}`)).body.total, 1);
  assert.equal((await asistente.get("/api/movimientos/recibidos")).status, 400);
});

test("no anota en nombre de otro, ni con datos inválidos, ni otros roles", async () => {
  const r = await mensajero.post("/api/movimientos/recibidos").send({ clienteId: idCliente, concepto: "x", valor: 1000, mensajeroId: idOtro });
  assert.equal(r.status, 201);
  assert.equal(r.body.movimiento.mensajeroId, idMensajero);           // se ignora: queda a su nombre
  assert.equal((await mensajero.post("/api/movimientos/recibidos").send({ clienteId: idCliente, concepto: "", valor: 1000 })).status, 400);
  assert.equal((await mensajero.post("/api/movimientos/recibidos").send({ clienteId: idCliente, concepto: "x", valor: 0 })).status, 400);
  assert.equal((await mensajero.post("/api/movimientos/recibidos").send({ clienteId: idCliente, concepto: "x", valor: 1000, medio: "nequi" })).status, 400);
  assert.equal((await mensajero.post("/api/movimientos/recibidos").send({ clienteId: "no-existe", concepto: "x", valor: 1000 })).status, 404);
  assert.equal((await asistente.post("/api/movimientos/recibidos").send({ clienteId: idCliente, concepto: "x", valor: 1000 })).status, 403);
  assert.equal((await cliente.post("/api/movimientos/recibidos").send({ clienteId: idCliente, concepto: "x", valor: 1000 })).status, 403);
  assert.equal((await cliente.get("/api/movimientos/recibidos")).status, 403);
  // Administración (actuando como mensajero) lo anota por él; a un patinador no (tiene su propia caja).
  const a = await admin.post("/api/movimientos/recibidos").send({ clienteId: idCliente, concepto: "x", valor: 2000, mensajeroId: idOtro });
  assert.equal(a.status, 201);
  assert.equal(a.body.movimiento.mensajeroId, idOtro);
  assert.equal((await admin.post("/api/movimientos/recibidos").send({ clienteId: idCliente, concepto: "x", valor: 2000, mensajeroId: idPatinador })).status, 400);
});
