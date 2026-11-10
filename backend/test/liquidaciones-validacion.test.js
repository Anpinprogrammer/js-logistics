/* Validación de la paginación de liquidaciones recientes (sin base de datos). */
import { test } from "node:test";
import assert from "node:assert/strict";

const { liquidacionesPagina } = await import("../validators/dinero.validator.js");

test("acepta páginas de 9 en escritorio y 5 en celular", () => {
  assert.deepEqual(liquidacionesPagina.parse({ pagina: "1", porPagina: "9" }), { pagina: 1, porPagina: 9, estado: "todos" });
  assert.deepEqual(liquidacionesPagina.parse({ pagina: "4", porPagina: "5" }), { pagina: 4, porPagina: 5, estado: "todos" });
});

test("acepta fecha, estado y búsqueda por mensajero", () => {
  const r = liquidacionesPagina.parse({ dia: "2026-11-03", estado: "cobrar", buscar: "Andrés" });
  assert.deepEqual([r.dia, r.estado, r.buscar], ["2026-11-03", "cobrar", "Andrés"]);
  assert.equal(liquidacionesPagina.parse({}).estado, "todos");
  assert.throws(() => liquidacionesPagina.parse({ estado: "otro" }));
  assert.throws(() => liquidacionesPagina.parse({ dia: "03/11/2026" }));
});

test("rechaza páginas o tamaños inválidos", () => {
  assert.throws(() => liquidacionesPagina.parse({ pagina: 0 }));
  assert.throws(() => liquidacionesPagina.parse({ porPagina: 0 }));
  assert.throws(() => liquidacionesPagina.parse({ porPagina: 101 }));
});
