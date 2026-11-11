import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { pool, reiniciarBase, crearCuenta, sesion } from "./ayuda.js";

let admin, mensajero, otroMensajero, cliente, c1, c2;

before(async () => {
  await reiniciarBase();
  await crearCuenta({ email: "admin@js.co", rol: "admin" });
  admin = await sesion("admin@js.co");
  const m1 = (await admin.post("/api/mensajeros").send({ nombre: "Carlos" })).body.mensajero;
  const m2 = (await admin.post("/api/mensajeros").send({ nombre: "Diana" })).body.mensajero;
  c1 = (await admin.post("/api/clientes").send({ nombre: "Tienda Uno", telefono: "300 123 4567", tarifa: 8000 })).body.cliente;
  c2 = (await admin.post("/api/clientes").send({ nombre: "Tienda Dos", telefono: "301 000 0000", tarifa: 0 })).body.cliente;
  await crearCuenta({ email: "carlos@js.co", rol: "mensajero", mensajeroId: m1.id });
  await crearCuenta({ email: "diana@js.co", rol: "mensajero", mensajeroId: m2.id });
  await crearCuenta({ email: "tienda@js.co", rol: "cliente", clienteId: c1.id });
  mensajero = await sesion("carlos@js.co");
  otroMensajero = await sesion("diana@js.co");
  cliente = await sesion("tienda@js.co");
});
after(() => pool.end());

test("el mensajero busca remitentes y solo ve nombre e id", async () => {
  const r = await mensajero.get("/api/clientes/buscar?q=tienda");
  assert.equal(r.status, 200);
  assert.deepEqual(r.body.clientes.map(c => c.nombre), ["Tienda Dos", "Tienda Uno"]);
  assert.deepEqual(Object.keys(r.body.clientes[0]).sort(), ["id", "nombre"]);
  assert.deepEqual((await mensajero.get("/api/clientes/buscar?q=t")).body.clientes, []);
  assert.equal((await cliente.get("/api/clientes/buscar?q=tienda")).status, 403);
});

test("el mensajero pone el remitente de su guía nueva y toma la tarifa del cliente", async () => {
  const g = (await mensajero.post("/api/pedidos").send({})).body.pedido.guia;
  assert.equal((await otroMensajero.patch(`/api/pedidos/${g}/remitente`).send({ clienteId: c1.id })).status, 404);
  assert.equal((await mensajero.patch(`/api/pedidos/${g}/remitente`).send({ clienteId: "no-existe" })).status, 400);
  const r = await mensajero.patch(`/api/pedidos/${g}/remitente`).send({ clienteId: c1.id });
  assert.equal(r.status, 200);
  assert.equal(r.body.pedido.clienteId, c1.id);
  assert.equal(r.body.pedido.clienteNombre, "Tienda Uno");
  assert.equal(r.body.pedido.valorServicio, 8000);
  // Repetir el mismo no falla; cambiarlo ya es de la oficina.
  assert.equal((await mensajero.patch(`/api/pedidos/${g}/remitente`).send({ clienteId: c1.id })).status, 200);
  const otro = await mensajero.patch(`/api/pedidos/${g}/remitente`).send({ clienteId: c2.id });
  assert.equal(otro.status, 409);
  assert.equal((await admin.patch(`/api/pedidos/${g}`).send({ clienteId: c2.id })).status, 200);
});

test("la oficina usa su propia ruta y una guía cerrada ya no cambia", async () => {
  const g = (await mensajero.post("/api/pedidos").send({})).body.pedido.guia;
  assert.equal((await admin.patch(`/api/pedidos/${g}/remitente`).send({ clienteId: c1.id })).status, 403);
  await mensajero.post(`/api/pedidos/${g}/no-entregado`).send({ motivo: "no_contesta" });
  const r = await mensajero.patch(`/api/pedidos/${g}/remitente`).send({ clienteId: c1.id });
  assert.equal(r.status, 409);
});
