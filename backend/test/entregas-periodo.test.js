/* Mi caja → Entregas del período: página de entregas del mensajero con búsqueda y filtro por método.
   Las cifras del período (GET /mensajeros/:id/periodo) no dependen de la página ni de los filtros. */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { pool, reiniciarBase, crearCuenta, sesion } from "./ayuda.js";

let admin, mensajero, otro, idM, idOtro, idCliente, guias = [];

before(async () => {
  await reiniciarBase();
  await crearCuenta({ email: "admin@js.co", rol: "admin" });
  admin = await sesion("admin@js.co");
  idM = (await admin.post("/api/mensajeros").send({ nombre: "Carlos Moto" })).body.mensajero.id;
  idOtro = (await admin.post("/api/mensajeros").send({ nombre: "Otro Moto" })).body.mensajero.id;
  await crearCuenta({ email: "m@js.co", rol: "mensajero", mensajeroId: idM });
  await crearCuenta({ email: "m2@js.co", rol: "mensajero", mensajeroId: idOtro });
  mensajero = await sesion("m@js.co");
  otro = await sesion("m2@js.co");
  idCliente = (await admin.post("/api/clientes").send({ nombre: "Panadería", telefono: "3001112233", tarifa: 8000 })).body.cliente.id;
  const nombres = ["Ana Pérez", "Luis 100%_x", "Marta Gómez", "Pedro Ríos", "Sofía Luna", "Juan Mora", "Rosa Díaz"];
  for (const [i, n] of nombres.entries()) {
    const g = (await admin.post("/api/pedidos").send({ mensajeroId: idM, clienteId: idCliente, valorServicio: 8000, aCobrar: 10000 })).body.pedido.guia;
    guias.push(g);
    const metodo = i % 2 ? "transf_cliente" : "efectivo";
    const e = await mensajero.post(`/api/pedidos/${g}/entrega`).send({ destinatario: n, valorCobrado: 10000, metodo });
    assert.equal(e.status, 200);
  }
});
after(() => pool.end());

const url = (q = "") => `/api/mensajeros/${idM}/periodo/entregas${q}`;

test("pagina de a 5, lo más nuevo primero, con el total y las páginas", async () => {
  const r = await mensajero.get(url("?porPagina=5&pagina=1"));
  assert.equal(r.status, 200);
  assert.equal(r.body.total, 7);
  assert.equal(r.body.paginas, 2);
  assert.equal(r.body.entregas.length, 5);
  assert.equal(r.body.entregas[0].destinatario, "Rosa Díaz");
  const r2 = await mensajero.get(url("?porPagina=5&pagina=2"));
  assert.equal(r2.body.entregas.length, 2);
  assert.equal(r2.body.totales.cobrado, 70000);
});

test("busca por guía o por quien recibió, y filtra por método", async () => {
  const a = await mensajero.get(url("?buscar=marta"));
  assert.deepEqual(a.body.entregas.map(x => x.destinatario), ["Marta Gómez"]);
  const g = await mensajero.get(url(`?buscar=${guias[0]}`));
  assert.equal(g.body.total, 1);
  assert.equal((await mensajero.get(url("?buscar=%25"))).body.total, 1); // el % no es comodín
  assert.equal((await mensajero.get(url("?metodo=transf_cliente"))).body.total, 3);
  assert.equal((await mensajero.get(url("?metodo=efectivo"))).body.total, 4);
  assert.equal((await mensajero.get(url("?metodo=devuelto"))).body.total, 0);
});

test("las cifras del período no cambian con los filtros", async () => {
  const p = (await mensajero.get(`/api/mensajeros/${idM}/periodo`)).body.periodo;
  const con = (await mensajero.get(`/api/mensajeros/${idM}/periodo?buscar=ana`)).body.periodo;
  assert.deepEqual(con, p);
  assert.ok(Object.keys(p).length > 3);
});

test("otro mensajero no ve las entregas, y los datos inválidos se rechazan", async () => {
  assert.equal((await otro.get(url())).status, 403);
  assert.equal((await mensajero.get(url("?metodo=nequi"))).status, 400);
  assert.equal((await mensajero.get(url("?porPagina=500"))).status, 400);
  assert.equal((await admin.get(url("?porPagina=3"))).body.entregas.length, 3);
});
