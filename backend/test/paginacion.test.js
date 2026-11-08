/* Paginador de pedidos: el servidor filtra, cuenta y corta por páginas; cada rol ve solo lo suyo. */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { pool, reiniciarBase, crearCuenta, sesion } from "./ayuda.js";

let admin, mensajero, cliente, m1, m2, c1;

before(async () => {
  await reiniciarBase();
  await crearCuenta({ email: "admin@js.co", rol: "admin" });
  admin = await sesion("admin@js.co");
  m1 = (await admin.post("/api/mensajeros").send({ nombre: "Carlos" })).body.mensajero;
  m2 = (await admin.post("/api/mensajeros").send({ nombre: "Diana" })).body.mensajero;
  c1 = (await admin.post("/api/clientes").send({ nombre: "Tienda Luna", telefono: "3001112233", tarifa: 8000 })).body.cliente;
  await crearCuenta({ email: "carlos@js.co", rol: "mensajero", mensajeroId: m1.id });
  await crearCuenta({ email: "luna@js.co", rol: "cliente", clienteId: c1.id });
  mensajero = await sesion("carlos@js.co");
  cliente = await sesion("luna@js.co");

  // 25 guías: las 1 a 17 de Carlos y las 18 a 25 de Diana. Las impares tienen remitente (Tienda Luna).
  for (let i = 1; i <= 25; i++) {
    const r = await admin.post("/api/pedidos").send({ mensajeroId: i <= 17 ? m1.id : m2.id, clienteId: i % 2 ? c1.id : null, valorServicio: 8000 });
    assert.equal(r.status, 201);
  }
  // Estados para los filtros (directo en la base: aquí solo se prueba la lista).
  await pool.query(`UPDATE pedidos SET estado = 'entregado', entregado = now(), destinatario = 'Ana Ríos', valor_servicio = 0 WHERE n = 1`);
  await pool.query(`UPDATE pedidos SET estado = 'entregado', entregado = now(), destinatario = 'Beto', cambio = true WHERE n = 3`);
  await pool.query(`UPDATE pedidos SET estado = 'entregado', entregado = now(), dif_cobro = -5000 WHERE n = 5`);
  await pool.query(`UPDATE pedidos SET estado = 'entregado', entregado = now(), dif_cobro = 2000, dif_revisada = true WHERE n = 7`);
  await pool.query(`UPDATE pedidos SET estado = 'devuelto', entregado = now() WHERE n = 9`);
  // Una guía que salió hace 3 días y se entregó hoy, y otra que salió y se cerró hace 3 días.
  await pool.query(`UPDATE pedidos SET creado = now() - interval '3 days' WHERE n IN (11, 13)`);
  await pool.query(`UPDATE pedidos SET estado = 'entregado', entregado = now() WHERE n = 11`);
  await pool.query(`UPDATE pedidos SET estado = 'entregado', entregado = now() - interval '3 days' + interval '1 hour' WHERE n = 13`);
});
after(() => pool.end());

const guias = r => r.body.pedidos.map(p => p.n);
const diaColombia = (ms = Date.now()) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "America/Bogota", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(ms));

test("paginador: 20 por página en el computador, con total y páginas", async () => {
  const p1 = await admin.get("/api/pedidos?pagina=1&porPagina=20");
  assert.equal(p1.status, 200);
  assert.equal(p1.body.pedidos.length, 20);
  assert.deepEqual([p1.body.pagina, p1.body.porPagina, p1.body.total, p1.body.paginas], [1, 20, 25, 2]);
  assert.equal(p1.body.pedidos[0].n, 25); // del más nuevo al más viejo
  const p2 = await admin.get("/api/pedidos?pagina=2&porPagina=20");
  assert.deepEqual(guias(p2), [5, 4, 3, 2, 1]);
});

test("paginador: 8 por página en el celular, sin repetir ni saltar guías", async () => {
  const vistas = [];
  for (let pagina = 1; pagina <= 4; pagina++) {
    const r = await admin.get(`/api/pedidos?pagina=${pagina}&porPagina=8`);
    assert.equal(r.body.paginas, 4);
    vistas.push(...guias(r));
  }
  assert.deepEqual(vistas, Array.from({ length: 25 }, (_, i) => 25 - i));
});

test("paginador: una página que ya no existe devuelve la última", async () => {
  const r = await admin.get("/api/pedidos?pagina=99&porPagina=8");
  assert.equal(r.body.pagina, 4);
  assert.deepEqual(guias(r), [1]);
  const vacia = await admin.get("/api/pedidos?pagina=3&porPagina=8&buscar=no-existe");
  assert.deepEqual([vacia.body.pagina, vacia.body.total, vacia.body.paginas, vacia.body.pedidos.length], [1, 0, 1, 0]);
});

test("paginador: los filtros de la pestaña Pedidos los aplica el servidor", async () => {
  const q = async s => (await admin.get(`/api/pedidos?pagina=1&porPagina=100&${s}`)).body;
  assert.equal((await q("sinRemitente=true")).total, 12);
  assert.deepEqual((await q("estado=entregado")).pedidos.map(p => p.n), [13, 11, 7, 5, 3, 1]);
  assert.deepEqual((await q("estado=devuelto")).pedidos.map(p => p.n), [9]);
  assert.deepEqual((await q("diferencia=todas")).pedidos.map(p => p.n), [7, 5]);
  assert.deepEqual((await q("diferencia=sinRevisar")).pedidos.map(p => p.n), [5]);
  assert.deepEqual((await q("cambioPendiente=true")).pedidos.map(p => p.n), [3]);
  assert.deepEqual((await q("sinServicio=true")).pedidos.map(p => p.n), [1]);
  assert.equal((await q(`mensajeroId=${m2.id}`)).total, 8);
  // El buscador encuentra por guía, por quien recibió, por remitente y por mensajero.
  assert.deepEqual((await q("buscar=JS-00025")).pedidos.map(p => p.n), [25]);
  assert.deepEqual((await q("buscar=ana r")).pedidos.map(p => p.n), [1]);
  assert.equal((await q("buscar=luna")).total, 13);
  assert.equal((await q("buscar=diana")).total, 8);
  assert.equal((await q("buscar=100%25")).total, 0); // el % se busca como texto, no como comodín
  // Por día (hora de Colombia): salió o se cerró ese día.
  const hoy = (await q(`dia=${diaColombia()}`)).pedidos.map(p => p.n);
  assert.ok(hoy.includes(11) && !hoy.includes(13));
  const antes = (await q(`dia=${diaColombia(Date.now() - 3 * 864e5)}`)).pedidos.map(p => p.n);
  assert.deepEqual(antes, [13, 11]);
});

test("paginador: cada rol ve solo lo suyo, aunque pida otro filtro", async () => {
  const m = await mensajero.get(`/api/pedidos?pagina=1&porPagina=8&mensajeroId=${m2.id}`);
  assert.equal(m.body.total, 17);
  assert.ok(m.body.pedidos.every(p => p.mensajeroId === m1.id));
  const c = await cliente.get("/api/pedidos?pagina=2&porPagina=8&sinRemitente=true");
  assert.equal(c.body.total, 0);
  const todos = await cliente.get("/api/pedidos?pagina=1&porPagina=20");
  assert.equal(todos.body.total, 13);
  assert.ok(todos.body.pedidos.every(p => p.clienteId === c1.id));
});

test("paginador: rechaza valores inválidos y deja igual la lista por cursor", async () => {
  for (const s of ["pagina=0", "pagina=1&porPagina=500", "pagina=abc", "pagina=1&cursor=5", "dia=2026-13-40", "diferencia=x"])
    assert.equal((await admin.get(`/api/pedidos?${s}`)).status, 400, s);
  const r = await admin.get("/api/pedidos?limite=10");
  assert.equal(r.body.pedidos.length, 10);
  assert.equal(r.body.siguiente, 16);
  assert.equal(r.body.total, undefined);
});
