import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { pool, app, request, ORIGEN, reiniciarBase, crearCuenta, sesion } from "./ayuda.js";

let oficina, mensajero, cliente, idMensajero;

const publico = cuerpo => request(app).post("/api/solicitudes/publico").set("Origin", ORIGEN).set("X-JSL", "1").send(cuerpo);
const base = (extra = {}) => ({
  nombre: "Laura Gómez", telefono: "300 123 4567", email: "laura@correo.co",
  direccionRecogida: "Cra 10 # 5-20, Cali", paquetes: 2, pesoKg: "3.5",
  destinatarioNombre: "Pedro Ruiz", destinatarioTelefono: "3110000000", direccionEntrega: "Calle 70 # 1-10, Cali", ...extra
});
const abiertas = async () => (await oficina.get("/api/solicitudes?abiertas=true")).body;

before(async () => {
  await reiniciarBase();
  await crearCuenta({ email: "admin@js.co", rol: "admin" });
  oficina = await sesion("admin@js.co");
  idMensajero = (await oficina.post("/api/mensajeros").send({ nombre: "Carlos Moto", telefono: "3200000000" })).body.mensajero.id;
  await crearCuenta({ email: "m@js.co", rol: "mensajero", mensajeroId: idMensajero });
  mensajero = await sesion("m@js.co");
  const idCliente = (await oficina.post("/api/clientes").send({ nombre: "Tienda", telefono: "3001112233" })).body.cliente.id;
  await crearCuenta({ email: "c@js.co", rol: "cliente", clienteId: idCliente });
  cliente = await sesion("c@js.co");
});
after(() => pool.end());

test("un visitante envía una solicitud sin sesión y la respuesta no trae datos guardados", async () => {
  const r = await publico(base());
  assert.equal(r.status, 201);
  assert.deepEqual(r.body, { solicitud: { recibida: true } });
  const { solicitudes, conteo } = await abiertas();
  assert.equal(solicitudes.length, 1);
  assert.equal(conteo.pendiente, 1);
  const s = solicitudes[0];
  assert.equal(s.estado, "pendiente");
  assert.equal(s.pesoKg, 3.5);
  assert.equal(s.paquetes, 2);
  assert.equal(s.direccionEntrega, "Calle 70 # 1-10, Cali");
});

test("la misma solicitud enviada dos veces seguidas no se repite", async () => {
  assert.equal((await publico(base())).status, 201);
  assert.equal((await abiertas()).solicitudes.length, 1);
});

test("el campo trampa para robots no guarda nada", async () => {
  const r = await publico(base({ telefono: "3009998877", sitio: "http://spam" }));
  assert.equal(r.status, 201);
  assert.equal((await abiertas()).solicitudes.length, 1);
});

test("valida los campos obligatorios, el peso es opcional y no acepta campos de más", async () => {
  const r = await publico(base({ nombre: "", direccionEntrega: "" }));
  assert.equal(r.status, 400);
  assert.equal(r.body.error.code, "DATOS_INVALIDOS");
  assert.equal((await publico(base({ paquetes: 0 }))).status, 400);
  assert.equal((await publico(base({ email: "no-es-correo" }))).status, 400);
  assert.equal((await publico(base({ estado: "asignada" }))).status, 400);
  assert.equal((await publico(base({ valor: 1000 }))).status, 400);
  const sinPeso = await publico(base({ telefono: "3150000000", pesoKg: "" }));
  assert.equal(sinPeso.status, 201);
  const s = (await abiertas()).solicitudes.find(x => x.telefono === "3150000000");
  assert.equal(s.pesoKg, null);
});

test("sin la cabecera X-JSL o desde otro origen no se acepta", async () => {
  assert.equal((await request(app).post("/api/solicitudes/publico").set("Origin", ORIGEN).send(base())).status, 403);
  assert.equal((await request(app).post("/api/solicitudes/publico").set("Origin", "https://otro.com").set("X-JSL", "1").send(base())).status, 403);
});

test("solo la oficina ve y atiende las solicitudes", async () => {
  assert.equal((await request(app).get("/api/solicitudes")).status, 401);
  assert.equal((await mensajero.get("/api/solicitudes")).status, 403);
  assert.equal((await cliente.get("/api/solicitudes")).status, 403);
  const id = (await abiertas()).solicitudes[0].id;
  assert.equal((await mensajero.post(`/api/solicitudes/${id}/aceptar`).send({ valor: 9000 })).status, 403);
  assert.equal((await cliente.post(`/api/solicitudes/${id}/rechazar`).send({})).status, 403);
});

test("aceptar con valor, confirmar y asignar crea el cliente y la guía", async () => {
  const s = (await abiertas()).solicitudes.find(x => x.nombre === "Laura Gómez");
  // No se puede asignar ni confirmar antes de tiempo
  assert.equal((await oficina.post(`/api/solicitudes/${s.id}/asignar`).send({ mensajeroId: idMensajero })).body.error.code, "ESTADO_SOLICITUD");
  assert.equal((await oficina.post(`/api/solicitudes/${s.id}/confirmar`)).status, 409);
  assert.equal((await oficina.post(`/api/solicitudes/${s.id}/aceptar`).send({ valor: 0 })).status, 400);

  const a = await oficina.post(`/api/solicitudes/${s.id}/aceptar`).send({ valor: 12000 });
  assert.equal(a.status, 200);
  assert.equal(a.body.solicitud.estado, "cotizada");
  assert.equal(a.body.solicitud.valor, 12000);
  assert.equal((await oficina.post(`/api/solicitudes/${s.id}/asignar`).send({ mensajeroId: idMensajero })).status, 409);

  const c = await oficina.post(`/api/solicitudes/${s.id}/confirmar`);
  assert.equal(c.body.solicitud.estado, "confirmada");
  assert.equal((await oficina.post(`/api/solicitudes/${s.id}/asignar`).send({ mensajeroId: "no-existe" })).status, 400);

  const r = await oficina.post(`/api/solicitudes/${s.id}/asignar`).send({ mensajeroId: idMensajero });
  assert.equal(r.status, 200);
  assert.equal(r.body.solicitud.estado, "asignada");
  assert.equal(r.body.solicitud.mensajeroNombre, "Carlos Moto");
  assert.equal(r.body.pedido.valorServicio, 12000);
  assert.equal(r.body.pedido.mensajeroId, idMensajero);
  assert.equal(r.body.solicitud.guia, r.body.pedido.guia);
  const nuevo = (await oficina.get(`/api/clientes/${r.body.pedido.clienteId}`)).body.cliente;
  assert.equal(nuevo.nombre, "Laura Gómez");
  assert.equal(nuevo.direccionRecogida, "Cra 10 # 5-20, Cali");
  // El mensajero ve la guía nueva en su lista
  const suyas = (await mensajero.get("/api/pedidos")).body.pedidos.map(p => p.guia);
  assert.ok(suyas.includes(r.body.pedido.guia));
  // Ya asignada: no se puede rechazar ni volver a asignar
  assert.equal((await oficina.post(`/api/solicitudes/${s.id}/rechazar`).send({})).status, 409);
  assert.equal((await oficina.post(`/api/solicitudes/${s.id}/asignar`).send({ mensajeroId: idMensajero })).status, 409);
});

test("rechazar guarda el motivo y la saca de las abiertas", async () => {
  const s = (await abiertas()).solicitudes[0];
  const r = await oficina.post(`/api/solicitudes/${s.id}/rechazar`).send({ motivo: "Fuera de la zona de cobertura" });
  assert.equal(r.status, 200);
  assert.equal(r.body.solicitud.estado, "rechazada");
  assert.equal(r.body.solicitud.motivoRechazo, "Fuera de la zona de cobertura");
  assert.equal((await abiertas()).solicitudes.length, 0);
  assert.equal((await oficina.get("/api/solicitudes?estado=rechazada")).body.solicitudes.length, 1);
});

test("la pantalla de solicitudes filtra por grupo, pagina y cuenta cada filtro", async () => {
  const g = await oficina.get("/api/solicitudes?grupo=todas&pagina=1&porPagina=1");
  assert.equal(g.status, 200);
  assert.equal(g.body.solicitudes.length, 1);
  assert.equal(g.body.total, g.body.grupos.todas);
  assert.equal(g.body.grupos.rechazadas, 1);
  assert.equal(g.body.grupos.aceptadas, 1);
  assert.equal((await oficina.get("/api/solicitudes?grupo=rechazadas&pagina=1")).body.solicitudes[0].estado, "rechazada");
  assert.equal((await oficina.get("/api/solicitudes?grupo=aceptadas&pagina=1")).body.solicitudes[0].estado, "asignada");
  assert.equal((await oficina.get("/api/solicitudes?grupo=por-confirmar&pagina=1")).body.total, 0);
  assert.equal((await oficina.get("/api/solicitudes?grupo=raro")).status, 400);
});

test("después de varias solicitudes desde la misma IP responde 429", async () => {
  let ultimo;
  for (let i = 0; i < 15; i++) {
    ultimo = await publico(base({ nombre: "" }));
    if (ultimo.status === 429) break;
  }
  assert.equal(ultimo.status, 429);
  assert.equal(ultimo.body.error.code, "DEMASIADAS_SOLICITUDES");
});
