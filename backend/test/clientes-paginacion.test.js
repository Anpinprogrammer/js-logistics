/* Clientes: paginación del servidor para la pestaña Clientes (20 en computador, 8 en celular). */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { pool, reiniciarBase, crearCuenta, sesion } from "./ayuda.js";

let admin, mensajero;
const clientes = [];

const diaColombia = (ms = Date.now()) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "America/Bogota", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(ms));

before(async () => {
  await reiniciarBase();
  await crearCuenta({ email: "admin@js.co", rol: "admin" });
  admin = await sesion("admin@js.co");

  const m = (await admin.post("/api/mensajeros").send({ nombre: "Carlos" })).body.mensajero;
  await crearCuenta({ email: "carlos@js.co", rol: "mensajero", mensajeroId: m.id });
  mensajero = await sesion("carlos@js.co");

  for (let i = 1; i <= 25; i++) {
    const r = await admin.post("/api/clientes").send({
      nombre: i === 1 ? "María Ñandú" : `Cliente ${String(i).padStart(2, "0")}`,
      telefono: `30000000${String(i).padStart(2, "0")}`,
      tarifa: 0
    });
    assert.equal(r.status, 201, JSON.stringify(r.body));
    clientes.push(r.body.cliente);
  }

  // Saldos para probar los filtros: María queda debiendo y el Cliente 02 a favor.
  assert.equal((await admin.post("/api/movimientos").send({
    clienteId: clientes[0].id, tipo: "cargo", valor: 50000, medio: "efectivo"
  })).status, 201);
  assert.equal((await admin.post("/api/movimientos").send({
    clienteId: clientes[1].id, tipo: "pago_de_cliente", valor: 30000, medio: "efectivo"
  })).status, 201);
});

after(() => pool.end());

test("clientes: 20 por página en el computador, con total y páginas", async () => {
  const p1 = await admin.get("/api/clientes/saldos?pagina=1&porPagina=20");
  assert.equal(p1.status, 200);
  assert.equal(p1.body.clientes.length, 20);
  assert.deepEqual(
    [p1.body.pagina, p1.body.porPagina, p1.body.total, p1.body.paginas, p1.body.totalClientes],
    [1, 20, 25, 2, 25]
  );
  const p2 = await admin.get("/api/clientes/saldos?pagina=2&porPagina=20");
  assert.equal(p2.body.clientes.length, 5);
  assert.deepEqual([p2.body.pagina, p2.body.paginas], [2, 2]);
});

test("clientes: 8 por página en el celular, sin repetir ni saltar", async () => {
  const vistos = [];
  for (let pagina = 1; pagina <= 4; pagina++) {
    const r = await admin.get(`/api/clientes/saldos?pagina=${pagina}&porPagina=8`);
    assert.equal(r.body.paginas, 4);
    vistos.push(...r.body.clientes.map(c => c.id));
  }
  assert.equal(vistos.length, 25);
  assert.equal(new Set(vistos).size, 25);
});

test("clientes: una página que ya no existe devuelve la última", async () => {
  const r = await admin.get("/api/clientes/saldos?pagina=99&porPagina=8");
  assert.deepEqual([r.body.pagina, r.body.paginas, r.body.clientes.length], [4, 4, 1]);
  const vacia = await admin.get("/api/clientes/saldos?pagina=3&porPagina=8&buscar=no-existe");
  assert.deepEqual([vacia.body.pagina, vacia.body.total, vacia.body.paginas, vacia.body.clientes.length], [1, 0, 1, 0]);
});

test("clientes: la búsqueda la aplica el servidor por nombre o número", async () => {
  const q = async s => (await admin.get(`/api/clientes/saldos?pagina=1&porPagina=8&${s}`)).body;
  assert.equal((await q("buscar=maria")).total, 1);
  assert.equal((await q("buscar=3000000001")).total, 1);
  assert.equal((await q("buscar=cliente 07")).total, 1);
  assert.equal((await q("buscar=no-existe")).total, 0);
});

test("clientes: los filtros por cobrar/pagar y por día usan los saldos del servidor", async () => {
  const cobrar = await admin.get("/api/clientes/saldos?pagina=1&porPagina=20&filtro=cobrar");
  assert.deepEqual([cobrar.body.total, cobrar.body.porCobrar.clientes, cobrar.body.porCobrar.total], [1, 1, 50000]);
  assert.equal(cobrar.body.clientes[0].nombre, "María Ñandú");
  assert.equal(cobrar.body.clientes[0].saldo, -50000);

  const pagar = await admin.get("/api/clientes/saldos?pagina=1&porPagina=20&filtro=pagar");
  assert.deepEqual([pagar.body.total, pagar.body.porPagar.clientes, pagar.body.porPagar.total], [1, 1, 30000]);
  assert.equal(pagar.body.clientes[0].nombre, "Cliente 02");
  assert.equal(pagar.body.clientes[0].saldo, 30000);

  const dia = await admin.get(`/api/clientes/saldos?pagina=1&porPagina=20&dia=${diaColombia()}`);
  assert.equal(dia.body.total, 2);
  assert.ok(dia.body.clientes.every(c => typeof c.delDia === "number" && c.delDia !== 0));
});

test("clientes: sin pagina ni porPagina sigue devolviendo la lista completa", async () => {
  const r = await admin.get("/api/clientes/saldos");
  assert.equal(r.status, 200);
  assert.equal(r.body.clientes.length, 25);
  assert.equal(r.body.totalClientes, 25);
  assert.equal(r.body.pagina, undefined);
  assert.equal(r.body.paginas, undefined);
});

test("clientes: solo la oficina puede ver la lista y se rechazan tamaños inválidos", async () => {
  const m = await mensajero.get("/api/clientes/saldos?pagina=1&porPagina=8");
  assert.equal(m.status, 403);
  assert.equal((await admin.get("/api/clientes/saldos?porPagina=200")).status, 400);
  assert.equal((await admin.get("/api/clientes/saldos?pagina=0")).status, 400);
  assert.equal((await admin.get("/api/clientes/saldos?filtro=otro")).status, 400);
});
