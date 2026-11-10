/* Paginación de clientes sin base de datos: búsqueda, filtros, páginas y totales. */
import { test, after } from "node:test";
import assert from "node:assert/strict";

process.env.DATABASE_URL ||= "postgresql://x";
process.env.JWT_SECRET ||= "secreto-de-pruebas-que-no-sirve-en-produccion-123";
const { pool } = await import("../config/db.js");
const { armarPaginaClientes } = await import("../servicios/clientes.js");
after(() => pool.end());

const clientes = Array.from({ length: 25 }, (_, i) => {
  const n = i + 1;
  return {
    id: `c${n}`,
    nombre: n === 1 ? "María Ñandú" : `Cliente ${String(n).padStart(2, "0")}`,
    telefono: `30000000${String(n).padStart(2, "0")}`,
    tarifa: 0,
    saldo: n === 1 ? -50000 : n === 2 ? 30000 : 0
  };
});

test("20 por página en computador, 8 en celular, sin repetir ni saltar", () => {
  const p1 = armarPaginaClientes(clientes, { pagina: 1, porPagina: 20 });
  const p2 = armarPaginaClientes(clientes, { pagina: 2, porPagina: 20 });
  assert.deepEqual([p1.clientes.length, p2.clientes.length], [20, 5]);
  assert.deepEqual([p1.pagina, p1.porPagina, p1.total, p1.paginas, p1.totalClientes], [1, 20, 25, 2, 25]);

  const vistos = [];
  for (let pagina = 1; pagina <= 4; pagina++) {
    const r = armarPaginaClientes(clientes, { pagina, porPagina: 8 });
    assert.equal(r.paginas, 4);
    vistos.push(...r.clientes.map(c => c.id));
  }
  assert.equal(vistos.length, 25);
  assert.equal(new Set(vistos).size, 25);
});

test("una página fuera de rango devuelve la última", () => {
  const r = armarPaginaClientes(clientes, { pagina: 99, porPagina: 8 });
  assert.deepEqual([r.pagina, r.paginas, r.clientes.length], [4, 4, 1]);
});

test("busca por nombre sin tildes o por número", () => {
  assert.equal(armarPaginaClientes(clientes, { pagina: 1, porPagina: 8, buscar: "maria" }).total, 1);
  assert.equal(armarPaginaClientes(clientes, { pagina: 1, porPagina: 8, buscar: "3000000001" }).total, 1);
  assert.equal(armarPaginaClientes(clientes, { pagina: 1, porPagina: 8, buscar: "cliente 07" }).total, 1);
  const vacia = armarPaginaClientes(clientes, { pagina: 2, porPagina: 8, buscar: "no-existe" });
  assert.deepEqual([vacia.pagina, vacia.total, vacia.paginas, vacia.clientes.length], [1, 0, 1, 0]);
});

test("filtros por cobrar y por pagar usan el saldo", () => {
  const cobrar = armarPaginaClientes(clientes, { pagina: 1, porPagina: 20, filtro: "cobrar" });
  assert.deepEqual([cobrar.total, cobrar.porCobrar.clientes, cobrar.porCobrar.total], [1, 1, 50000]);
  assert.equal(cobrar.clientes[0].nombre, "María Ñandú");
  assert.equal(cobrar.clientes[0].saldo, -50000);

  const pagar = armarPaginaClientes(clientes, { pagina: 1, porPagina: 20, filtro: "pagar" });
  assert.deepEqual([pagar.total, pagar.porPagar.clientes, pagar.porPagar.total], [1, 1, 30000]);
  assert.equal(pagar.clientes[0].nombre, "Cliente 02");
});

test("el día usa delDia y sin página devuelve la lista completa", () => {
  const conDia = clientes.map(c => ({ ...c, delDia: c.id === "c1" ? -50000 : c.id === "c2" ? 30000 : 0 }));
  const dia = armarPaginaClientes(conDia, { dia: "2026-11-09", pagina: 1, porPagina: 20 });
  assert.equal(dia.total, 2);
  assert.ok(dia.clientes.every(c => c.delDia !== 0));

  const todos = armarPaginaClientes(clientes, {});
  assert.equal(todos.clientes.length, 25);
  assert.equal(todos.totalClientes, 25);
  assert.equal(todos.pagina, undefined);
  assert.equal(todos.paginas, undefined);
  assert.deepEqual([todos.porCobrar.clientes, todos.porPagar.clientes], [1, 1]);
});
