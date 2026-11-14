/* Recuperar la contraseña con un código de 6 dígitos por correo: un solo uso, vencimiento, intentos y límites. */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { app, pool, request, reiniciarBase, crearCuenta, crearCuentaSinClave, sesion, ORIGEN } from "./ayuda.js";

const NUEVA = "clave-nueva-de-prueba-456";
const capturados = [];
let Correo;
let n = 0;

const cab = (peticion, ip) => peticion.set("Origin", ORIGEN).set("X-JSL", "1").set("X-Forwarded-For", ip ?? `198.51.100.${++n}`);
const pedir = (email, ip) => cab(request(app).post("/api/auth/recuperar"), ip).send({ email });
const canjear = (email, codigo, clave = NUEVA, ip) => cab(request(app).post("/api/auth/restablecer-con-codigo"), ip).send({ email, codigo, clave });
const ultimoCodigo = () => capturados.at(-1).subject.slice(0, 6);
const mal = codigo => (codigo === "000000" ? "111111" : "000000");

before(async () => {
  await reiniciarBase();
  Correo = await import("../helpers/correo.js");
  Correo.usarEnviador(async m => { capturados.push(m); return { enviado: true, id: "prueba" }; });
  await crearCuenta({ email: "cliente@js.co", rol: "cliente", clienteId: await (async () => {
    await pool.query(`INSERT INTO clientes (id, nombre) VALUES ('cli1', 'Cliente Prueba')`); return "cli1"; })() });
  await crearCuenta({ email: "mens@js.co", rol: "mensajero" });
  await crearCuenta({ email: "inactivo@js.co", rol: "asistente" });
  await pool.query(`UPDATE usuarios SET activo = false WHERE email = 'inactivo@js.co'`);
  await crearCuentaSinClave({ email: "nuevo@js.co", rol: "asistente" });
});
after(async () => { Correo?.restablecerEnviador(); await pool.end(); });

test("el código llega por correo, cambia la contraseña, cierra sesiones y no se puede repetir", async () => {
  const vieja = await sesion("cliente@js.co");
  capturados.length = 0;
  assert.equal((await pedir("cliente@js.co")).status, 204);
  const codigo = ultimoCodigo();
  assert.match(codigo, /^\d{6}$/);
  assert.ok(capturados[0].text.includes(codigo));
  assert.doesNotMatch(capturados[0].html, /token=|https?:\/\/[^"]*restablecer/);

  assert.equal((await canjear("cliente@js.co", codigo)).status, 204);
  assert.equal((await vieja.get("/api/auth/yo")).status, 401);
  const login = await cab(request(app).post("/api/auth/ingresar")).send({ email: "cliente@js.co", clave: NUEVA });
  assert.equal(login.status, 200);

  const otra = await canjear("cliente@js.co", codigo, "otra-clave-de-prueba-789");
  assert.equal(otra.status, 400);
  assert.equal(otra.body.error.code, "CODIGO_INVALIDO");
});

test("sirve para cualquier rol y para una cuenta que todavía no tiene contraseña", async () => {
  for (const email of ["mens@js.co", "nuevo@js.co"]) {
    capturados.length = 0;
    await pedir(email);
    assert.equal((await canjear(email, ultimoCodigo())).status, 204, email);
    assert.equal((await cab(request(app).post("/api/auth/ingresar")).send({ email, clave: NUEVA })).status, 200, email);
  }
});

test("un código equivocado cuenta como intento y al agotarlos el código correcto ya no sirve", async () => {
  capturados.length = 0;
  await pedir("mens@js.co");
  const bueno = ultimoCodigo();
  for (let i = 0; i < 5; i++) {
    const r = await canjear("mens@js.co", mal(bueno));
    assert.equal(r.status, 400);
    assert.equal(r.body.error.code, "CODIGO_INVALIDO");
  }
  const r = await canjear("mens@js.co", bueno);
  assert.equal(r.status, 400);
  assert.equal(r.body.error.code, "CODIGO_INVALIDO");
});

test("un código vencido no sirve", async () => {
  capturados.length = 0;
  await pedir("mens@js.co");
  await pool.query(`UPDATE codigos_clave SET expira = now() - interval '1 minute' WHERE usado IS NULL`);
  assert.equal((await canjear("mens@js.co", ultimoCodigo())).status, 400);
});

test("pedir un código nuevo anula el anterior", async () => {
  capturados.length = 0;
  await pedir("cliente@js.co");
  const primero = ultimoCodigo();
  await pedir("cliente@js.co");
  const segundo = ultimoCodigo();
  if (primero !== segundo) assert.equal((await canjear("cliente@js.co", primero)).status, 400);
  assert.equal((await canjear("cliente@js.co", segundo)).status, 204);
});

test("cada cuenta recibe como máximo 3 códigos por hora, sin delatarlo", async () => {
  await pool.query(`DELETE FROM codigos_clave`);
  capturados.length = 0;
  for (let i = 0; i < 5; i++) assert.equal((await pedir("mens@js.co")).status, 204);
  assert.equal(capturados.length, 3);
});

test("cuenta que no existe o desactivada: misma respuesta y no se manda nada", async () => {
  capturados.length = 0;
  assert.equal((await pedir("nadie@js.co")).status, 204);
  assert.equal((await pedir("inactivo@js.co")).status, 204);
  assert.equal(capturados.length, 0);
  const r = await canjear("nadie@js.co", "123456");
  assert.equal(r.status, 400);
  assert.equal(r.body.error.code, "CODIGO_INVALIDO");
});

test("el código no queda en claro en la base y se valida el formato", async () => {
  const { rows } = await pool.query(`SELECT codigo_hash FROM codigos_clave`);
  assert.ok(rows.every(f => /^[0-9a-f]{64}$/.test(f.codigo_hash)));
  assert.equal((await canjear("mens@js.co", "12345")).status, 400);
  assert.equal((await canjear("mens@js.co", "abcdef")).status, 400);
  assert.equal((await canjear("mens@js.co", "123456", "corta")).status, 400);
  const sinCsrf = await request(app).post("/api/auth/restablecer-con-codigo").send({ email: "mens@js.co", codigo: "123456", clave: NUEVA });
  assert.equal(sinCsrf.status, 403);
});
