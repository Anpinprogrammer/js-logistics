/* Validación de la ficha de personal (PATCH/POST /mensajeros) sin base de datos. */
import { test } from "node:test";
import assert from "node:assert/strict";

const { actualizar, crear, paginaPersonal } = await import("../validators/mensajeros.validator.js");

test("PATCH /mensajeros/:id acepta nombre, teléfono, tipo y pago por día", () => {
  const r = actualizar.parse({ nombre: "  Andrés Mora  ", telefono: "300 000 002", tipo: "patinador", tarifa: 70000 });
  assert.deepEqual(r, { nombre: "Andrés Mora", telefono: "300 000 002", tipo: "patinador", tarifa: 70000 });
  assert.equal(actualizar.parse({ tarifa: 0 }).tarifa, 0);
  assert.deepEqual(actualizar.parse({}), {});
});

test("rechaza tipo inválido, pago negativo y nombre vacío", () => {
  assert.throws(() => actualizar.parse({ tipo: "otro" }));
  assert.throws(() => actualizar.parse({ tarifa: -1 }));
  assert.throws(() => actualizar.parse({ nombre: "   " }));
  assert.throws(() => actualizar.parse({ telefono: "abc" }));
});

test("POST /mensajeros exige nombre y pone valores por defecto", () => {
  assert.throws(() => crear.parse({}));
  assert.deepEqual(crear.parse({ nombre: "Nuevo" }), { nombre: "Nuevo", telefono: "", tipo: "mensajero", tarifa: 0 });
});

test("la página de Personal acepta búsqueda, tipo y tamaño", () => {
  const r = paginaPersonal.parse({ buscar: "Andrés", tipo: "patinador", pagina: "2", porPagina: "7" });
  assert.deepEqual([r.buscar, r.tipo, r.pagina, r.porPagina], ["Andrés", "patinador", 2, 7]);
  assert.throws(() => paginaPersonal.parse({ tipo: "otro" }));
});
