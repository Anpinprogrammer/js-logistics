import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { pool, reiniciarBase, crearCuenta, sesion } from "./ayuda.js";

let admin, asistente, mensajero, otroMensajero, cliente, m1, m2, c1;

before(async () => {
  await reiniciarBase();
  await crearCuenta({ email: "admin@js.co", rol: "admin" });
  await crearCuenta({ email: "asis@js.co", rol: "asistente" });
  admin = await sesion("admin@js.co");
  asistente = await sesion("asis@js.co");

  m1 = (await admin.post("/api/mensajeros").send({ nombre: "Carlos" })).body.mensajero;
  m2 = (await admin.post("/api/mensajeros").send({ nombre: "Diana" })).body.mensajero;
  c1 = (await asistente.post("/api/clientes").send({ nombre: "Tienda Uno", telefono: "300 123 4567", tarifa: 8000 })).body.cliente;

  await crearCuenta({ email: "carlos@js.co", rol: "mensajero", mensajeroId: m1.id });
  await crearCuenta({ email: "diana@js.co", rol: "mensajero", mensajeroId: m2.id });
  await crearCuenta({ email: "tienda@js.co", rol: "cliente", clienteId: c1.id });
  mensajero = await sesion("carlos@js.co");
  otroMensajero = await sesion("diana@js.co");
  cliente = await sesion("tienda@js.co");
});
after(() => pool.end());

test("clientes: avisa de repetidos por teléfono y deja crearlo si se confirma", async () => {
  const r = await asistente.post("/api/clientes").send({ nombre: "Otra", telefono: "+57 3001234567" });
  assert.equal(r.status, 409);
  assert.equal(r.body.error.code, "POSIBLE_REPETIDO");
  const ok = await asistente.post("/api/clientes").send({ nombre: "Otra", telefono: "+57 3001234567", confirmarRepetido: true });
  assert.equal(ok.status, 201);
});

test("el mensajero crea guías consecutivas, a su nombre y en cero", async () => {
  const a = await mensajero.post("/api/pedidos").send({ valorServicio: 99999, mensajeroId: m2.id, clienteId: c1.id });
  assert.equal(a.status, 201);
  assert.equal(a.body.pedido.guia, "JS-00001");
  assert.equal(a.body.pedido.mensajeroId, m1.id);
  assert.equal(a.body.pedido.valorServicio, 0);
  assert.equal(a.body.pedido.clienteId, null);
  const b = await mensajero.post("/api/pedidos").send({});
  assert.equal(b.body.pedido.guia, "JS-00002");
});

test("guías creadas a la vez no repiten número", async () => {
  const rs = await Promise.all(Array.from({ length: 8 }, () => mensajero.post("/api/pedidos").send({})));
  const guias = rs.map(r => r.body.pedido.guia);
  assert.equal(new Set(guias).size, 8);
});

test("la oficina asigna remitente y valores; el mensajero no puede", async () => {
  const no = await mensajero.patch("/api/pedidos/JS-00001").send({ clienteId: c1.id });
  assert.equal(no.status, 403);
  const r = await asistente.patch("/api/pedidos/JS-00001").send({ clienteId: c1.id, valorServicio: 8000, aCobrar: 50000 });
  assert.equal(r.status, 200);
  assert.equal(r.body.pedido.clienteNombre, "Tienda Uno");
  assert.equal(r.body.pedido.aCobrar, 50000);
});

test("cada quien ve solo lo suyo", async () => {
  const deDiana = await otroMensajero.get("/api/pedidos");
  assert.equal(deDiana.body.pedidos.length, 0);
  assert.equal((await otroMensajero.get("/api/pedidos/JS-00001")).status, 404);
  const delCliente = await cliente.get("/api/pedidos");
  assert.deepEqual(delCliente.body.pedidos.map(p => p.guia), ["JS-00001"]);
  assert.equal((await cliente.get("/api/clientes")).status, 403);
  assert.equal((await cliente.get(`/api/clientes/${c1.id}`)).status, 200);
});

test("entrega: el servidor calcula la diferencia y no deja entregar dos veces", async () => {
  assert.equal((await otroMensajero.post("/api/pedidos/JS-00001/entrega").send({ destinatario: "X", valorCobrado: 1, metodo: "efectivo" })).status, 404);
  const r = await mensajero.post("/api/pedidos/JS-00001/entrega")
    .send({ destinatario: "Ana", valorCobrado: 45000, metodo: "efectivo", difCobro: 0, estado: "pendiente" });
  assert.equal(r.status, 200);
  assert.equal(r.body.pedido.estado, "entregado");
  assert.equal(r.body.pedido.difCobro, -5000); // debía cobrar 50.000
  const otra = await mensajero.post("/api/pedidos/JS-00001/entrega").send({ destinatario: "Ana", valorCobrado: 50000, metodo: "efectivo" });
  assert.equal(otra.status, 409);
});

test("transferencia a JS exige la cuenta", async () => {
  const r = await mensajero.post("/api/pedidos/JS-00002/entrega").send({ destinatario: "Ana", valorCobrado: 0, metodo: "transf_js" });
  assert.equal(r.status, 400);
});

test("corrección del mensajero recalcula la diferencia", async () => {
  const r = await mensajero.patch("/api/pedidos/JS-00001/correccion").send({ valorCobrado: 50000 });
  assert.equal(r.status, 200);
  assert.equal(r.body.pedido.difCobro, 0);
});

test("reprogramar deja la guía en ruta; otro motivo la devuelve", async () => {
  const rep = await mensajero.post("/api/pedidos/JS-00002/no-entregado").send({ motivo: "reprogramar" });
  assert.equal(rep.body.pedido.estado, "pendiente");
  assert.equal(rep.body.pedido.intentos.length, 1);
  const sinNota = await mensajero.post("/api/pedidos/JS-00002/no-entregado").send({ motivo: "otro" });
  assert.equal(sinNota.status, 400);
  const dev = await mensajero.post("/api/pedidos/JS-00002/no-entregado").send({ motivo: "no_contesta", nota: "3 llamadas" });
  assert.equal(dev.body.pedido.estado, "devuelto");
  assert.equal(dev.body.pedido.metodo, "devuelto");
  assert.equal(dev.body.pedido.intentos.length, 2);
});

test("solo administración corrige lo cobrado y borra", async () => {
  assert.equal((await asistente.patch("/api/pedidos/JS-00001").send({ valorCobrado: 1 })).status, 403);
  const r = await admin.patch("/api/pedidos/JS-00001").send({ valorCobrado: 60000 });
  assert.equal(r.body.pedido.difCobro, 10000);
  assert.equal(r.body.pedido.difRevisada, false);
  assert.equal((await asistente.delete("/api/pedidos/JS-00003")).status, 403);
  assert.equal((await admin.delete("/api/pedidos/JS-00003")).status, 204);
  const { rows } = await pool.query(`SELECT tabla, registro FROM papelera`);
  assert.deepEqual(rows, [{ tabla: "pedidos", registro: "JS-00003" }]);
});

test("las cuentas: solo administración, y nadie se cambia su propio rol", async () => {
  assert.equal((await asistente.get("/api/usuarios")).status, 403);
  const yo = (await admin.get("/api/auth/yo")).body.usuario;
  assert.equal((await admin.patch(`/api/usuarios/${yo.id}`).send({ rol: "asistente" })).status, 403);
});

test("si administración cambia el rol, la sesión abierta deja de servir", async () => {
  await crearCuenta({ email: "temp@js.co", rol: "asistente" });
  const temp = await sesion("temp@js.co");
  const lista = (await admin.get("/api/usuarios")).body.usuarios;
  const id = lista.find(u => u.email === "temp@js.co").id;
  await admin.patch(`/api/usuarios/${id}`).send({ rol: "admin" });
  assert.equal((await temp.get("/api/usuarios")).status, 401);
});

test("movimientos: el cliente ve los suyos y no los de otro", async () => {
  await pool.query(`INSERT INTO movimientos (id, cliente_id, tipo, valor, medio) VALUES ('mv1', $1, 'pago_de_cliente', 20000, 'nequi')`, [c1.id]);
  const r = await cliente.get(`/api/clientes/${c1.id}/movimientos`);
  assert.equal(r.status, 200);
  assert.deepEqual(r.body.movimientos.map(m => [m.id, m.valor, m.medio]), [["mv1", 20000, "nequi"]]);
  const otro = (await asistente.post("/api/clientes").send({ nombre: "Ajeno", confirmarRepetido: true })).body.cliente;
  assert.equal((await cliente.get(`/api/clientes/${otro.id}/movimientos`)).status, 403);
});

test("archivos y miniatura: sin Storage configurado salen vacíos, y la ruta interna no se expone", async () => {
  await pool.query(`INSERT INTO pedido_archivos (guia, tipo, ruta) VALUES ('JS-00001', 'mini', 'JS-00001/mini.jpg')`);
  const p = (await cliente.get("/api/pedidos/JS-00001")).body.pedido;
  assert.equal(p.mini, null);
  assert.equal(p.miniRuta, undefined);
  const a = await cliente.get("/api/pedidos/JS-00001/archivos");
  assert.equal(a.status, 200);
  assert.deepEqual(a.body.archivos, []);
  assert.equal((await otroMensajero.get("/api/pedidos/JS-00001/archivos")).status, 404);
});
