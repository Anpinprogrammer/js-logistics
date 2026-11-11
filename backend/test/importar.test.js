/* Importación de la exportación de Firestore (db/importar-firestore.js) con una carpeta de ejemplo
   que tiene la misma forma que escribe la app vieja. Supabase Storage se simula en memoria. */
process.env.SUPABASE_URL = "https://bucket-de-prueba.supabase.co";
process.env.SUPABASE_SERVICE_ROLE_KEY = "llave-de-prueba";

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const bucket = new Map();
globalThis.fetch = async (url, op = {}) => {
  const u = new URL(url);
  if (u.pathname.startsWith("/storage/v1/object/pedidos/") && op.method === "POST") {
    bucket.set(u.pathname.slice("/storage/v1/object/pedidos/".length), op.headers["Content-Type"]);
    return new Response("{}", { status: 200 });
  }
  return new Response("{}", { status: 400 });
};

const { pool, reiniciarBase } = await import("./ayuda.js");
const { importar, fecha, diaColombia } = await import("../db/importar-firestore.js");
const { verificar } = await import("../db/verificar-migracion.js");
const { hashClave } = await import("../helpers/claves.js");

const T = Date.parse("2026-10-20T15:00:00Z"), H = 3_600_000;
const PNG = "data:image/png;base64," + Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(40, 7)]).toString("base64");
const PNG2 = "data:image/png;base64," + Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(40, 9)]).toString("base64");

function exportacion() {
  return {
    auth: [{ id: "uAdmin", datos: { email: "dueno@js.co", desactivada: false } }, { id: "uMen", datos: { email: "andres@js.co" } },
      { id: "uEx", datos: { email: "ex@js.co", desactivada: true } }, { id: "uCli", datos: { email: "tienda@js.co" } }],
    admins: [{ id: "uAdmin", datos: { uid: "uAdmin" } }],
    usuarios: [
      { id: "uAdmin", datos: { email: "dueno@js.co", nombre: "Javier", rol: "admin" } },
      { id: "uMen", datos: { email: "Andres@JS.co", nombre: "Andrés", rol: "mensajero" } },
      { id: "uEx", datos: { email: "ex@js.co", nombre: "Ex", rol: "mensajero" } },
      { id: "uCli", datos: { email: "tienda@js.co", nombre: "Moda Bella", rol: "cliente", clienteId: "c1" } },
      { id: "sinCorreo", datos: { nombre: "Raro", rol: "asistente" } }
    ],
    vinculos: [{ id: "uMen", datos: { mensajeroId: "m1" } }],
    meta: [{ id: "contador", datos: { n: 7 } }, { id: "caja", datos: { corte: T + 48 * H } }],
    mensajeros: [{ id: "m1", datos: { nombre: "Andrés Mora", telefono: "310", tipo: "mensajero", tarifa: 0 } },
      { id: "m2", datos: { nombre: "Patricia", tipo: "patinador", tarifa: 45000 } }],
    clientes: [{ id: "c1", datos: { nombre: "Moda Bella", telefono: "3104567890", tarifa: 8000 } }],
    cuentas: [{ id: "k1", datos: { nombre: "JS Envíos", tipo: "socio", creado: T } }],
    pedidos: [
      { id: "JS-00001", datos: { n: 1, estado: "entregado", creado: T, mensajeroId: "m1", clienteId: "c1", mini: PNG, valorServicio: 8000, aCobrar: 50000,
        entregado: T + 3 * H, destinatario: "Laura", valorCobrado: 45000, metodo: "efectivo", difCobro: -5000, entregoUid: "uMen",
        intentos: [{ fecha: T + H, motivo: "no_contesta", nota: "llamé" }, { fecha: T + 2 * H, motivo: "inventado" }], domiPagado: true, domiPagoMedio: "nequi", domiPagoValor: 8000 } },
      { id: "JS-00002", datos: { n: 2, estado: "devuelto", creado: T, mensajeroId: "fantasma", clienteId: "", metodo: "devuelto", motivoDev: "rechazo", aCobrar: -10 } },
      { id: "JS-00003", datos: { n: 3, estado: "pendiente", creado: T, mensajeroId: "m1", entregado: null } }
    ],
    fotos: [{ id: "JS-00001", datos: { salida: PNG } }, { id: "JS-99999", datos: { salida: PNG } }],
    entregas: [{ id: "JS-00001", datos: { foto: PNG2, firma: "", previas: [{ foto: PNG, firma: "no es imagen" }] } }],
    movimientos: [
      { id: "mv1", datos: { clienteId: "c1", tipo: "pago_a_cliente", valor: 30000, medio: "nequi", fecha: T, porUid: "uAdmin" } },
      { id: "mv2", datos: { clienteId: "c1", tipo: "pago_de_cliente", valor: 30000, medio: "nequi", reversoDe: "mv1", fecha: T + H, porUid: "borrado" } },
      { id: "huerfano", datos: { clienteId: "c9", tipo: "abono", valor: 1000, fecha: T } }
    ],
    recaudos: [{ id: "r1", datos: { mensajeroId: "m1", valor: 45000, medio: "", fecha: T } },
      { id: "r9", datos: { mensajeroId: "m9", valor: 20000, medio: "nequi", fecha: T } }],
    liquidaciones: [{ id: "m1_1", datos: { mensajeroId: "m1", fecha: T + 5 * H, desde: T - 24 * H, entregas: 1, guias: ["JS-00001"], debe: -2000, ajuste: 1000 } }],
    cajamovs: [
      { id: "a1", datos: { tipo: "sale", cat: "adelanto", personaId: "m1", valor: 2000, medio: "efectivo", fecha: T, deLiquidacion: "m1_1", devuelto: 1000 } },
      { id: "d1", datos: { tipo: "entra", cat: "devolucion", personaId: "m1", valor: 1000, medio: "efectivo", adelantoId: "a1", fecha: T } },
      { id: "q1", datos: { tipo: "marca", cat: "arqueo", valor: 0, medio: "", esperado: { efectivo: 100 }, contado: { efectivo: 90 }, fecha: T } },
      { id: "raro", datos: { tipo: "entra", cat: "propina", valor: 5, fecha: T } }
    ],
    jornadas: [{ id: "m2_2026-10-20", datos: { personaId: "m2", dia: "2026-10-20", valor: 45000 } },
      { id: "m2_previo_2026-10-12", datos: { personaId: "m2", dia: "2026-10-12", valor: 90000, previo: true } }],
    historial: [{ id: "2026-10-20_uMen", datos: { uid: "uMen", e: [{ t: T, a: "Creó la guía JS-00001", u: "uMen" }, { t: T + H, a: "Entregó JS-00001" }] } }],
    papelera: [{ id: "p1", datos: { col: "clientes", docId: "c7", data: { nombre: "Borrado" }, fecha: T, uid: "uAdmin" } },
      { id: "p3", datos: { col: "mensajeros", docId: "m9", data: { id: "m9", nombre: "Carlos (ya no trabaja)", tipo: "mensajero" }, fecha: T, uid: "uAdmin" } },
      { id: "p2", datos: { col: "vinculos", docId: "x", data: {} } }]
  };
}

let carpeta;
async function escribir(datos) {
  for (const [c, docs] of Object.entries(datos)) await writeFile(join(carpeta, `${c}.jsonl`), docs.map(d => JSON.stringify(d)).join("\n") + "\n");
  await writeFile(join(carpeta, "manifiesto.json"), JSON.stringify({ proyecto: "js-logistics-299ce", fecha: new Date(T).toISOString(), colecciones: {} }));
}
const uno = async (sql, v) => (await pool.query(sql, v)).rows[0];
const cuantos = async t => Number((await uno(`SELECT count(*) AS n FROM ${t}`)).n);
const silencio = () => {};

before(async () => {
  await reiniciarBase();
  carpeta = await mkdtemp(join(tmpdir(), "jsl-exportacion-"));
  await escribir(exportacion());
});
after(async () => { await rm(carpeta, { recursive: true, force: true }); await pool.end(); });

test("conversiones: fechas en ms y días de Colombia", () => {
  assert.equal(fecha(0), null);
  assert.equal(fecha(""), null);
  assert.equal(fecha(T).toISOString(), "2026-10-20T15:00:00.000Z");
  assert.equal(diaColombia(new Date("2026-10-21T03:00:00Z")), "2026-10-20"); // 10 p. m. en Cali todavía es el 20
});

test("la simulación no guarda nada", async () => {
  const inf = await importar({ carpeta, simular: true, log: silencio });
  assert.equal(inf.colecciones.pedidos.importados, 3);
  assert.equal(await cuantos("pedidos"), 0);
  assert.equal(bucket.size, 0);
});

test("importa todo con las relaciones, limpia lo inválido y lo reporta", async () => {
  const inf = await importar({ carpeta, log: silencio });
  const c = inf.colecciones;
  assert.equal(c.usuarios.importados, 4);
  assert.deepEqual(c.usuarios.avisos["sin correo"], ["sinCorreo"]);
  assert.deepEqual(c.movimientos.avisos["cliente que no existe"], ["huerfano"]);
  assert.deepEqual(c.cajamovs.avisos["categoría desconocida (propina)"], ["raro"]);
  assert.deepEqual(c.papelera.avisos["colección sin tabla en el sistema nuevo"], ["p2"]);
  assert.deepEqual(c.mensajeros.avisos["persona quitada en la app vieja con registros: queda inactiva para conservarlos"].sort(), ["fantasma", "m9"]);

  // Cuentas: rol, vínculo con Personal, desactivadas y SIN contraseña (las de Firebase no se pueden pasar).
  const men = await uno(`SELECT * FROM usuarios WHERE id = 'uMen'`);
  assert.equal(men.email, "andres@js.co");
  assert.equal(men.mensajero_id, "m1");
  assert.equal(men.clave_hash, null);
  assert.equal((await uno(`SELECT activo FROM usuarios WHERE id = 'uEx'`)).activo, false);
  assert.equal((await uno(`SELECT cliente_id FROM usuarios WHERE id = 'uCli'`)).cliente_id, "c1");

  // Personal quitado en la app vieja: inactivo, con el nombre de la papelera, y su plata se conserva.
  const m9 = await uno(`SELECT * FROM mensajeros WHERE id = 'm9'`);
  assert.equal(m9.activo, false);
  assert.equal(m9.nombre, "Carlos (ya no trabaja)");
  assert.equal(Number((await uno(`SELECT valor FROM recaudos WHERE id = 'r9'`)).valor), 20000);
  assert.equal((await uno(`SELECT nombre FROM mensajeros WHERE id = 'fantasma'`)).nombre, "Persona retirada (fantasma)");

  // Pedidos: valores, intentos válidos, mensajero quitado → se conserva (inactivo), negativos → 0.
  const p1 = await uno(`SELECT * FROM pedidos WHERE guia = 'JS-00001'`);
  assert.equal(Number(p1.dif_cobro), -5000);
  assert.equal(p1.domi_pago_medio, "nequi");
  assert.equal(p1.entrego_uid, "uMen");
  assert.equal(await cuantos("pedido_intentos"), 1);
  const p2 = await uno(`SELECT * FROM pedidos WHERE guia = 'JS-00002'`);
  assert.equal(p2.mensajero_id, "fantasma");
  assert.equal(p2.cliente_id, null);
  assert.equal(Number(p2.a_cobrar), 0);
  assert.ok(p2.entregado, "una devuelta sin hora queda con la de salida");
  assert.equal(Number((await uno(`SELECT n FROM contadores WHERE nombre = 'guia'`)).n), 7); // la próxima guía será JS-00008

  // Dinero
  assert.equal((await uno(`SELECT reverso_de FROM movimientos WHERE id = 'mv2'`)).reverso_de, "mv1");
  assert.equal((await uno(`SELECT por_uid FROM movimientos WHERE id = 'mv2'`)).por_uid, null);
  assert.equal((await uno(`SELECT medio FROM recaudos WHERE id = 'r1'`)).medio, "efectivo");
  const liq = await uno(`SELECT * FROM liquidaciones WHERE id = 'm1_1'`);
  assert.equal(Number(liq.ajuste), 1000);
  assert.equal(liq.dia, "2026-10-20");
  assert.deepEqual(liq.guias, ["JS-00001"]);
  const a1 = await uno(`SELECT * FROM cajamovs WHERE id = 'a1'`);
  assert.equal(a1.de_liquidacion, "m1_1"); // el ID de la liquidación, como en la app
  assert.equal(a1.extra.liquidacionId, undefined);
  assert.equal((await uno(`SELECT adelanto_id FROM cajamovs WHERE id = 'd1'`)).adelanto_id, "a1");
  assert.deepEqual((await uno(`SELECT extra FROM cajamovs WHERE id = 'q1'`)).extra, { esperado: { efectivo: 100 }, contado: { efectivo: 90 } });
  const prev = await uno(`SELECT * FROM jornadas WHERE previo`);
  assert.equal(prev.dia, null);
  assert.equal(prev.semana, "2026-10-12");
  assert.equal((await uno(`SELECT valor FROM ajustes WHERE clave = 'caja'`)).valor.corte, new Date(T + 48 * H).toISOString());

  // Historial y papelera
  assert.equal(await cuantos("historial"), 2);
  assert.equal((await uno(`SELECT tabla, registro FROM papelera`)).registro, "c7");

  // Fotos: mini, salida, entrega y la previa válida; la de una guía que no existe y la firma inválida no.
  const tipos = (await pool.query(`SELECT tipo FROM pedido_archivos ORDER BY tipo`)).rows.map(r => r.tipo);
  assert.deepEqual(tipos, ["entrega", "mini", "previa", "salida"]);
  assert.equal(bucket.size, 4);
});

test("se puede repetir: actualiza lo que cambió y no duplica nada", async () => {
  const datos = exportacion();
  datos.clientes[0].datos.telefono = "3000000000";
  datos.pedidos[2].datos.estado = "entregado";
  datos.pedidos[2].datos.entregado = T + 50 * H;
  datos.entregas.push({ id: "JS-00003", datos: { foto: PNG2 } });
  await escribir(datos);
  await importar({ carpeta, log: silencio });
  assert.equal((await uno(`SELECT telefono FROM clientes WHERE id = 'c1'`)).telefono, "3000000000");
  assert.equal((await uno(`SELECT estado FROM pedidos WHERE guia = 'JS-00003'`)).estado, "entregado");
  assert.equal(await cuantos("pedido_intentos"), 1);
  assert.equal(await cuantos("historial"), 2);
  assert.equal(await cuantos("papelera"), 2);
  assert.equal(await cuantos("pedido_archivos"), 5); // solo la foto nueva de JS-00003
});

test("--reemplazar quita lo borrado en Firebase, conserva las contraseñas puestas en el sistema nuevo y no vuelve a subir fotos", async () => {
  await pool.query(`UPDATE usuarios SET clave_hash = $1 WHERE id = 'uAdmin'`, [await hashClave("clave-del-sistema-nuevo")]);
  await pool.query(`UPDATE usuarios SET clave_hash = $1, version_sesion = 3 WHERE id = 'uCli'`, [await hashClave("clave-del-cliente")]);
  bucket.clear();
  const datos = exportacion();
  datos.pedidos = datos.pedidos.filter(p => p.id !== "JS-00002");
  await escribir(datos);
  await importar({ carpeta, reemplazar: true, log: silencio });
  assert.equal(await cuantos("pedidos"), 2);
  assert.ok((await uno(`SELECT clave_hash FROM usuarios WHERE id = 'uAdmin'`)).clave_hash);
  assert.equal(await cuantos("usuarios"), 4);
  const cli = await uno(`SELECT clave_hash, version_sesion FROM usuarios WHERE id = 'uCli'`);
  assert.ok(cli.clave_hash, "el cliente que ya activó su cuenta no la pierde");
  assert.equal(cli.version_sesion, 3);
  assert.equal(bucket.size, 0, "las fotos que ya estaban en Storage no se suben otra vez");
  assert.equal(await cuantos("pedido_archivos"), 4); // las de la exportación de nuevo (sin la foto agregada en la prueba anterior)
});

test("verificación: con datos limpios da igual que la app vieja, y señala lo que se omitió", async () => {
  const datos = exportacion();
  datos.usuarios = datos.usuarios.filter(u => u.id !== "sinCorreo");
  datos.pedidos = datos.pedidos.filter(p => p.id !== "JS-00002"); // cerrada sin hora: la app vieja ni la puede calcular
  datos.pedidos[0].datos.intentos.pop();
  datos.movimientos = datos.movimientos.filter(m => m.id !== "huerfano");
  datos.cajamovs = datos.cajamovs.filter(c => c.id !== "raro");
  datos.recaudos[0].datos.medio = "efectivo";
  await escribir(datos);
  await importar({ carpeta, reemplazar: true, conFotos: false, log: silencio });
  const r = await verificar({ carpeta });
  assert.deepEqual(r.diferencias, []);
  assert.equal(r.postgres.debeMensajeros.m9, undefined, "la persona quitada no cuenta, igual que en la app");
  assert.equal(r.postgres.caja.porMedio.nequi, r.firebase.caja.porMedio.nequi); // incluye los $20.000 que entregó m9

  // Un movimiento de caja que la importación omite aparece como diferencia en la caja y en los conteos.
  datos.cajamovs.push({ id: "raro", datos: { tipo: "entra", cat: "propina", valor: 5, medio: "efectivo", fecha: T } });
  await escribir(datos);
  await importar({ carpeta, conFotos: false, log: silencio });
  const r2 = await verificar({ carpeta });
  assert.deepEqual(r2.diferencias.map(d => d.dato).sort(), ["caja.disponible", "caja.porMedio.efectivo", "caja.total", "conteos.cajamovs"]);
});

test("ensayo con datos generados como los de la app (varias semillas, con una persona quitada): todo da igual", async () => {
  const { generarDatos } = await import("./generador.js");
  await reiniciarBase();
  for (const semilla of [3, 7, 21]) {
    const S = generarDatos(semilla, Date.now());
    S.usuarios.cl.email = "cliente@x.co"; // en Firebase toda cuenta tiene correo
    delete S.mensajeros.m3; // "Quitar" en Personal: sus pedidos, pagos y liquidaciones se quedan
    // La app vieja dejaba guardar valores negativos; la importación los pone en 0 y los lista en el informe
    // (cambian el saldo del cliente: hay que corregirlos en la app vieja antes del cambio). Aquí se limpian antes.
    const negativos = Object.values(S.pedidos).filter(p => ["valorServicio", "aCobrar", "valorCobrado", "gasto"].some(k => Number(p[k]) < 0));
    for (const p of negativos) for (const k of ["valorServicio", "aCobrar", "valorCobrado", "gasto"]) if (Number(p[k]) < 0) p[k] = 0;
    const datos = { admins: [{ id: "ad", datos: { uid: "ad" } }], meta: [{ id: "caja", datos: { corte: 0 } }],
      auth: Object.values(S.usuarios).map(u => ({ id: u.uid, datos: { email: u.email } })) };
    for (const [c, docs] of Object.entries(S)) datos[c] = Object.entries(docs).map(([id, d]) => ({ id, datos: d }));
    await escribir(datos);
    await importar({ carpeta, reemplazar: true, conFotos: false, log: silencio });
    const r = await verificar({ carpeta });
    assert.deepEqual(r.diferencias, [], `semilla ${semilla}`);
    assert.ok(r.firebase.conteos.pedidos > 400);
  }
});
