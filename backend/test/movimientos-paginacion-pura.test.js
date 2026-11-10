/* Paginación de la pestaña Cuentas sin base de datos: movimientos y ganancias por cliente. */
import { test, after } from "node:test";
import assert from "node:assert/strict";

process.env.DATABASE_URL ||= "postgresql://x";
process.env.JWT_SECRET ||= "secreto-de-pruebas-que-no-sirve-en-produccion-123";
const { pool } = await import("../config/db.js");
const { armarPaginaMovimientos, armarGananciasPorCliente } = await import("../servicios/movimientos.js");
after(() => pool.end());

const base = Date.parse("2026-11-01T12:00:00-05:00");
const tipos = ["pago_de_cliente", "compra_cliente", "ganancia", "pago_a_cliente"];
const clientes = [{ id: "c1", nombre: "María Ñandú" }, { id: "c2", nombre: "Cliente Dos" }, { id: "c3", nombre: "Cliente Tres" }];
const movs = Array.from({ length: 40 }, (_, i) => ({
  id: "m" + i,
  clienteId: clientes[i % 3].id,
  tipo: tipos[i % 4],
  valor: (i + 1) * 1000,
  fecha: base + i * 86400000,
  nota: i === 0 ? "nota especial" : ""
}));
const suma = (lista, tipo) => lista.filter(m => m.tipo === tipo).reduce((a, m) => a + m.valor, 0);

test("15 por página en escritorio y 6 en celular, sin repetir ni saltar", () => {
  const p1 = armarPaginaMovimientos(movs, clientes, { pagina: 1, porPagina: 15 });
  const p2 = armarPaginaMovimientos(movs, clientes, { pagina: 2, porPagina: 15 });
  const p3 = armarPaginaMovimientos(movs, clientes, { pagina: 3, porPagina: 15 });
  assert.deepEqual([p1.movimientos.length, p2.movimientos.length, p3.movimientos.length], [15, 15, 10]);
  assert.deepEqual([p1.pagina, p1.porPagina, p1.total, p1.paginas], [1, 15, 40, 3]);

  const vistos = [];
  for (let pagina = 1; pagina <= 7; pagina++) {
    const r = armarPaginaMovimientos(movs, clientes, { pagina, porPagina: 6 });
    assert.equal(r.paginas, 7);
    vistos.push(...r.movimientos.map(m => m.id));
  }
  assert.equal(vistos.length, 40);
  assert.equal(new Set(vistos).size, 40);
});

test("sin porPagina usa 15 y una página fuera de rango devuelve la última", () => {
  const d = armarPaginaMovimientos(movs, clientes, { pagina: 1 });
  assert.equal(d.porPagina, 15);
  const r = armarPaginaMovimientos(movs, clientes, { pagina: 99, porPagina: 6 });
  assert.deepEqual([r.pagina, r.paginas, r.movimientos.length], [7, 7, 4]);
});

test("filtra por tipo (pagos incluye recibidos y pagados), búsqueda y rango de fechas", () => {
  const pagos = armarPaginaMovimientos(movs, clientes, { tipo: "pagos", porPagina: 100 });
  assert.equal(pagos.total, movs.filter(m => m.tipo === "pago_de_cliente" || m.tipo === "pago_a_cliente").length);
  assert.equal(pagos.totales.recibido, suma(movs, "pago_de_cliente"));
  assert.equal(pagos.totales.pagado, suma(movs, "pago_a_cliente"));

  const compras = armarPaginaMovimientos(movs, clientes, { tipo: "compras", porPagina: 100 });
  assert.equal(compras.total, 10);
  assert.equal(compras.totales.compras, suma(movs, "compra_cliente"));

  assert.equal(armarPaginaMovimientos(movs, clientes, { buscar: "maria", porPagina: 100 }).total, 14);
  assert.equal(armarPaginaMovimientos(movs, clientes, { buscar: "especial", porPagina: 100 }).total, 1);

  const rango = armarPaginaMovimientos(movs, clientes, { desde: "2026-11-05", hasta: "2026-11-10", porPagina: 100 });
  assert.equal(rango.total, 6);
});

test("los totales son de todo el filtro, no solo de la página", () => {
  const p = armarPaginaMovimientos(movs, clientes, { pagina: 2, porPagina: 6 });
  assert.equal(p.movimientos.length, 6);
  assert.deepEqual(p.totales, {
    recibido: suma(movs, "pago_de_cliente"), pagado: suma(movs, "pago_a_cliente"),
    compras: suma(movs, "compra_cliente"), ganancia: suma(movs, "ganancia")
  });
});

test("ganancias por cliente: agrupa, ordena, pagina y da la ganancia total del rango", () => {
  const r = armarGananciasPorCliente(movs, clientes, { porPagina: 2 });
  assert.equal(r.total, 3);
  assert.equal(r.paginas, 2);
  assert.equal(r.clientes.length, 2);
  assert.ok(r.clientes[0].ganancia >= r.clientes[1].ganancia);
  const esperado = clientes.reduce((a, c) => a + suma(movs.filter(m => m.clienteId === c.id), "ganancia"), 0);
  assert.equal(r.totalGanancia, esperado);

  const todos = armarGananciasPorCliente(movs, clientes, { porPagina: 100 });
  assert.equal(todos.clientes.length, 3);
  assert.equal(todos.clientes.reduce((a, c) => a + c.ganancia, 0), esperado);
  const maria = todos.clientes.find(c => c.clienteId === "c1");
  assert.deepEqual([maria.nombre, maria.recibido, maria.compras], ["María Ñandú", suma(movs.filter(m => m.clienteId === "c1"), "pago_de_cliente"), suma(movs.filter(m => m.clienteId === "c1"), "compra_cliente")]);
});
