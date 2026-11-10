/* Validación del enlace de restablecimiento que manda administración (sin base de datos). */
import { test } from "node:test";
import assert from "node:assert/strict";

const { enviarReset, enviarResetMasivo, activarCuenta } = await import("../validators/auth.validator.js");

test("acepta usuarioId o email", () => {
  assert.deepEqual(enviarReset.parse({ usuarioId: "u-123" }), { usuarioId: "u-123" });
  assert.deepEqual(enviarReset.parse({ email: "  Admin@JS.co " }), { email: "admin@js.co" });
  assert.deepEqual(enviarReset.parse({ usuarioId: "u-123", email: "a@js.co" }), { usuarioId: "u-123", email: "a@js.co" });
});

test("exige al menos uno de los dos y rechaza formatos inválidos", () => {
  assert.throws(() => enviarReset.parse({}));
  assert.throws(() => enviarReset.parse({ usuarioId: "" }));
  assert.throws(() => enviarReset.parse({ email: "no-es-correo" }));
});

test("el lote masivo acepta correos, los normaliza y quita repetidos", () => {
  const r = enviarResetMasivo.parse({ emails: [" A@JS.co ", "a@js.co", "b@js.co"] });
  assert.deepEqual(r.emails, ["a@js.co", "b@js.co"]);
});

test("el lote masivo exige entre 1 y 100 correos válidos", () => {
  assert.throws(() => enviarResetMasivo.parse({ emails: [] }));
  assert.throws(() => enviarResetMasivo.parse({ emails: ["no-es-correo"] }));
  assert.throws(() => enviarResetMasivo.parse({ emails: Array.from({ length: 101 }, (_, i) => `p${i}@js.co`) }));
});

test("la activación nueva (token + newPassword) exige una clave válida", () => {
  const r = activarCuenta.parse({ token: "x".repeat(43), newPassword: "una-clave-larga" });
  assert.equal(r.newPassword, "una-clave-larga");
  assert.throws(() => activarCuenta.parse({ token: "x".repeat(43), newPassword: "corta" }));
  assert.throws(() => activarCuenta.parse({ newPassword: "una-clave-larga" }));
});
