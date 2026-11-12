import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { pool, app, request, ORIGEN, reiniciarBase, crearCuenta, sesion } from "./ayuda.js";

let oficina, mensajero, cliente, idMensajero, idCliente;

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
  idCliente = (await oficina.post("/api/clientes").send({ nombre: "Tienda", telefono: "3001112233", tarifa: 8000 })).body.cliente.id;
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
  assert.equal((await oficina.post(`/api/solicitudes/${s.id}/rechazar`).send({ motivo: "Ya no se necesita" })).status, 409);
  assert.equal((await oficina.post(`/api/solicitudes/${s.id}/asignar`).send({ mensajeroId: idMensajero })).status, 409);
});

test("rechazar guarda el motivo y la saca de las abiertas", async () => {
  const s = (await abiertas()).solicitudes[0];
  // Sin razón no se rechaza: el cliente la ve en su portal.
  const sin = await oficina.post(`/api/solicitudes/${s.id}/rechazar`).send({});
  assert.equal(sin.status, 400);
  assert.equal(sin.body.error.code, "DATOS_INVALIDOS");
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

/* ---- Desde el portal del cliente ---- */
const portal = (quien, extra = {}) => quien.post("/api/solicitudes/portal").send(base({ nombre: "Tienda", telefono: "3001112233", email: undefined, ...extra }));
const dePortal = async () => (await oficina.get("/api/solicitudes?estado=pendiente")).body.solicitudes.filter(s => s.origen === "portal");

test("portal: exige sesión de cliente y no acepta clienteId, origen ni valor en el cuerpo", async () => {
  assert.equal((await request(app).post("/api/solicitudes/portal").set("Origin", ORIGEN).set("X-JSL", "1").send(base())).status, 401);
  assert.equal((await mensajero.post("/api/solicitudes/portal").send(base())).status, 403);
  assert.equal((await oficina.post("/api/solicitudes/portal").send(base())).status, 403);
  assert.equal((await portal(cliente, { clienteId: "otro" })).status, 400);
  assert.equal((await portal(cliente, { origen: "publico" })).status, 400);
  assert.equal((await portal(cliente, { valor: 1 })).status, 400);
  assert.equal((await dePortal()).length, 0);
});

test("portal: la solicitud queda ligada a la ficha de la sesión, con el domicilio del cliente y el correo de la cuenta", async () => {
  const r = await portal(cliente, { direccionRecogida: "Bodega, Calle 13 # 8-20, Cali" });
  assert.equal(r.status, 201);
  assert.deepEqual(r.body, { solicitud: { recibida: true } });
  // Repetida por doble clic: no se duplica
  assert.equal((await portal(cliente, { direccionRecogida: "Bodega, Calle 13 # 8-20, Cali" })).status, 201);
  const xs = await dePortal();
  assert.equal(xs.length, 1);
  assert.equal(xs[0].clienteId, idCliente);
  assert.equal(xs[0].clienteNombre, "Tienda");
  assert.equal(xs[0].clienteTarifa, 8000);
  assert.equal(xs[0].email, "c@js.co");
  assert.equal(xs[0].direccionRecogida, "Bodega, Calle 13 # 8-20, Cali");
});

test("portal: aceptar con el domicilio del cliente la deja confirmada y asignar usa su ficha", async () => {
  const [s] = await dePortal();
  const a = await oficina.post(`/api/solicitudes/${s.id}/aceptar`).send({ valor: 8000 });
  assert.equal(a.status, 200);
  assert.equal(a.body.solicitud.estado, "confirmada");
  const r = await oficina.post(`/api/solicitudes/${s.id}/asignar`).send({ mensajeroId: idMensajero });
  assert.equal(r.status, 200);
  assert.equal(r.body.pedido.clienteId, idCliente);
  assert.equal(r.body.pedido.valorServicio, 8000);
});

test("portal: si la oficina propone otro valor, espera la confirmación del cliente", async () => {
  assert.equal((await portal(cliente, { direccionEntrega: "Cra 50 # 9-9, Cali" })).status, 201);
  const [s] = await dePortal();
  const a = await oficina.post(`/api/solicitudes/${s.id}/aceptar`).send({ valor: 10000 });
  assert.equal(a.body.solicitud.estado, "cotizada");
  assert.equal(a.body.solicitud.valor, 10000);
});

test("una solicitud del formulario público queda con origen publico y sin ficha", async () => {
  const xs = (await oficina.get("/api/solicitudes?grupo=todas&pagina=1&porPagina=100")).body.solicitudes.filter(s => s.origen === "publico");
  assert.ok(xs.length > 0);
  assert.ok(xs.every(s => s.clienteTarifa == null || s.estado === "asignada"));
});

test("la consulta administrativa filtra en la base y pagina sin cargar todo el historial", async () => {
  const r = await oficina.get("/api/solicitudes?page=1&limit=1&status=todas&source=portal");
  assert.equal(r.status, 200);
  assert.equal(r.body.data.length, 1);
  assert.ok(r.body.data.every(s => s.origen === "portal"));
  assert.equal(r.body.pagination.limit, 1);
  assert.equal(r.body.pagination.totalItems, r.body.counts.todas);
  assert.ok(r.body.pagination.totalPages >= 1);
  const siguiente = await oficina.get("/api/solicitudes?page=2&limit=1&status=todas&source=portal");
  assert.equal(siguiente.status, 200);
  assert.ok(!siguiente.body.data.some(s => r.body.data.some(primera => primera.id === s.id)));

  const buscada = r.body.data[0];
  assert.ok(buscada);
  const nombre = await oficina.get("/api/solicitudes").query({ page: 1, limit: 15, search: buscada.nombre, source: "portal" });
  assert.equal(nombre.status, 200);
  assert.ok(nombre.body.data.some(s => s.id === buscada.id));
  assert.ok(nombre.body.data.every(s => s.nombre.toLowerCase().includes(buscada.nombre.toLowerCase())));
  const asignada = (await oficina.get("/api/solicitudes?page=1&source=portal&status=aceptadas")).body.data.find(s => s.guia);
  assert.ok(asignada?.guia);
  const guia = await oficina.get("/api/solicitudes").query({ page: 1, search: asignada.guia, status: "aceptadas" });
  assert.equal(guia.status, 200);
  assert.ok(guia.body.data.some(s => s.id === asignada.id));
  const porConfirmar = await oficina.get("/api/solicitudes?page=1&status=por_confirmar&source=portal");
  assert.equal(porConfirmar.status, 200);
  assert.ok(porConfirmar.body.data.every(s => s.estado === "cotizada" && s.origen === "portal"));
  assert.equal(porConfirmar.body.pagination.totalItems, porConfirmar.body.counts.por_confirmar);
  const web = await oficina.get("/api/solicitudes?page=1&source=web");
  assert.equal(web.status, 200);
  assert.ok(web.body.data.length > 0 && web.body.data.every(s => s.origen === "publico"));
  assert.equal((await oficina.get("/api/solicitudes?page=1&search=%25")).body.pagination.totalItems, 0);
  const dia = new Intl.DateTimeFormat("sv-SE", { timeZone: "America/Bogota", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(buscada.creado));
  const fecha = await oficina.get("/api/solicitudes").query({ page: 1, date: dia, source: "portal" });
  assert.equal(fecha.status, 200);
  assert.ok(fecha.body.data.some(s => s.id === buscada.id));
  assert.ok(fecha.body.data.every(s => new Intl.DateTimeFormat("sv-SE", { timeZone: "America/Bogota", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(s.creado)) === dia));
  assert.equal((await oficina.get("/api/solicitudes?page=0")).status, 400);
  assert.equal((await oficina.get("/api/solicitudes?page=1&source=ajeno")).status, 400);
});

/* ---- El cliente responde la propuesta desde su portal ---- */
const responder = (quien, id, cuerpo) => quien.post(`/api/solicitudes/mias/${id}/responder`).send(cuerpo);
const pendientePorNombre = async nombre =>
  (await oficina.get("/api/solicitudes?estado=pendiente")).body.solicitudes.find(s => s.destinatarioNombre === nombre);

test("portal: el cliente acepta la propuesta solo de una solicitud suya", async () => {
  assert.equal((await portal(cliente, { destinatarioNombre: "Respuesta Acepta", direccionEntrega: "Calle 81 # 8-18, Cali" })).status, 201);
  const s = await pendientePorNombre("Respuesta Acepta");
  assert.ok(s);
  assert.equal((await oficina.post(`/api/solicitudes/${s.id}/aceptar`).send({ valor: 12000 })).body.solicitud.estado, "cotizada");

  // Otra cuenta cliente no puede responder una solicitud ajena (ni siquiera sabe si existe).
  const idOtro = (await oficina.post("/api/clientes").send({ nombre: "Otra tienda", telefono: "3007778899", tarifa: 5000 })).body.cliente.id;
  await crearCuenta({ email: "otro@js.co", rol: "cliente", clienteId: idOtro });
  const otro = await sesion("otro@js.co");
  assert.equal((await responder(otro, s.id, { aceptar: true })).status, 404);

  // La oficina usa sus propias rutas; esta es solo de cliente y el cuerpo es estricto.
  assert.equal((await responder(oficina, s.id, { aceptar: true })).status, 403);
  assert.equal((await responder(cliente, s.id, { aceptar: true, clienteId: idOtro })).status, 400);
  assert.equal((await responder(cliente, s.id, {})).status, 400);
  assert.equal((await responder(cliente, s.id, { aceptar: "sí" })).status, 400);

  const r = await responder(cliente, s.id, { aceptar: true });
  assert.equal(r.status, 200);
  assert.equal(r.body.solicitud.estado, "confirmada");
  assert.equal(r.body.solicitud.valor, 12000);
  // La respuesta trae solo lo que ve el portal, no datos internos.
  assert.equal(r.body.solicitud.revisadoPor, undefined);
  assert.equal(r.body.solicitud.telefono, undefined);
  assert.equal(r.body.solicitud.clienteTarifa, undefined);

  // Ya respondida: repetir da 409 y la oficina puede asignarla.
  assert.equal((await responder(cliente, s.id, { aceptar: true })).status, 409);
  const asignada = await oficina.post(`/api/solicitudes/${s.id}/asignar`).send({ mensajeroId: idMensajero });
  assert.equal(asignada.status, 200);
  assert.equal(asignada.body.solicitud.estado, "asignada");
});

test("portal: rechazar la propuesta guarda la razón del cliente o una genérica", async () => {
  assert.equal((await portal(cliente, { destinatarioNombre: "Respuesta Rechaza", direccionEntrega: "Calle 82 # 8-18, Cali" })).status, 201);
  const s = await pendientePorNombre("Respuesta Rechaza");
  assert.ok(s);
  assert.equal((await oficina.post(`/api/solicitudes/${s.id}/aceptar`).send({ valor: 9000 })).body.solicitud.estado, "cotizada");

  const r = await responder(cliente, s.id, { aceptar: false, motivo: "El valor me parece alto" });
  assert.equal(r.status, 200);
  assert.equal(r.body.solicitud.estado, "rechazada");
  assert.equal(r.body.solicitud.motivoRechazo, "El valor me parece alto");
  assert.equal((await responder(cliente, s.id, { aceptar: true })).status, 409);

  assert.equal((await portal(cliente, { destinatarioNombre: "Respuesta Sin Motivo", direccionEntrega: "Calle 83 # 8-18, Cali" })).status, 201);
  const s2 = await pendientePorNombre("Respuesta Sin Motivo");
  assert.ok(s2);
  assert.equal((await oficina.post(`/api/solicitudes/${s2.id}/aceptar`).send({ valor: 10000 })).body.solicitud.estado, "cotizada");
  const r2 = await responder(cliente, s2.id, { aceptar: false });
  assert.equal(r2.status, 200);
  assert.equal(r2.body.solicitud.motivoRechazo, "El cliente no aceptó la propuesta de domicilio.");
});

test("portal: no se puede responder una propuesta antes de que la oficina la haga", async () => {
  assert.equal((await portal(cliente, { destinatarioNombre: "Aún Pendiente", direccionEntrega: "Calle 84 # 8-18, Cali" })).status, 201);
  const s = await pendientePorNombre("Aún Pendiente");
  assert.ok(s);
  const r = await responder(cliente, s.id, { aceptar: true });
  assert.equal(r.status, 409);
  assert.equal(r.body.error.code, "ESTADO_SOLICITUD");
});
