import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { pool, app, request, reiniciarBase, crearCuenta, sesion } from "./ayuda.js";

let oficina, asistente, mensajero, patinador, idPatinador, idOtroPatinador, idMensajero, idCliente, idOtroCliente;

before(async () => {
  await reiniciarBase();
  await crearCuenta({ email: "admin@js.co", rol: "admin" });
  await crearCuenta({ email: "asis@js.co", rol: "asistente" });
  oficina = await sesion("admin@js.co");
  asistente = await sesion("asis@js.co");
  idPatinador = (await oficina.post("/api/mensajeros").send({ nombre: "Tomás Vélez", telefono: "3001234567", tipo: "patinador", tarifa: 70000 })).body.mensajero.id;
  idOtroPatinador = (await oficina.post("/api/mensajeros").send({ nombre: "Otro Patín", tipo: "patinador", tarifa: 70000 })).body.mensajero.id;
  idMensajero = (await oficina.post("/api/mensajeros").send({ nombre: "Carlos Moto", telefono: "3200000000" })).body.mensajero.id;
  await crearCuenta({ email: "m@js.co", rol: "mensajero", mensajeroId: idMensajero });
  mensajero = await sesion("m@js.co");
  idCliente = (await oficina.post("/api/clientes").send({ nombre: "Panadería La Espiga", telefono: "3001112233", tarifa: 8000 })).body.cliente.id;
  idOtroCliente = (await oficina.post("/api/clientes").send({ nombre: "Ferretería Central", telefono: "3004445566", tarifa: 9000 })).body.cliente.id;
});
after(() => pool.end());

test("administración da acceso de patinador vinculado a su ficha de Personal", async () => {
  const r = await oficina.post("/api/usuarios").send({ email: "pat@js.co", role: "patinador", entityId: idPatinador });
  assert.equal(r.status, 201);
  assert.equal(r.body.usuario.rol, "patinador");
  assert.equal(r.body.usuario.mensajeroId, idPatinador);
  assert.equal(r.body.usuario.nombre, "Tomás Vélez");
  // La cuenta se activa con el enlace del correo; para la prueba se le pone contraseña.
  assert.equal((await oficina.put(`/api/usuarios/${r.body.usuario.id}/clave`).send({ clave: "clave-de-prueba-123" })).status, 204);
  patinador = await sesion("pat@js.co");
  const yo = await patinador.get("/api/auth/yo");
  assert.equal(yo.body.usuario.rol, "patinador");
});

test("un acceso de patinador solo se vincula a una ficha de tipo patinador", async () => {
  const r = await oficina.post("/api/usuarios").send({ email: "mal@js.co", role: "patinador", entityId: idMensajero });
  assert.equal(r.status, 400);
  assert.equal(r.body.error.code, "DATOS_INVALIDOS");
  assert.equal((await oficina.post("/api/usuarios").send({ email: "mal2@js.co", rol: "patinador" })).status, 400);
  // Filtrar Acceso por el rol nuevo funciona.
  const p = await oficina.get("/api/usuarios/pagina?rol=patinador");
  assert.equal(p.status, 200);
  assert.deepEqual(p.body.usuarios.map(u => u.email), ["pat@js.co"]);
});

test("cambiar a alguien a patinador exige que su ficha sea de tipo patinador", async () => {
  const idM = (await crearCuenta({ email: "cambio@js.co", rol: "mensajero", mensajeroId: idMensajero })).id; // cuenta aparte: cambiar el rol cierra su sesión
  assert.equal((await oficina.patch(`/api/usuarios/${idM}`).send({ rol: "patinador" })).status, 400);
  assert.equal((await oficina.patch(`/api/usuarios/${idM}`).send({ rol: "patinador", mensajeroId: idOtroPatinador })).status, 200);
  assert.equal((await oficina.patch(`/api/usuarios/${idM}`).send({ rol: "mensajero", mensajeroId: idMensajero })).status, 200);
});

test("la caja empieza vacía y el patinador puede buscar el cliente que le pagó", async () => {
  const r = await patinador.get("/api/patinador/caja");
  assert.equal(r.status, 200);
  assert.deepEqual(r.body.resumen, { total: 0, registros: 0, totalHoy: 0, registrosHoy: 0 });
  assert.deepEqual(r.body.registros, []);
  const b = await patinador.get("/api/clientes/buscar?q=espiga");
  assert.equal(b.status, 200);
  assert.deepEqual(b.body.clientes, [{ id: idCliente, nombre: "Panadería La Espiga" }]);
});

test("cada pago que anota suma a su caja, con la hora del servidor y en el historial", async () => {
  const r1 = await patinador.post("/api/patinador/caja").send({ clienteId: idCliente, concepto: "Domicilios de la semana", valor: 24000 });
  assert.equal(r1.status, 201);
  assert.equal(r1.body.registro.clienteNombre, "Panadería La Espiga");
  assert.equal(r1.body.registro.valor, 24000);
  assert.equal(r1.body.registro.mensajeroId, idPatinador);
  assert.ok(Math.abs(Date.parse(r1.body.registro.fecha) - Date.now()) < 60_000);
  assert.deepEqual(r1.body.resumen, { total: 24000, registros: 1, totalHoy: 24000, registrosHoy: 1 });

  const r2 = await patinador.post("/api/patinador/caja").send({ clienteId: idOtroCliente, concepto: "  Envío  ", valor: "8000" });
  assert.equal(r2.status, 201);
  assert.equal(r2.body.registro.concepto, "Envío");
  assert.equal(r2.body.resumen.total, 32000);

  const c = await patinador.get("/api/patinador/caja");
  assert.equal(c.body.total, 2);
  assert.deepEqual(c.body.registros.map(x => x.valor), [8000, 24000]); // lo más nuevo primero
  const { rows } = await pool.query(`SELECT accion FROM historial WHERE tabla = 'caja_patinador' ORDER BY fecha`);
  assert.equal(rows.length, 2);
  assert.match(rows[0].accion, /Panadería La Espiga/);
});

test("valida el pago: cliente, concepto y valor; no acepta otra caja ni otra hora", async () => {
  const mal = async cuerpo => (await patinador.post("/api/patinador/caja").send(cuerpo));
  assert.equal((await mal({ clienteId: idCliente, concepto: "", valor: 1000 })).status, 400);
  assert.equal((await mal({ clienteId: idCliente, concepto: "x", valor: 0 })).status, 400);
  assert.equal((await mal({ clienteId: idCliente, concepto: "x", valor: 1500.5 })).status, 400);
  assert.equal((await mal({ concepto: "x", valor: 1000 })).status, 400);
  assert.equal((await mal({ clienteId: idCliente, concepto: "x", valor: 1000, mensajeroId: idOtroPatinador })).status, 400);
  assert.equal((await mal({ clienteId: idCliente, concepto: "x", valor: 1000, fecha: "2020-01-01" })).status, 400);
  const noExiste = await mal({ clienteId: "no-existe", concepto: "x", valor: 1000 });
  assert.equal(noExiste.status, 404);
  // Pedir la caja de otro patinador no sirve: el servidor usa la ficha de la cuenta.
  const otra = await patinador.get(`/api/patinador/caja?mensajeroId=${idOtroPatinador}`);
  assert.equal(otra.body.resumen.total, 32000);
});

test("el patinador no entra a lo de la oficina ni a lo del mensajero", async () => {
  for (const url of ["/api/pedidos", "/api/clientes", "/api/recaudos", "/api/mensajeros", "/api/caja/resumen", "/api/sincronizar", "/api/historial"])
    assert.equal((await patinador.get(url)).status, 403, url);
  assert.equal((await patinador.post("/api/pedidos").send({ valorServicio: 1000 })).status, 403);
});

test("solo el patinador anota; la oficina consulta la caja de un patinador; el mensajero no la ve", async () => {
  assert.equal((await request(app).get("/api/patinador/caja")).status, 401);
  assert.equal((await mensajero.get("/api/patinador/caja")).status, 403);
  assert.equal((await mensajero.post("/api/patinador/caja").send({ clienteId: idCliente, concepto: "x", valor: 1000 })).status, 403);
  assert.equal((await oficina.post("/api/patinador/caja").send({ clienteId: idCliente, concepto: "x", valor: 1000 })).status, 403);
  assert.equal((await asistente.get("/api/patinador/caja")).status, 400);
  const r = await asistente.get(`/api/patinador/caja?mensajeroId=${idPatinador}&porPagina=1`);
  assert.equal(r.status, 200);
  assert.equal(r.body.resumen.total, 32000);
  assert.equal(r.body.registros.length, 1);
  assert.equal(r.body.paginas, 2);
});

test("un patinador sin ficha vinculada no tiene caja", async () => {
  await crearCuenta({ email: "suelto@js.co", rol: "patinador" });
  const s = await sesion("suelto@js.co");
  const r = await s.get("/api/patinador/caja");
  assert.equal(r.status, 403);
  assert.match(r.body.error.message, /vinculada/);
  assert.equal((await s.post("/api/patinador/caja").send({ clienteId: idCliente, concepto: "x", valor: 1000 })).status, 403);
});

test("al unir clientes repetidos, los pagos del patinador pasan al cliente que queda", async () => {
  const r = await oficina.post(`/api/clientes/${idCliente}/unir`).send({ otros: [idOtroCliente] });
  assert.equal(r.status, 200);
  const c = await patinador.get("/api/patinador/caja");
  assert.deepEqual([...new Set(c.body.registros.map(x => x.clienteId))], [idCliente]);
  assert.equal(c.body.resumen.total, 32000);
});
