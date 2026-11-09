/* Correos de activación y de contraseña: enlaces de un solo uso, vencimiento y avisos por Resend. */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { createHash, randomBytes } from "node:crypto";
import { app, pool, request, reiniciarBase, crearCuenta, crearCuentaSinClave, sesion, ORIGEN, CLAVE } from "./ayuda.js";

const NUEVA = "clave-nueva-de-prueba-456";
const capturados = [];
let Correo;
let Enlace;

const tokenDe = (mensaje, ruta) => {
  const m = String(mensaje.html).match(new RegExp(`/${ruta}\\?token=([A-Za-z0-9_-]+)`));
  return m?.[1];
};
const conCabeceras = peticion => peticion.set("Origin", ORIGEN).set("X-JSL", "1");
const hashDe = token => createHash("sha256").update(token).digest("hex");

before(async () => {
  await reiniciarBase();
  Correo = await import("../helpers/correo.js");
  Enlace = await import("../models/enlace.model.js");
  Correo.usarEnviador(async mensaje => {
    capturados.push(mensaje);
    return { enviado: true, id: "prueba" };
  });

  await crearCuenta({ email: "admin@js.co", rol: "admin" });
  await pool.query(`INSERT INTO clientes (id, nombre) VALUES ('cli1', 'Cliente Prueba')`);
  await crearCuenta({ email: "cliente@js.co", rol: "cliente", clienteId: "cli1" });
  await crearCuenta({ email: "inactivo@js.co", rol: "asistente" });
  await pool.query(`UPDATE usuarios SET activo = false WHERE email = 'inactivo@js.co'`);
});

after(async () => {
  Correo?.restablecerEnviador();
  await pool.end();
});

test("pedir recuperación manda un enlace al portal de clientes y no delata correos inexistentes", async () => {
  capturados.length = 0;
  const r = await conCabeceras(request(app).post("/api/auth/recuperar")).send({ email: "CLIENTE@js.co" });
  assert.equal(r.status, 204);
  assert.equal(capturados.length, 1);
  assert.equal(capturados[0].to[0], "cliente@js.co");
  assert.match(capturados[0].subject, /Cambia tu contraseña/);
  assert.match(capturados[0].html, /http:\/\/localhost:3000\/restablecer\?token=/);

  const token = tokenDe(capturados[0], "restablecer");
  assert.ok(token);
  const { rows } = await pool.query(
    `SELECT tipo, token_hash, usado FROM enlaces WHERE usuario_id = (SELECT id FROM usuarios WHERE email = 'cliente@js.co')`
  );
  assert.equal(rows.length, 1);
  assert.equal(rows[0].tipo, "clave");
  assert.equal(rows[0].token_hash, hashDe(token));
  assert.equal(rows[0].usado, null);
  // El token en claro no queda en la base.
  assert.notEqual(rows[0].token_hash, token);

  const antes = capturados.length;
  const nadie = await conCabeceras(request(app).post("/api/auth/recuperar")).send({ email: "nadie@js.co" });
  assert.equal(nadie.status, 204);
  assert.equal(capturados.length, antes);
});

test("el enlace se puede revisar antes de usarlo, sin mostrar el correo completo", async () => {
  const token = tokenDe(capturados[0], "restablecer");
  const r = await request(app).get(`/api/auth/enlace/${token}`);
  assert.equal(r.status, 200);
  assert.equal(r.body.enlace.tipo, "clave");
  assert.equal(r.body.enlace.nombre, "cliente");
  assert.match(r.body.enlace.email, /^c\*+@js\.co$/);
  assert.equal(r.body.enlace.email.includes("cliente@"), false);
  assert.ok(r.body.enlace.expira);
});

test("restablecer cambia la contraseña, cierra las sesiones y el enlace no se puede repetir", async () => {
  const token = tokenDe(capturados[0], "restablecer");
  const viejaSesion = await sesion("cliente@js.co");

  const r = await conCabeceras(request(app).post("/api/auth/restablecer")).send({ token, clave: NUEVA });
  assert.equal(r.status, 204);

  assert.equal((await viejaSesion.get("/api/auth/yo")).status, 401);
  const login = await conCabeceras(request(app).post("/api/auth/ingresar")).send({ email: "cliente@js.co", clave: NUEVA });
  assert.equal(login.status, 200);

  const otraVez = await conCabeceras(request(app).post("/api/auth/restablecer")).send({ token, clave: NUEVA });
  assert.equal(otraVez.status, 400);
  assert.equal(otraVez.body.error.code, "ENLACE_INVALIDO");
});

test("crear una cuenta sin contraseña manda la activación; el enlace crea la contraseña y entra", async () => {
  const admin = await sesion("admin@js.co");
  capturados.length = 0;
  const r = await admin.post("/api/usuarios").send({ email: "nuevo@js.co", nombre: "Nuevo Mensajero", rol: "mensajero" });
  assert.equal(r.status, 201);
  assert.equal(r.body.correo.enviado, true);
  assert.equal(capturados.length, 1);
  assert.equal(capturados[0].to[0], "nuevo@js.co");
  assert.match(capturados[0].subject, /Activa tu cuenta/);
  assert.match(capturados[0].html, /http:\/\/localhost:5173\/activar\?token=/);

  const { rows } = await pool.query(`SELECT clave_hash, activo FROM usuarios WHERE email = 'nuevo@js.co'`);
  assert.equal(rows[0].clave_hash, null);
  assert.equal(rows[0].activo, true);

  const sinClave = await conCabeceras(request(app).post("/api/auth/ingresar")).send({ email: "nuevo@js.co", clave: NUEVA });
  assert.equal(sinClave.status, 401);

  const token = tokenDe(capturados[0], "activar");
  const activar = await conCabeceras(request(app).post("/api/auth/activar")).send({ token, clave: NUEVA });
  assert.equal(activar.status, 204);

  const login = await conCabeceras(request(app).post("/api/auth/ingresar")).send({ email: "nuevo@js.co", clave: NUEVA });
  assert.equal(login.status, 200);

  const otraVez = await conCabeceras(request(app).post("/api/auth/activar")).send({ token, clave: NUEVA });
  assert.equal(otraVez.status, 400);
});

test("un enlace vencido no sirve y lo dice con su propio código", async () => {
  const { rows } = await pool.query(`SELECT id FROM usuarios WHERE email = 'nuevo@js.co'`);
  const token = randomBytes(32).toString("base64url");
  await Enlace.crear({
    usuarioId: rows[0].id,
    tipo: "activacion",
    tokenHash: hashDe(token),
    expira: new Date(Date.now() - 60_000)
  });
  const r = await conCabeceras(request(app).post("/api/auth/activar")).send({ token, clave: NUEVA });
  assert.equal(r.status, 410);
  assert.equal(r.body.error.code, "ENLACE_VENCIDO");
});

test("una cuenta desactivada no recibe enlaces y hay que activarla para reenviarlos", async () => {
  const { rows } = await pool.query(`SELECT id FROM usuarios WHERE email = 'inactivo@js.co'`);
  const id = rows[0].id;
  const admin = await sesion("admin@js.co");

  capturados.length = 0;
  const recuperar = await conCabeceras(request(app).post("/api/auth/recuperar")).send({ email: "inactivo@js.co" });
  assert.equal(recuperar.status, 204);
  assert.equal(capturados.length, 0);

  const reenvio = await admin.post(`/api/usuarios/${id}/activacion`);
  assert.equal(reenvio.status, 409);
  assert.equal(reenvio.body.error.code, "CUENTA_INACTIVA");

  const activar = await admin.patch(`/api/usuarios/${id}`).send({ activo: true });
  assert.equal(activar.status, 200);
  assert.equal(activar.body.correo.enviado, true);
  assert.equal(capturados.length, 1);
  assert.match(capturados[0].html, /\/activar\?token=/);
});

test("administración puede mandar el enlace de contraseña a un trabajador", async () => {
  const { rows } = await pool.query(`SELECT id FROM usuarios WHERE email = 'inactivo@js.co'`);
  const admin = await sesion("admin@js.co");
  capturados.length = 0;
  const r = await admin.post(`/api/usuarios/${rows[0].id}/recuperacion`);
  assert.equal(r.status, 200);
  assert.equal(r.body.correo.enviado, true);
  assert.equal(capturados.length, 1);
  assert.match(capturados[0].html, /http:\/\/localhost:5173\/restablecer\?token=/);
  assert.match(capturados[0].html, /Administración de JS Logistics te envió/);
});

test("solo administración manda los enlaces desde Accesos", async () => {
  const { rows } = await pool.query(`SELECT id FROM usuarios WHERE email = 'nuevo@js.co'`);
  const agente = request.agent(app);
  const login = await conCabeceras(agente.post("/api/auth/ingresar")).send({ email: "nuevo@js.co", clave: NUEVA });
  assert.equal(login.status, 200);
  const r = await conCabeceras(agente.post(`/api/usuarios/${rows[0].id}/recuperacion`));
  assert.equal(r.status, 403);
  assert.equal(r.body.error.code, "PROHIBIDO");
});

test("la plantilla escapa el nombre y arma el remitente", () => {
  const mensaje = Correo.correoDeEnlace({
    usuario: { nombre: "<script>alert(1)</script>", email: "x@js.co", rol: "cliente" },
    tipo: "clave",
    enlace: "https://jslogistics.pro/restablecer?token=abc",
    origen: "autoservicio"
  });
  assert.equal(mensaje.to[0], "x@js.co");
  assert.match(mensaje.from, /JS Logistics <no-responder@jslogistics\.pro>/);
  assert.equal(mensaje.html.includes("<script>"), false);
  assert.ok(mensaje.html.includes("&lt;script&gt;"));
  assert.ok(mensaje.text.includes("https://jslogistics.pro/restablecer?token=abc"));
});

test("validación y CSRF en las rutas públicas de correo", async () => {
  const sinCabecera = await request(app).post("/api/auth/recuperar").send({ email: "cliente@js.co" });
  assert.equal(sinCabecera.status, 403);

  const malCorreo = await conCabeceras(request(app).post("/api/auth/recuperar")).send({ email: "no-es-correo" });
  assert.equal(malCorreo.status, 400);
  assert.equal(malCorreo.body.error.code, "DATOS_INVALIDOS");

  const clavemala = await conCabeceras(request(app).post("/api/auth/restablecer"))
    .send({ token: "a".repeat(43), clave: "corta" });
  assert.equal(clavemala.status, 400);
  assert.ok(clavemala.body.error.campos.some(c => c.campo === "clave"));
});

test("el pedido de enlaces tiene límite por IP", async () => {
  const ip = "203.0.113.9";
  const pedir = () => conCabeceras(request(app).post("/api/auth/recuperar"))
    .set("X-Forwarded-For", ip)
    .send({ email: "cliente@js.co" });
  for (let i = 0; i < 5; i++) assert.equal((await pedir()).status, 204);
  const sexto = await pedir();
  assert.equal(sexto.status, 429);
  assert.equal(sexto.body.error.code, "DEMASIADOS_CORREOS");
});
