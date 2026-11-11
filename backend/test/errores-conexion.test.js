/* Cuando la base no da conexión (cupo del pooler lleno, pool sin libres), la API responde 503 con un mensaje claro.
   Es una prueba pura: no necesita Postgres. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { manejarErrores, esFaltaDeConexion } from "../middleware/errores.js";
import { HttpError } from "../helpers/errores.js";

function responder(err) {
  const res = {
    cabeceras: {}, cuerpo: null,
    set(k, v) { this.cabeceras[k] = v; return this; },
    status(s) { this.status_ = s; return this; },
    json(c) { this.cuerpo = c; return this; }
  };
  const original = console.error;
  console.error = () => {};
  try { manejarErrores(err, { method: "GET", originalUrl: "/api/pedidos" }, res, () => {}); }
  finally { console.error = original; }
  return res;
}

test("cupo del pooler de Supabase lleno → 503 BASE_OCUPADA con Retry-After", () => {
  const e = Object.assign(new Error("(EMAXCONNSESSION) max clients reached in session mode - max clients are limited to pool_size: 15"), { code: "XX000" });
  const r = responder(e);
  assert.equal(r.status_, 503);
  assert.equal(r.cuerpo.error.code, "BASE_OCUPADA");
  assert.equal(r.cabeceras["Retry-After"], "5");
});

test("pool sin conexiones libres a tiempo y too_many_connections → 503", () => {
  assert.equal(responder(new Error("timeout exceeded when trying to connect")).status_, 503);
  assert.equal(responder(Object.assign(new Error("sorry, too many clients already"), { code: "53300" })).status_, 503);
  assert.equal(responder(Object.assign(new Error("connect ECONNREFUSED"), { code: "ECONNREFUSED" })).status_, 503);
});

test("los demás errores no cambian", () => {
  assert.equal(esFaltaDeConexion(new HttpError(404, "NO_ENCONTRADO", "No existe")), false);
  assert.equal(responder(Object.assign(new Error("dup"), { code: "23505" })).status_, 409);
  assert.equal(responder(new Error("otra cosa")).status_, 500);
});
