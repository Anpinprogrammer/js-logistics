/* Paginación de la sub-pestaña Acceso de Personal sin base de datos: 5 en celular y 10 en computador. */
import { test, after } from "node:test";
import assert from "node:assert/strict";

process.env.DATABASE_URL ||= "postgresql://x";
process.env.JWT_SECRET ||= "secreto-de-pruebas-que-no-sirve-en-produccion-123";
const { pool } = await import("../config/db.js");
const { armarPaginaUsuarios } = await import("../servicios/usuarios.js");
after(() => pool.end());

const usuarios = Array.from({ length: 23 }, (_, i) => ({
  id: "u" + i, email: `persona${String(i).padStart(2, "0")}@js.co`, nombre: `Persona ${String(i).padStart(2, "0")}`, rol: "asistente"
}));

test("10 por página en escritorio y 5 en celular, sin repetir ni saltar", () => {
  const p1 = armarPaginaUsuarios(usuarios, { pagina: 1, porPagina: 10 });
  const p3 = armarPaginaUsuarios(usuarios, { pagina: 3, porPagina: 10 });
  assert.deepEqual([p1.usuarios.length, p3.usuarios.length], [10, 3]);
  assert.deepEqual([p1.pagina, p1.porPagina, p1.total, p1.paginas], [1, 10, 23, 3]);

  const vistos = [];
  for (let pagina = 1; pagina <= 5; pagina++) {
    const r = armarPaginaUsuarios(usuarios, { pagina, porPagina: 5 });
    assert.equal(r.paginas, 5);
    vistos.push(...r.usuarios.map(u => u.id));
  }
  assert.equal(vistos.length, 23);
  assert.equal(new Set(vistos).size, 23);
});

test("sin porPagina usa 10 y una página fuera de rango devuelve la última", () => {
  assert.equal(armarPaginaUsuarios(usuarios, { pagina: 1 }).porPagina, 10);
  const r = armarPaginaUsuarios(usuarios, { pagina: 99, porPagina: 5 });
  assert.deepEqual([r.pagina, r.paginas, r.usuarios.length], [5, 5, 3]);
});

test("ordena por nombre como la app, sin repetir ni saltar entre páginas", () => {
  const desordenados = [
    { id: "c", nombre: "Zulema", email: "z@js.co" },
    { id: "a", nombre: "Álvaro", email: "a2@js.co" },
    { id: "b", nombre: "Álvaro", email: "a1@js.co" },
    { id: "d", nombre: "Beatriz", email: "b@js.co" }
  ];
  const todos = armarPaginaUsuarios(desordenados, { porPagina: 100 });
  assert.deepEqual(todos.usuarios.map(u => u.id), ["b", "a", "d", "c"]);
});

test("busca por nombre o correo sin tildes y filtra por rol, paginando el resultado", () => {
  const varios = [
    { id: "a", nombre: "Laura Gómez", email: "laura@js.co", rol: "admin" },
    { id: "b", nombre: "Andrés Mora", email: "andres@js.co", rol: "mensajero" },
    { id: "c", nombre: "Camila Ríos", email: "camila@js.co", rol: "asistente" },
    { id: "d", nombre: "Carlos Ruiz", email: "carlos@js.co", rol: "asistente" },
    { id: "e", nombre: "Tienda Aurora", email: "aurora@cliente.co", rol: "cliente" }
  ];
  assert.deepEqual(armarPaginaUsuarios(varios, { buscar: "andres" }).usuarios.map(u => u.id), ["b"]);
  assert.deepEqual(armarPaginaUsuarios(varios, { buscar: "GOMEZ" }).usuarios.map(u => u.id), ["a"]);
  assert.deepEqual(armarPaginaUsuarios(varios, { buscar: "js.co" }).total, 4);
  assert.deepEqual(armarPaginaUsuarios(varios, { rol: "asistente" }).usuarios.map(u => u.id), ["c", "d"]);
  assert.deepEqual(armarPaginaUsuarios(varios, { rol: "cliente", buscar: "aurora" }).usuarios.map(u => u.id), ["e"]);

  const pagina = armarPaginaUsuarios(varios, { rol: "asistente", pagina: 2, porPagina: 1 });
  assert.deepEqual([pagina.total, pagina.paginas, pagina.pagina, pagina.usuarios[0].id], [2, 2, 2, "d"]);
  assert.equal(armarPaginaUsuarios(varios, { buscar: "nadie" }).total, 0);
});

test("el tamaño queda entre 1 y 100 y la lista original no se modifica", () => {
  const copia = usuarios.map(u => u.id);
  assert.equal(armarPaginaUsuarios(usuarios, { porPagina: 500 }).porPagina, 100);
  assert.equal(armarPaginaUsuarios(usuarios, { porPagina: 0 }).porPagina, 10);
  assert.deepEqual(usuarios.map(u => u.id), copia);
});
