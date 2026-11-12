/* Estado "aceptado" (por recoger), la recogida con foto del mensajero, "Mis solicitudes" del cliente y la migración
   de los datos de antes. Supabase Storage se reemplaza por un bucket en memoria para exigir la foto de salida. */
process.env.SUPABASE_URL = "https://bucket-de-prueba.supabase.co";
process.env.SUPABASE_SERVICE_ROLE_KEY = "llave-de-prueba";
process.env.STORAGE_BUCKET = "pedidos";

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const bucket = new Map();
const fetchReal = globalThis.fetch;
globalThis.fetch = async (url, op = {}) => {
  const u = new URL(url);
  if (u.host !== "bucket-de-prueba.supabase.co") return fetchReal(url, op);
  const json = (d, status = 200) => new Response(JSON.stringify(d), { status, headers: { "Content-Type": "application/json" } });
  const base = "/storage/v1/object/pedidos";
  if (u.pathname === "/storage/v1/object/sign/pedidos" && op.method === "POST")
    return json(JSON.parse(op.body).paths.map(path => ({ path, signedURL: `/object/sign/pedidos/${path}?token=t` })));
  if (u.pathname.startsWith(base + "/") && op.method === "POST") { bucket.set(u.pathname.slice(base.length + 1), true); return json({}); }
  return json([]);
};

const { pool, app, request, ORIGEN, reiniciarBase, crearCuenta, sesion } = await import("./ayuda.js");
const JPEG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(200, 1)]);

let oficina, carlos, diana, cliente, otroCliente, idCarlos, idCliente, idOtroCliente;

const pedirDesdePortal = (s, extra = {}) => s.post("/api/solicitudes/portal").send({
  nombre: "Tienda Luna", telefono: "300 111 2233", direccionRecogida: "Cra 10 # 5-20, Cali", paquetes: 1,
  destinatarioNombre: "Pedro Ruiz", direccionEntrega: "Calle 70 # 1-10, Cali", ...extra
});
const mias = async s => (await s.get("/api/solicitudes/mias")).body;
const subirSalida = (s, guia) => s.post(`/api/pedidos/${guia}/archivos/salida`).set("Content-Type", "image/jpeg").send(JPEG);

/** Pide desde el portal, la oficina la acepta con su tarifa (queda confirmada) y la asigna a Carlos. Devuelve la guía. */
async function guiaAsignada(direccionEntrega) {
  await pedirDesdePortal(cliente, { direccionEntrega });
  const s = (await mias(cliente)).solicitudes.find(x => x.direccionEntrega === direccionEntrega);
  await oficina.post(`/api/solicitudes/${s.id}/aceptar`).send({ valor: 8000 });
  const r = await oficina.post(`/api/solicitudes/${s.id}/asignar`).send({ mensajeroId: idCarlos });
  assert.equal(r.status, 200);
  return r.body.pedido.guia;
}

before(async () => {
  await reiniciarBase();
  await crearCuenta({ email: "admin@js.co", rol: "admin" });
  oficina = await sesion("admin@js.co");
  idCarlos = (await oficina.post("/api/mensajeros").send({ nombre: "Carlos" })).body.mensajero.id;
  const idDiana = (await oficina.post("/api/mensajeros").send({ nombre: "Diana" })).body.mensajero.id;
  await crearCuenta({ email: "carlos@js.co", rol: "mensajero", mensajeroId: idCarlos });
  await crearCuenta({ email: "diana@js.co", rol: "mensajero", mensajeroId: idDiana });
  carlos = await sesion("carlos@js.co");
  diana = await sesion("diana@js.co");
  idCliente = (await oficina.post("/api/clientes").send({ nombre: "Tienda Luna", telefono: "3001112233", tarifa: 8000 })).body.cliente.id;
  idOtroCliente = (await oficina.post("/api/clientes").send({ nombre: "Otra Tienda", telefono: "3004445566", tarifa: 9000 })).body.cliente.id;
  await crearCuenta({ email: "luna@js.co", rol: "cliente", clienteId: idCliente });
  await crearCuenta({ email: "otra@js.co", rol: "cliente", clienteId: idOtroCliente });
  cliente = await sesion("luna@js.co");
  otroCliente = await sesion("otra@js.co");
});
after(() => pool.end());

test("la guía de una solicitud nace aceptada (por recoger) y no se puede entregar ni devolver", async () => {
  const guia = await guiaAsignada("Calle 1 # 1-01, Cali");
  const p = (await carlos.get(`/api/pedidos/${guia}`)).body.pedido;
  assert.equal(p.estado, "aceptado");
  // El mensajero ve dónde recoger y a quién entregar
  assert.equal(p.solicitud.direccionRecogida, "Cra 10 # 5-20, Cali");
  assert.equal(p.solicitud.direccionEntrega, "Calle 1 # 1-01, Cali");
  assert.equal(p.solicitud.destinatarioNombre, "Pedro Ruiz");
  assert.equal((await carlos.post("/api/pedidos").send({})).body.pedido.solicitud, null);
  const e = await carlos.post(`/api/pedidos/${guia}/entrega`).send({ destinatario: "Pedro", valorCobrado: 0, metodo: "efectivo" });
  assert.equal(e.status, 409);
  assert.equal(e.body.error.code, "POR_RECOGER");
  const d = await carlos.post(`/api/pedidos/${guia}/no-entregado`).send({ motivo: "no_contesta" });
  assert.equal(d.body.error.code, "POR_RECOGER");
  // Filtros: aparece con estado=aceptado y no cuenta como cerrada
  assert.ok((await carlos.get("/api/pedidos?estado=aceptado")).body.pedidos.some(x => x.guia === guia));
  assert.ok(!(await oficina.get("/api/pedidos?cerrados=true")).body.pedidos.some(x => x.guia === guia));
});

test("recoger exige la foto del paquete, solo lo hace su mensajero (o la oficina) y pasa a en ruta", async () => {
  const guia = await guiaAsignada("Calle 2 # 2-02, Cali");
  // Otro mensajero: ni la ve ni la recoge (404, no 403). El cliente no recoge.
  assert.equal((await diana.post(`/api/pedidos/${guia}/recogida`)).status, 404);
  assert.equal((await subirSalida(diana, guia)).status, 404);
  assert.equal((await cliente.post(`/api/pedidos/${guia}/recogida`)).status, 403);
  assert.equal((await request(app).post(`/api/pedidos/${guia}/recogida`).set("Origin", ORIGEN).set("X-JSL", "1")).status, 401);
  // Sin foto no se recoge
  const sinFoto = await carlos.post(`/api/pedidos/${guia}/recogida`);
  assert.equal(sinFoto.status, 400);
  assert.match(sinFoto.body.error.message, /foto/);
  // Su mensajero puede subir la foto aunque todavía no esté en ruta
  assert.equal((await subirSalida(carlos, guia)).status, 201);
  const antes = (await carlos.get(`/api/pedidos/${guia}`)).body.pedido;
  const r = await carlos.post(`/api/pedidos/${guia}/recogida`);
  assert.equal(r.status, 200);
  assert.equal(r.body.pedido.estado, "pendiente");
  assert.ok(new Date(r.body.pedido.creado) >= new Date(antes.creado), "la salida queda con la hora de la recogida");
  // Dos veces no
  const otra = await carlos.post(`/api/pedidos/${guia}/recogida`);
  assert.equal(otra.status, 409);
  assert.equal(otra.body.error.code, "YA_RECOGIDO");
  // Y ya se puede devolver (las entregas con foto y firma se prueban en archivos.test.js)
  const d = await carlos.post(`/api/pedidos/${guia}/no-entregado`).send({ motivo: "direccion" });
  assert.equal(d.status, 200);
  assert.equal(d.body.pedido.estado, "devuelto");
  assert.equal((await carlos.post(`/api/pedidos/${guia}/recogida`)).body.error.code, "YA_CERRADA");
  // Queda en el historial
  const h = await pool.query(`SELECT 1 FROM historial WHERE registro = $1`, [guia]);
  assert.ok(h.rowCount > 0);
});

test("la oficina también puede recoger, y una guía en ruta normal no se 'recoge'", async () => {
  const guia = await guiaAsignada("Calle 3 # 3-03, Cali");
  await subirSalida(oficina, guia);
  assert.equal((await oficina.post(`/api/pedidos/${guia}/recogida`)).body.pedido.estado, "pendiente");
  const normal = (await carlos.post("/api/pedidos").send({})).body.pedido;
  assert.equal(normal.estado, "pendiente");
  assert.equal((await carlos.post(`/api/pedidos/${normal.guia}/recogida`)).body.error.code, "YA_RECOGIDO");
});

test("Mis solicitudes: el cliente ve solo las suyas, con la razón del rechazo y sin datos internos", async () => {
  await pedirDesdePortal(cliente, { direccionEntrega: "Calle 9 # 9-09, Cali" });
  await pedirDesdePortal(otroCliente, { telefono: "300 999 8877", direccionEntrega: "Calle 8 # 8-08, Cali" });
  const lista = await mias(cliente);
  const rechazar = lista.solicitudes.find(x => x.direccionEntrega === "Calle 9 # 9-09, Cali");
  assert.equal(rechazar.estado, "pendiente");
  assert.ok(lista.solicitudes.every(x => x.direccionEntrega !== "Calle 8 # 8-08, Cali"), "no ve las de otro cliente");
  assert.equal(lista.total, lista.solicitudes.length);
  for (const campo of ["revisadoPor", "nombre", "telefono", "email", "clienteId", "mensajeroId"]) assert.ok(!(campo in rechazar), `no expone ${campo}`);

  await oficina.post(`/api/solicitudes/${rechazar.id}/rechazar`).send({ motivo: "No llegamos a esa zona" });
  const r = (await mias(cliente)).solicitudes.find(x => x.id === rechazar.id);
  assert.equal(r.estado, "rechazada");
  assert.equal(r.motivoRechazo, "No llegamos a esa zona");

  // Una asignada trae su guía y el estado de la guía (por recoger)
  const asignada = (await mias(cliente)).solicitudes.find(x => x.direccionEntrega === "Calle 1 # 1-01, Cali");
  assert.equal(asignada.estado, "asignada");
  assert.match(asignada.guia, /^JS-/);
  assert.equal(asignada.pedidoEstado, "aceptado");

  assert.equal((await mias(otroCliente)).solicitudes.length, 1);
  assert.equal((await oficina.get("/api/solicitudes/mias")).status, 403);
  assert.equal((await carlos.get("/api/solicitudes/mias")).status, 403);
  assert.equal((await cliente.get("/api/solicitudes/mias?porPagina=1")).body.solicitudes.length, 1);
  assert.equal((await cliente.get("/api/solicitudes/mias?porPagina=500")).status, 400);
});

test("db:migrar en una base de antes: cambia los CHECK y pasa a aceptado las guías de solicitudes sin foto, una sola vez", async () => {
  const sql = await readFile(new URL("../db/schema.sql", import.meta.url), "utf8");
  // Base como estaba: CHECK viejos y sin la marca de la migración.
  await pool.query(`ALTER TABLE pedidos DROP CONSTRAINT pedidos_estado_check, DROP CONSTRAINT pedidos_check`);
  await pool.query(`UPDATE pedidos SET estado = 'pendiente' WHERE estado = 'aceptado'`);
  await pool.query(`ALTER TABLE pedidos ADD CHECK (estado IN ('pendiente', 'entregado', 'devuelto')), ADD CHECK (estado = 'pendiente' OR entregado IS NOT NULL)`);
  await pool.query(`DELETE FROM ajustes WHERE clave = 'migracion_aceptado'`);
  const sinFoto = (await pool.query(`SELECT p.guia FROM pedidos p JOIN solicitudes s ON s.guia = p.guia
    WHERE p.estado = 'pendiente' AND NOT EXISTS (SELECT 1 FROM pedido_archivos a WHERE a.guia = p.guia AND a.tipo = 'salida')`)).rows.map(f => f.guia);
  assert.ok(sinFoto.length >= 1);
  const conFoto = (await pool.query(`SELECT p.guia FROM pedidos p JOIN solicitudes s ON s.guia = p.guia
    WHERE p.estado = 'pendiente' AND EXISTS (SELECT 1 FROM pedido_archivos a WHERE a.guia = p.guia AND a.tipo = 'salida')`)).rows.map(f => f.guia);
  assert.ok(conFoto.length >= 1);
  const normal = (await carlos.post("/api/pedidos").send({})).body.pedido.guia;

  await pool.query(sql);
  const estado = async g => (await pool.query(`SELECT estado FROM pedidos WHERE guia = $1`, [g])).rows[0].estado;
  for (const g of sinFoto) assert.equal(await estado(g), "aceptado");
  for (const g of conFoto) assert.equal(await estado(g), "pendiente");
  assert.equal(await estado(normal), "pendiente", "las guías del mensajero (con foto al crear) no cambian");

  // Los CHECK nuevos aceptan "aceptado" y siguen rechazando lo demás
  await assert.rejects(pool.query(`UPDATE pedidos SET estado = 'otro' WHERE guia = $1`, [normal]));
  await assert.rejects(pool.query(`UPDATE pedidos SET estado = 'entregado' WHERE guia = $1`, [normal])); // sin hora de entrega

  // Otra corrida no repite la migración de datos
  await pool.query(`UPDATE pedidos SET estado = 'pendiente' WHERE guia = $1`, [sinFoto[0]]);
  await pool.query(sql);
  assert.equal(await estado(sinFoto[0]), "pendiente");
});
