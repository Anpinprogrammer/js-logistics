import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { pool, app, request, ORIGEN, reiniciarBase, crearCuenta, sesion } from "./ayuda.js";

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
  assert.deepEqual(r.body.resumen, { total: 0, registros: 0, totalHoy: 0, registrosHoy: 0, entregado: 0, entregadoHoy: 0, enCaja: 0 });
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
  assert.deepEqual(r1.body.resumen, { total: 24000, registros: 1, totalHoy: 24000, registrosHoy: 1, entregado: 0, entregadoHoy: 0, enCaja: 24000 });

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

test("lo que paga el cliente queda a su favor en su cuenta, sin mover la caja de JS", async () => {
  const movs = (await oficina.get(`/api/clientes/${idCliente}/movimientos`)).body.movimientos;
  const ab = movs.find(m => m.tipo === "abono" && m.valor === 24000);
  assert.ok(ab, "debe haber un abono por el pago del patinador");
  assert.match(ab.nota, /Tomás Vélez|Domicilios de la semana/);
  // En el saldo suma a favor del cliente (en verde en su cuenta)...
  const saldo = (await oficina.get("/api/clientes/saldos")).body.clientes.find(c => c.id === idCliente).saldo;
  assert.equal(saldo, 24000);
  // ...y la caja de JS sigue en cero hasta que el patinador entregue el dinero a la oficina.
  const caja = (await oficina.get("/api/caja/resumen")).body;
  assert.equal(caja.total, 0);
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
  // Un pago rechazado no deja nada a medias: ni abono ni registro.
  const { rows: n } = await pool.query(`SELECT (SELECT count(*) FROM caja_patinador)::int AS cp, (SELECT count(*) FROM movimientos WHERE tipo = 'abono')::int AS ab`);
  assert.deepEqual([n[0].cp, n[0].ab], [2, 2]);
  // Pedir la caja de otro patinador no sirve: el servidor usa la ficha de la cuenta.
  const otra = await patinador.get(`/api/patinador/caja?mensajeroId=${idOtroPatinador}`);
  assert.equal(otra.body.resumen.total, 32000);
});

test("el patinador no entra a lo de la oficina ni a lo del mensajero", async () => {
  for (const url of ["/api/pedidos", "/api/clientes", "/api/recaudos", "/api/mensajeros", "/api/caja/resumen", "/api/sincronizar", "/api/historial"])
    assert.equal((await patinador.get(url)).status, 403, url);
  assert.equal((await patinador.post("/api/pedidos").send({ valorServicio: 1000 })).status, 403);
});

test("anotan el patinador y administración; la oficina consulta la caja de un patinador; el mensajero no la ve", async () => {
  assert.equal((await request(app).get("/api/patinador/caja")).status, 401);
  assert.equal((await mensajero.get("/api/patinador/caja")).status, 403);
  assert.equal((await mensajero.post("/api/patinador/caja").send({ clienteId: idCliente, concepto: "x", valor: 1000 })).status, 403);
  // El asistente solo consulta; administración tiene que decir en cuál caja anota.
  assert.equal((await asistente.post("/api/patinador/caja").send({ mensajeroId: idPatinador, clienteId: idCliente, concepto: "x", valor: 1000 })).status, 403);
  assert.equal((await oficina.post("/api/patinador/caja").send({ clienteId: idCliente, concepto: "x", valor: 1000 })).status, 400);
  assert.equal((await asistente.get("/api/patinador/caja")).status, 400);
  const r = await asistente.get(`/api/patinador/caja?mensajeroId=${idPatinador}&porPagina=1`);
  assert.equal(r.status, 200);
  assert.equal(r.body.resumen.total, 32000);
  assert.equal(r.body.registros.length, 1);
  assert.equal(r.body.paginas, 2);
});

test("administración anota en la caja del patinador que elige, como si fuera él", async () => {
  // Solo en la caja de un patinador que exista.
  assert.equal((await oficina.post("/api/patinador/caja").send({ mensajeroId: idMensajero, clienteId: idCliente, concepto: "x", valor: 1000 })).status, 400);
  assert.equal((await oficina.post("/api/patinador/caja").send({ mensajeroId: "no-existe", clienteId: idCliente, concepto: "x", valor: 1000 })).status, 404);

  const r = await oficina.post("/api/patinador/caja").send({ mensajeroId: idOtroPatinador, clienteId: idCliente, concepto: "Pago anotado en la oficina", valor: 5000 });
  assert.equal(r.status, 201);
  assert.equal(r.body.registro.mensajeroId, idOtroPatinador);
  assert.deepEqual([r.body.resumen.total, r.body.resumen.registros], [5000, 1]);
  // Queda en la caja de ese patinador (no en la del otro) y en su resumen de la oficina.
  assert.equal((await oficina.get(`/api/patinador/caja?mensajeroId=${idOtroPatinador}`)).body.resumen.total, 5000);
  assert.equal((await patinador.get("/api/patinador/caja")).body.resumen.total, 32000);
  assert.equal((await oficina.get("/api/patinador/resumen")).body.patinadores.find(p => p.mensajeroId === idOtroPatinador).debe, 5000);
  // El abono del cliente dice qué patinador recibió la plata, y el historial que lo anotó administración.
  const movs = (await oficina.get(`/api/clientes/${idCliente}/movimientos`)).body.movimientos;
  assert.ok(movs.some(m => m.tipo === "abono" && m.valor === 5000 && /Otro Patín/.test(m.nota)));
  const { rows } = await pool.query(`SELECT accion FROM historial WHERE tabla = 'caja_patinador' AND registro = $1`, [r.body.registro.id]);
  assert.match(rows[0].accion, /caja de Otro Patín/);
  // Se deshace para no mover las cifras de las pruebas siguientes.
  await pool.query(`DELETE FROM caja_patinador WHERE id = $1`, [r.body.registro.id]);
  await pool.query(`DELETE FROM movimientos WHERE tipo = 'abono' AND valor = 5000`);
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

test("la oficina ve cuánto recibió cada patinador y cuánto debe entregar", async () => {
  const r = await oficina.get("/api/patinador/resumen");
  assert.equal(r.status, 200);
  const t = r.body.patinadores.find(p => p.mensajeroId === idPatinador);
  assert.equal(t.nombre, "Tomás Vélez");
  assert.equal(t.recibido, 32000);
  assert.equal(t.recibidoHoy, 32000);
  assert.equal(t.entregado, 0);
  assert.equal(t.debe, 32000);
  // Un patinador sin pagos también aparece; los mensajeros no.
  const otro = r.body.patinadores.find(p => p.mensajeroId === idOtroPatinador);
  assert.deepEqual([otro.recibido, otro.debe], [0, 0]);
  assert.equal(r.body.patinadores.some(p => p.mensajeroId === idMensajero), false);
  assert.equal((await asistente.get("/api/patinador/resumen")).status, 200);
  assert.equal((await patinador.get("/api/patinador/resumen")).status, 403);
  assert.equal((await mensajero.get("/api/patinador/resumen")).status, 403);
});

test("recibir dinero de un patinador usa la misma entrega de los mensajeros y baja lo que debe", async () => {
  const a = await oficina.post("/api/recaudos").send({ mensajeroId: idPatinador, valor: 20000, medio: "efectivo", nota: "Primera entrega" });
  assert.equal(a.status, 201);
  assert.equal(a.body.debe, 12000); // 32.000 recibidos − 20.000 entregados
  // Lo que ve el patinador en su caja baja en el acto, sin tocar sus pagos anotados.
  const m1 = (await patinador.get("/api/patinador/caja")).body;
  assert.deepEqual([m1.resumen.total, m1.resumen.entregado, m1.resumen.enCaja, m1.total], [32000, 20000, 12000, 3]); // total = 2 pagos + la entrega, que sale en su historial
  const ent = m1.registros.find(x => x.tipo === "entrega");
  assert.deepEqual([ent.valor, ent.concepto, m1.registros.filter(x => x.tipo === "pago").length], [20000, "Primera entrega", 2]);
  assert.equal(m1.registros[0].tipo, "entrega"); // la más nueva primero
  assert.equal((await oficina.get(`/api/patinador/caja?mensajeroId=${idPatinador}`)).body.registros.filter(x => x.tipo === "entrega").length, 1);
  // Filtros del historial (celular): los aplica el servidor y el paginador cuenta solo lo filtrado.
  const filtrar = q => patinador.get("/api/patinador/caja").query(q).then(r => r.body);
  const ing = await filtrar({ tipo: "ingresos" }), sal = await filtrar({ tipo: "salidas" });
  assert.deepEqual([ing.total, ing.registros.every(x => x.tipo === "pago"), sal.total, sal.registros.every(x => x.tipo === "entrega")], [2, true, 1, true]);
  assert.equal(ing.resumen.enCaja, 12000); // los filtros no cambian las cifras de arriba
  assert.equal((await filtrar({ buscar: "ESPIGA" })).total, 2); // cliente, sin importar mayúsculas
  assert.equal((await filtrar({ buscar: "domicilios" })).total, 1); // concepto
  assert.equal((await filtrar({ buscar: "primera" })).total, 1); // concepto de la entrega
  assert.equal((await filtrar({ buscar: "%" })).total, 0); // el % no es comodín
  const hoyCo = new Date(Date.now() - 5 * 36e5).toISOString().slice(0, 10);
  assert.equal((await filtrar({ dia: hoyCo })).total, 3);
  assert.equal((await filtrar({ dia: "2020-01-01" })).total, 0);
  assert.equal((await filtrar({ tipo: "salidas", dia: hoyCo, buscar: "primera" })).total, 1);
  assert.equal((await patinador.get("/api/patinador/caja?tipo=otro")).status, 400);
  assert.equal((await patinador.get("/api/patinador/caja?dia=ayer")).status, 400);
  const b = await asistente.post("/api/recaudos").send({ mensajeroId: idPatinador, valor: 15000, medio: "nequi" });
  assert.equal(b.body.debe, -3000); // entregó de más: queda a favor
  const t = (await oficina.get("/api/patinador/resumen")).body.patinadores.find(p => p.mensajeroId === idPatinador);
  assert.deepEqual([t.entregado, t.entregadoHoy, t.debe], [35000, 35000, -3000]);
  // La entrega es un recaudo normal: la oficina la ve en la lista y entra a la caja como la de un mensajero.
  const recs = (await oficina.get("/api/recaudos")).body.recaudos;
  assert.equal(recs.filter(x => x.mensajeroId === idPatinador).length, 2);
  // El patinador no registra entregas de dinero (eso lo hace la oficina).
  assert.equal((await patinador.post("/api/recaudos").send({ mensajeroId: idPatinador, valor: 1000, medio: "efectivo" })).status, 403);
  // Corregir o quitar sigue siendo de administración y se refleja en el resumen.
  assert.equal((await oficina.delete(`/api/recaudos/${b.body.recaudo.id}`)).status, 200);
  assert.equal((await oficina.get("/api/patinador/resumen")).body.patinadores.find(p => p.mensajeroId === idPatinador).debe, 12000);
  const m2 = (await patinador.get("/api/patinador/caja")).body;
  assert.deepEqual([m2.resumen.enCaja, m2.registros.filter(x => x.tipo === "entrega").length], [12000, 1]); // la entrega quitada sale del historial
});

test("solicitudes de recogida: el patinador ve solo las que le asignaron, paginadas", async () => {
  const pub = c => request(app).post("/api/solicitudes/publico").set("Origin", ORIGEN).set("X-JSL", "1").send(c);
  const datos = i => ({ nombre: `Cliente ${i}`, telefono: `30000000${i}0`, email: `c${i}@correo.co`, direccionRecogida: `Calle ${i} # 1-10, Cali`, paquetes: i,
    destinatarioNombre: "Pedro Ruiz", destinatarioTelefono: "3110000000", direccionEntrega: "Calle 70 # 1-10, Cali" });
  for (let i = 1; i <= 3; i++) assert.equal((await pub(datos(i))).status, 201);
  const abiertas = (await oficina.get("/api/solicitudes?abiertas=true")).body.solicitudes;
  assert.equal(abiertas.length, 3);
  const guias = [];
  for (const [i, s] of abiertas.entries()) {
    assert.equal((await oficina.post(`/api/solicitudes/${s.id}/aceptar`).send({ valor: 9000 })).status, 200);
    assert.equal((await oficina.post(`/api/solicitudes/${s.id}/confirmar`)).status, 200);
    // La tercera se la asignan a otro patinador: no la debe ver.
    const r = await oficina.post(`/api/solicitudes/${s.id}/asignar`).send({ mensajeroId: i === 2 ? idOtroPatinador : idPatinador });
    assert.equal(r.status, 200);
    guias.push(r.body.pedido.guia);
  }
  const p1 = await patinador.get("/api/patinador/solicitudes?page=1&limit=1");
  assert.equal(p1.status, 200);
  assert.deepEqual([p1.body.total, p1.body.page, p1.body.totalPages, p1.body.data.length], [2, 1, 2, 1]);
  assert.equal(p1.body.data[0].guia, guias[0]); // la más antigua primero
  assert.ok(p1.body.data[0].direccionRecogida && p1.body.data[0].paquetes && p1.body.data[0].remitente);
  assert.equal(p1.body.data[0].telefono, undefined); // sin datos de contacto del remitente
  const p2 = await patinador.get("/api/patinador/solicitudes?page=2&limit=1");
  assert.equal(p2.body.data[0].guia, guias[1]);
  assert.equal((await patinador.get("/api/patinador/solicitudes?page=9&limit=1")).body.page, 2); // una página que no existe devuelve la última
  assert.equal((await patinador.get("/api/patinador/solicitudes?limit=0")).status, 400);
  // La oficina elige el patinador; lo que mande el patinador sobre otro no cuenta.
  assert.equal((await oficina.get("/api/patinador/solicitudes")).status, 400);
  assert.equal((await oficina.get(`/api/patinador/solicitudes?mensajeroId=${idOtroPatinador}`)).body.total, 1);
  assert.equal((await patinador.get(`/api/patinador/solicitudes?mensajeroId=${idOtroPatinador}`)).body.total, 2);
  // Otros roles no entran.
  assert.equal((await mensajero.get("/api/patinador/solicitudes")).status, 403);
  assert.equal((await request(app).get("/api/patinador/solicitudes")).status, 401);
});
