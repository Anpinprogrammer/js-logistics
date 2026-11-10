/* Validación de la paginación del historial (sin base de datos). */
import { test } from "node:test";
import assert from "node:assert/strict";

const { historial } = await import("../validators/dinero.validator.js");

test("acepta búsqueda y página de 13 en escritorio o 5 en celular", () => {
  const r = historial.parse({ desde: "2026-11-01", buscar: "guía", pagina: "2", porPagina: "13" });
  assert.deepEqual([r.pagina, r.porPagina, r.buscar], [2, 13, "guía"]);
  assert.equal(historial.parse({}).limite, 600);
});

test("rechaza páginas y tamaños fuera de rango", () => {
  assert.throws(() => historial.parse({ pagina: 0 }));
  assert.throws(() => historial.parse({ porPagina: 0 }));
  assert.throws(() => historial.parse({ porPagina: 101 }));
});
