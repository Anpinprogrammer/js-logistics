/* Validación del alta de accesos: API nueva { role, entityId, email } y compatibilidad. */
import { test } from "node:test";
import assert from "node:assert/strict";

const { crear } = await import("../validators/usuarios.validator.js");

test("acepta la API nueva con role, entityId y email", () => {
  const r = crear.parse({ email: " A@JS.co ", role: "cliente", entityId: "c-1" });
  assert.deepEqual([r.email, r.role, r.entityId], ["a@js.co", "cliente", "c-1"]);
});

test("acepta el alta antigua con rol y nombre", () => {
  const r = crear.parse({ email: "a@js.co", rol: "mensajero", nombre: "Ana", mensajeroId: "m-1" });
  assert.deepEqual([r.rol, r.nombre], ["mensajero", "Ana"]);
});

test("exige rol y cliente cuando el rol es cliente", () => {
  assert.throws(() => crear.parse({ email: "a@js.co", nombre: "Ana" }));
  assert.throws(() => crear.parse({ email: "a@js.co", role: "cliente" }));
});
