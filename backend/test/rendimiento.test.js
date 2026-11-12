/* Rendimiento sin cambiar respuestas: compresión, columnas de las listas, conteo y página en paralelo, pedazos de 1000 y sinMini. */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { pool, reiniciarBase, crearCuenta, sesion } from "./ayuda.js";
import { paginaEnParalelo } from "../helpers/sql.js";

let admin, m1;

before(async () => {
  await reiniciarBase();
  await crearCuenta({ email: "admin@js.co", rol: "admin" });
  admin = await sesion("admin@js.co");
  m1 = (await admin.post("/api/mensajeros").send({ nombre: "Carlos" })).body.mensajero;
  for (let i = 1; i <= 30; i++) assert.equal((await admin.post("/api/pedidos").send({ mensajeroId: m1.id, valorServicio: 8000 })).status, 201);
});
after(() => pool.end());

test("las respuestas grandes salen comprimidas cuando el navegador lo acepta", async () => {
  const r = await admin.get("/api/pedidos?limite=100").set("Accept-Encoding", "gzip");
  assert.equal(r.status, 200);
  assert.equal(r.headers["content-encoding"], "gzip");
  assert.equal(r.body.pedidos.length, 30);
});

test("los avisos en tiempo real no se comprimen", async () => {
  const r = await admin.get("/api/eventos").set("Accept", "text/event-stream").set("Accept-Encoding", "gzip")
    .buffer(false).parse((res, cb) => { res.once("data", () => { res.destroy(); cb(null, null); }); });
  assert.equal(r.status, 200);
  assert.equal(r.headers["content-encoding"], undefined);
});

test("la lista no trae las columnas de control interno; el detalle sí", async () => {
  const lista = await admin.get("/api/pedidos?limite=5");
  const p = lista.body.pedidos[0];
  for (const k of ["guia", "n", "estado", "creado", "mensajeroId", "valorServicio", "intentos", "reintentos", "mini"]) assert.ok(k in p, k);
  for (const k of ["creadoPor", "entregoUid", "cambioConfirmo", "fotosBorradas", "actualizado"]) assert.ok(!(k in p), k);
  const det = await admin.get(`/api/pedidos/${p.guia}`);
  assert.ok("creadoPor" in det.body.pedido);
});

test("la carga completa acepta pedazos de hasta 1000 y sinMini no firma miniaturas", async () => {
  const r = await admin.get("/api/pedidos?limite=1000&sinMini=true");
  assert.equal(r.status, 200);
  assert.equal(r.body.pedidos.length, 30);
  assert.equal(r.body.siguiente, null);
  assert.ok(r.body.pedidos.every(p => p.mini === null && !("miniRuta" in p)));
  assert.equal((await admin.get("/api/pedidos?limite=1001")).status, 400);
});

test("el paginador sigue devolviendo la última página si se pide una que no existe", async () => {
  const r = await admin.get("/api/pedidos?pagina=99&porPagina=20");
  assert.equal(r.status, 200);
  assert.deepEqual([r.body.pagina, r.body.paginas, r.body.total, r.body.pedidos.length], [2, 2, 30, 10]);
});

test("paginaEnParalelo: cuenta y trae a la vez, y repite solo si la página no existe", async () => {
  const filas = [...Array(23).keys()];
  let viajes = 0;
  const traer = async offset => { viajes++; return filas.slice(offset, offset + 10); };
  const a = await paginaEnParalelo({ contar: async () => 23, traer, pagina: 2, porPagina: 10 });
  assert.deepEqual([a.pagina, a.paginas, a.total, a.filas[0], viajes], [2, 3, 23, 10, 1]);
  viajes = 0;
  const b = await paginaEnParalelo({ contar: async () => 23, traer, pagina: 9, porPagina: 10 });
  assert.deepEqual([b.pagina, b.filas.length, viajes], [3, 3, 2]);
  const c = await paginaEnParalelo({ contar: async () => 0, traer, pagina: 1, porPagina: 10 });
  assert.deepEqual([c.pagina, c.paginas, c.total], [1, 1, 0]);
});
