/* Paginación de los movimientos de las cuentas internas sin base de datos. */
import { test, after } from "node:test";
import assert from "node:assert/strict";

process.env.DATABASE_URL ||= "postgresql://x";
process.env.JWT_SECRET ||= "secreto-de-pruebas-que-no-sirve-en-produccion-123";
const { pool } = await import("../config/db.js");
const { armarPaginaInternos } = await import("../servicios/caja.js");
after(() => pool.end());

const base = Date.parse("2026-11-01T12:00:00-05:00");
const medios = ["efectivo", "nequi", "bancolombia"];
const movs = Array.from({ length: 25 }, (_, i) => ({
  id: "i" + i, cat: "interna", tipo: i % 2 ? "entra" : "sale", valor: (i + 1) * 1000,
  medio: medios[i % 3], concepto: "Movimiento " + i, fecha: base + i * 86400000
}));
// Movimientos de otras categorías: no deben aparecer.
movs.push({ id: "b1", cat: "base", tipo: "sale", valor: 50000, medio: "efectivo", concepto: "Base", fecha: base });
movs.push({ id: "o1", cat: "oficina", tipo: "entra", valor: 20000, medio: "nequi", concepto: "Oficina", fecha: base });

test("10 por página en escritorio y 5 en celular, sin repetir ni saltar", () => {
  const p1 = armarPaginaInternos(movs, { pagina: 1, porPagina: 10 });
  const p3 = armarPaginaInternos(movs, { pagina: 3, porPagina: 10 });
  assert.deepEqual([p1.movimientos.length, p3.movimientos.length], [10, 5]);
  assert.deepEqual([p1.pagina, p1.porPagina, p1.total, p1.paginas], [1, 10, 25, 3]);

  const vistos = [];
  for (let pagina = 1; pagina <= 5; pagina++) vistos.push(...armarPaginaInternos(movs, { pagina, porPagina: 5 }).movimientos.map(m => m.id));
  assert.equal(vistos.length, 25);
  assert.equal(new Set(vistos).size, 25);
});

test("solo trae movimientos internos y ordena del más nuevo al más viejo", () => {
  const r = armarPaginaInternos(movs, { porPagina: 100 });
  assert.equal(r.total, 25);
  assert.ok(r.movimientos.every(m => m.cat === "interna"));
  assert.equal(r.movimientos[0].id, "i24");
});

test("filtra por día y por medio", () => {
  const dia = armarPaginaInternos(movs, { dia: "2026-11-05", porPagina: 100 });
  assert.deepEqual([dia.total, dia.movimientos[0].id], [1, "i4"]);

  const nequi = armarPaginaInternos(movs, { medio: "nequi", porPagina: 100 });
  assert.equal(nequi.total, movs.filter(m => m.cat === "interna" && m.medio === "nequi").length);
  assert.ok(nequi.movimientos.every(m => m.medio === "nequi"));
});

test("una página fuera de rango devuelve la última", () => {
  const r = armarPaginaInternos(movs, { pagina: 99, porPagina: 5 });
  assert.deepEqual([r.pagina, r.paginas, r.movimientos.length], [5, 5, 5]);
});
