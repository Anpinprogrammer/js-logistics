import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { app, pool, request, reiniciarBase, crearCuenta, sesion, ORIGEN, CLAVE } from "./ayuda.js";

before(async () => {
  await reiniciarBase();
  await crearCuenta({ email: "admin@js.co", rol: "admin" });
});
after(() => pool.end());

test("health responde sin sesión y ready revisa la base", async () => {
  assert.equal((await request(app).get("/api/health")).status, 200);
  const r = await request(app).get("/api/ready");
  assert.equal(r.status, 200);
  assert.equal(r.body.ok, true);
});

test("sin cookie no hay acceso", async () => {
  const r = await request(app).get("/api/auth/yo");
  assert.equal(r.status, 401);
  assert.equal(r.body.error.code, "NO_AUTENTICADO");
});

test("ingresar pone una cookie httpOnly y /yo devuelve la cuenta sin el hash", async () => {
  const r = await request(app).post("/api/auth/ingresar").set("Origin", ORIGEN).set("X-JSL", "1")
    .send({ email: "ADMIN@js.co", clave: CLAVE });
  assert.equal(r.status, 200);
  const cookie = r.headers["set-cookie"][0];
  assert.match(cookie, /^jsl_sesion=/);
  assert.match(cookie, /HttpOnly/);
  assert.match(cookie, /SameSite=Lax/);
  const yo = await request(app).get("/api/auth/yo").set("Cookie", cookie.split(";")[0]);
  assert.equal(yo.status, 200);
  assert.equal(yo.body.usuario.rol, "admin");
  assert.equal(yo.body.usuario.claveHash, undefined);
});

test("contraseña mala y correo inexistente dan el mismo mensaje", async () => {
  const mal = await request(app).post("/api/auth/ingresar").set("X-JSL", "1").send({ email: "admin@js.co", clave: "otra-cosa" });
  const nadie = await request(app).post("/api/auth/ingresar").set("X-JSL", "1").send({ email: "nadie@js.co", clave: "otra-cosa" });
  assert.equal(mal.status, 401);
  assert.equal(nadie.status, 401);
  assert.equal(mal.body.error.message, nadie.body.error.message);
});

test("CSRF: sin X-JSL o desde otro origen se rechaza", async () => {
  const sinCabecera = await request(app).post("/api/auth/ingresar").send({ email: "admin@js.co", clave: CLAVE });
  assert.equal(sinCabecera.status, 403);
  const otroOrigen = await request(app).post("/api/auth/ingresar").set("X-JSL", "1").set("Origin", "https://malo.com")
    .send({ email: "admin@js.co", clave: CLAVE });
  assert.equal(otroOrigen.status, 403);
});

test("un token alterado no sirve", async () => {
  const r = await request(app).get("/api/auth/yo").set("Cookie", "jsl_sesion=eyJhbGciOiJub25lIn0.eyJzdWIiOiJ4In0.");
  assert.equal(r.status, 401);
});

test("salir de todo invalida el token aunque no haya vencido", async () => {
  const s = await sesion("admin@js.co");
  const login = await request(app).post("/api/auth/ingresar").set("X-JSL", "1").send({ email: "admin@js.co", clave: CLAVE });
  const token = login.headers["set-cookie"][0].split(";")[0];
  assert.equal((await s.post("/api/auth/salir-de-todo")).status, 204);
  const r = await request(app).get("/api/auth/yo").set("Cookie", token);
  assert.equal(r.status, 401);
});

test("datos inválidos devuelven los campos con error", async () => {
  const r = await request(app).post("/api/auth/ingresar").set("X-JSL", "1").send({ email: "no-es-correo" });
  assert.equal(r.status, 400);
  assert.equal(r.body.error.code, "DATOS_INVALIDOS");
  assert.ok(r.body.error.campos.some(c => c.campo === "email"));
});
