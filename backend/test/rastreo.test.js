/* Rastreo público de una guía: pasos y fechas sin datos personales, con las dos formas en que nace un pedido. */
process.env.CHATBOT_WHATSAPP = "573001234567";
process.env.RASTREO_POR_MINUTO = "40";

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
const { pool, app, request, ORIGEN, reiniciarBase, crearCuenta, sesion } = await import("./ayuda.js");

let oficina, carlos, idCarlos;
const rastrear = guia => request(app).get(`/api/rastreo/${guia}`).set("Origin", ORIGEN);
const estados = r => r.body.rastreo.pasos.map(p => `${p.clave}:${p.completado ? "si" : "no"}`).join(" ");

/** La cliente pide por la página, la oficina acepta y asigna: la guía nace "aceptado". */
let n = 0;
async function guiaDeSolicitud() {
  const entrega = `Calle 70 # 1-${++n}0, Cali`;
  await request(app).post("/api/solicitudes/publico").set("Origin", ORIGEN).set("X-JSL", "1").send({
    nombre: "Laura Gómez", telefono: "300 123 4567", email: "laura@correo.co", direccionRecogida: "Cra 10 # 5-20, Cali", paquetes: 1,
    destinatarioNombre: "Pedro Ruiz", destinatarioTelefono: "3110000000", direccionEntrega: entrega
  });
  const s = (await oficina.get("/api/solicitudes?abiertas=true")).body.solicitudes.find(x => x.direccionEntrega === entrega);
  await oficina.post(`/api/solicitudes/${s.id}/aceptar`).send({ valor: 8000 });
  await oficina.post(`/api/solicitudes/${s.id}/confirmar`); // la oficina confirma por WhatsApp
  const a = await oficina.post(`/api/solicitudes/${s.id}/asignar`).send({ mensajeroId: idCarlos }); if (a.status !== 200) throw new Error(JSON.stringify(a.body)); return a.body.pedido.guia;
}

before(async () => {
  await reiniciarBase();
  await crearCuenta({ email: "admin@js.co", rol: "admin" });
  oficina = await sesion("admin@js.co");
  idCarlos = (await oficina.post("/api/mensajeros").send({ nombre: "Carlos Moto" })).body.mensajero.id;
  await crearCuenta({ email: "carlos@js.co", rol: "mensajero", mensajeroId: idCarlos });
  carlos = await sesion("carlos@js.co");
});
after(() => pool.end());

test("pedido que nace con la foto del mensajero: todo lo anterior queda completo y va en ruta", async () => {
  const guia = (await carlos.post("/api/pedidos").send({})).body.pedido.guia;
  const r = await rastrear(guia);
  assert.equal(r.status, 200);
  assert.equal(estados(r), "solicitado:si guia_generada:si recogido:si en_ruta:si entregado:no");
  assert.equal(r.body.rastreo.estado, "en_ruta");
  assert.equal(r.body.rastreo.estadoTexto, "En ruta");
  assert.equal(r.body.rastreo.novedad, false);
  assert.equal(r.body.rastreo.whatsapp, null);
  const [a, b, c, d, e] = r.body.rastreo.pasos;
  assert.ok(a.fecha && a.fecha === b.fecha && b.fecha === c.fecha && c.fecha === d.fecha);
  assert.equal(e.fecha, null);
});

test("pedido de una solicitud: los pasos se marcan a medida que ocurren y usan la fecha de cada uno", async () => {
  const guia = await guiaDeSolicitud();
  let r = await rastrear(guia);
  assert.equal(estados(r), "solicitado:si guia_generada:si recogido:no en_ruta:no entregado:no");
  assert.equal(r.body.rastreo.estado, "guia_generada");
  assert.equal(r.body.rastreo.pasos[2].fecha, null);
  const solicitud = (await pool.query(`SELECT creado, actualizado FROM solicitudes WHERE guia = $1`, [guia])).rows[0];
  assert.equal(r.body.rastreo.pasos[0].fecha, solicitud.creado.toISOString());
  assert.equal(r.body.rastreo.pasos[1].fecha, solicitud.actualizado.toISOString());

  assert.equal((await carlos.post(`/api/pedidos/${guia}/recogida`)).status, 200);
  r = await rastrear(guia);
  assert.equal(estados(r), "solicitado:si guia_generada:si recogido:si en_ruta:si entregado:no");
  assert.equal(r.body.rastreo.estado, "en_ruta");
  assert.ok(r.body.rastreo.pasos[2].fecha);
  // La fecha de la solicitud no cambia con la recogida
  assert.equal(r.body.rastreo.pasos[0].fecha, solicitud.creado.toISOString());

  assert.equal((await carlos.post(`/api/pedidos/${guia}/entrega`).send({ destinatario: "Pedro", valorCobrado: 0, metodo: "efectivo" })).status, 200);
  r = await rastrear(guia);
  assert.equal(estados(r), "solicitado:si guia_generada:si recogido:si en_ruta:si entregado:si");
  assert.equal(r.body.rastreo.estado, "entregado");
  assert.ok(r.body.rastreo.pasos[4].fecha);
});

test("pedido devuelto: el último paso avisa de la novedad y trae el WhatsApp de la empresa", async () => {
  const guia = (await carlos.post("/api/pedidos").send({})).body.pedido.guia;
  assert.equal((await carlos.post(`/api/pedidos/${guia}/no-entregado`).send({ motivo: "no_contesta" })).status, 200);
  const r = await rastrear(guia);
  assert.equal(r.body.rastreo.estado, "devuelto");
  assert.equal(r.body.rastreo.novedad, true);
  assert.equal(r.body.rastreo.pasos[4].clave, "devuelto");
  assert.equal(r.body.rastreo.pasos[4].titulo, "Novedad con el envío");
  assert.equal(r.body.rastreo.pasos[4].completado, true);
  assert.match(r.body.rastreo.whatsapp, /^https:\/\/wa\.me\/573001234567\?text=/);
  // El motivo de la devolución no se cuenta en público
  assert.ok(!JSON.stringify(r.body).includes("no_contesta"));
});

test("no entrega datos personales ni internos", async () => {
  const guia = await guiaDeSolicitud();
  await carlos.post(`/api/pedidos/${guia}/recogida`);
  await carlos.post(`/api/pedidos/${guia}/entrega`).send({ destinatario: "Pedro Ruiz", valorCobrado: 8000, metodo: "efectivo" });
  const r = await rastrear(guia);
  assert.deepEqual(Object.keys(r.body.rastreo).sort(), ["estado", "estadoTexto", "guia", "novedad", "pasos", "whatsapp"]);
  for (const p of r.body.rastreo.pasos) assert.deepEqual(Object.keys(p).sort(), ["clave", "completado", "fecha", "titulo"]);
  const texto = JSON.stringify(r.body);
  for (const secreto of ["Laura", "Pedro", "Carlos", "Cra 10", "Calle 70 #", "3110000000", "laura@correo.co", "8000"]) assert.ok(!texto.includes(secreto), secreto);
  assert.equal(r.headers["cache-control"], "no-store");
});

test("la guía puede venir en minúsculas, una guía que no existe da 404 y un formato raro da 400", async () => {
  const guia = (await carlos.post("/api/pedidos").send({})).body.pedido.guia;
  assert.equal((await rastrear(guia.toLowerCase())).status, 200);
  const no = await rastrear("JS-99999");
  assert.equal(no.status, 404);
  assert.equal(no.body.error.code, "NO_ENCONTRADO");
  assert.equal((await rastrear("hola")).status, 400);
  assert.equal((await rastrear("JS-1%27OR")).status, 400);
});
