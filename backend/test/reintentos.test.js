/* Devoluciones: dónde queda el paquete y el reintento como guía nueva enlazada. */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { pool, reiniciarBase, crearCuenta, sesion } from "./ayuda.js";

let oficina, carlos, diana, cliente, otroCliente, idCarlos, idDiana, idCliente;

/** Una guía de Carlos, del cliente, con domicilio y valor a cobrar. */
async function guiaDevuelta(motivo = "no_contesta") {
  const g = (await carlos.post("/api/pedidos").send({})).body.pedido.guia;
  await oficina.patch(`/api/pedidos/${g}`).send({ clienteId: idCliente, valorServicio: 8000, aCobrar: 50000 });
  const r = await carlos.post(`/api/pedidos/${g}/no-entregado`).send({ motivo, nota: "" });
  assert.equal(r.status, 200);
  return g;
}
const ver = async (s, g) => (await s.get(`/api/pedidos/${g}`)).body.pedido;

before(async () => {
  await reiniciarBase();
  await crearCuenta({ email: "admin@js.co", rol: "admin" });
  oficina = await sesion("admin@js.co");
  idCarlos = (await oficina.post("/api/mensajeros").send({ nombre: "Carlos" })).body.mensajero.id;
  idDiana = (await oficina.post("/api/mensajeros").send({ nombre: "Diana" })).body.mensajero.id;
  await crearCuenta({ email: "carlos@js.co", rol: "mensajero", mensajeroId: idCarlos });
  await crearCuenta({ email: "diana@js.co", rol: "mensajero", mensajeroId: idDiana });
  carlos = await sesion("carlos@js.co");
  diana = await sesion("diana@js.co");
  idCliente = (await oficina.post("/api/clientes").send({ nombre: "Tienda Luna", telefono: "3001112233", tarifa: 8000 })).body.cliente.id;
  const idOtro = (await oficina.post("/api/clientes").send({ nombre: "Otra Tienda", telefono: "3004445566", tarifa: 9000 })).body.cliente.id;
  await crearCuenta({ email: "luna@js.co", rol: "cliente", clienteId: idCliente });
  await crearCuenta({ email: "otra@js.co", rol: "cliente", clienteId: idOtro });
  cliente = await sesion("luna@js.co");
  otroCliente = await sesion("otra@js.co");
});
after(() => pool.end());

test("un devuelto nuevo queda por definir y el cobro de la devolución no cambia", async () => {
  const g = await guiaDevuelta();
  const p = await ver(carlos, g);
  assert.equal(p.estado, "devuelto");
  assert.equal(p.destinoDev, "por_definir");
  assert.equal(p.cobrarDev, true);
  assert.deepEqual(p.reintentos, []);
});

test("el mensajero dice una vez dónde quedó el paquete; la oficina lo puede corregir", async () => {
  const g = await guiaDevuelta();
  assert.equal((await diana.post(`/api/pedidos/${g}/destino-devolucion`).send({ destino: "oficina" })).status, 404); // no es suya
  assert.equal((await carlos.post(`/api/pedidos/${g}/destino-devolucion`).send({ destino: "x" })).status, 400);
  const r = await carlos.post(`/api/pedidos/${g}/destino-devolucion`).send({ destino: "oficina" });
  assert.equal(r.body.pedido.destinoDev, "oficina");
  assert.equal((await carlos.post(`/api/pedidos/${g}/destino-devolucion`).send({ destino: "cliente" })).status, 409);
  assert.equal((await oficina.post(`/api/pedidos/${g}/destino-devolucion`).send({ destino: "cliente" })).body.pedido.destinoDev, "cliente");
});

test("el mensajero hace el reintento él mismo: guía nueva en ruta, enlazada, con los mismos valores", async () => {
  const g = await guiaDevuelta();
  const r = await carlos.post(`/api/pedidos/${g}/reintento`).send({});
  assert.equal(r.status, 201);
  const n = r.body.reintento;
  assert.equal(n.estado, "pendiente");
  assert.equal(n.reintentoDe, g);
  assert.equal(n.mensajeroId, idCarlos);
  assert.equal(n.clienteId, idCliente);
  assert.equal(n.valorServicio, 8000);
  assert.equal(n.aCobrar, 50000);
  const o = await ver(carlos, g);
  assert.equal(o.estado, "devuelto");           // la original conserva su devolución y su cobro
  assert.equal(o.cobrarDev, true);
  assert.equal(o.destinoDev, "reintento");
  assert.deepEqual(o.reintentos, [{ guia: n.guia, estado: "pendiente" }]);
  assert.equal((await carlos.post(`/api/pedidos/${g}/reintento`).send({})).status, 409); // un solo reintento por guía
  // la nueva se entrega normal
  const e = await carlos.post(`/api/pedidos/${n.guia}/entrega`).send({ destinatario: "Pedro", metodo: "efectivo", valorCobrado: 50000 });
  assert.equal(e.status, 200);
  assert.equal(e.body.pedido.estado, "entregado");
});

test("administración asigna el reintento: con el cliente nace por recoger, en la oficina nace en ruta", async () => {
  const g1 = await guiaDevuelta(), g2 = await guiaDevuelta();
  // sin decir dónde está el paquete no se puede
  assert.equal((await oficina.post(`/api/pedidos/${g1}/reintento`).send({ mensajeroId: idDiana })).status, 409);
  await carlos.post(`/api/pedidos/${g1}/destino-devolucion`).send({ destino: "cliente" });
  await carlos.post(`/api/pedidos/${g2}/destino-devolucion`).send({ destino: "oficina" });
  assert.equal((await oficina.post(`/api/pedidos/${g1}/reintento`).send({})).status, 400); // falta el mensajero
  const a = await oficina.post(`/api/pedidos/${g1}/reintento`).send({ mensajeroId: idDiana });
  assert.equal(a.body.reintento.estado, "aceptado");
  assert.equal(a.body.reintento.mensajeroId, idDiana);
  const b = await oficina.post(`/api/pedidos/${g2}/reintento`).send({ mensajeroId: idDiana });
  assert.equal(b.body.reintento.estado, "pendiente");
  // el mensajero no asigna reintentos cuando el paquete ya no está con él
  const g3 = await guiaDevuelta();
  await carlos.post(`/api/pedidos/${g3}/destino-devolucion`).send({ destino: "oficina" });
  assert.equal((await carlos.post(`/api/pedidos/${g3}/reintento`).send({})).status, 409);
});

test("el cliente pide el reintento: queda anotado, la oficina lo asigna y solo ve lo suyo", async () => {
  const g = await guiaDevuelta();
  assert.equal((await cliente.post(`/api/pedidos/${g}/pedir-reintento`).send({})).status, 409); // el mensajero aún no dice dónde está
  await carlos.post(`/api/pedidos/${g}/destino-devolucion`).send({ destino: "cliente" });
  assert.equal((await otroCliente.post(`/api/pedidos/${g}/pedir-reintento`).send({})).status, 404);
  assert.equal((await carlos.post(`/api/pedidos/${g}/pedir-reintento`).send({})).status, 403);
  const r = await cliente.post(`/api/pedidos/${g}/pedir-reintento`).send({});
  assert.equal(r.status, 200);
  assert.ok(r.body.pedido.reintentoPedido);
  const n = await oficina.post(`/api/pedidos/${g}/reintento`).send({ mensajeroId: idDiana });
  assert.equal(n.body.pedido.reintentoPedido ?? null, null); // la petición quedó atendida
  assert.equal((await ver(cliente, n.body.reintento.guia)).reintentoDe, g);
});

test("un devuelto con reintento no se reabre, y un devuelto de antes del cambio no entra al flujo del mensajero", async () => {
  const g = await guiaDevuelta();
  await carlos.post(`/api/pedidos/${g}/reintento`).send({});
  assert.equal((await oficina.post(`/api/pedidos/${g}/reabrir`).send({})).status, 409);
  const v = await guiaDevuelta();
  await pool.query(`UPDATE pedidos SET destino_dev = '' WHERE guia = $1`, [v]);
  assert.equal((await carlos.post(`/api/pedidos/${v}/reintento`).send({})).status, 409);
  assert.equal((await oficina.post(`/api/pedidos/${v}/destino-devolucion`).send({ destino: "oficina" })).status, 200);
});
