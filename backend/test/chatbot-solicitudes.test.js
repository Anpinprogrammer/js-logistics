/* Chatbot: solicitudes de envío con confirmación y evidencias (fotos y firma). Claude y Supabase Storage van simulados. */
process.env.SUPABASE_URL = "https://bucket-de-prueba.supabase.co";
process.env.SUPABASE_SERVICE_ROLE_KEY = "llave-de-prueba";
process.env.STORAGE_BUCKET = "pedidos";
process.env.CHATBOT_LIMITE_MINUTO = "100";
process.env.CHATBOT_PUBLICO_MINUTO = "100";
process.env.CHATBOT_BORRADORES_HORA = "4";
process.env.CHATBOT_SOLICITUDES_DIA = "3";

import { test, before, after } from "node:test";
import assert from "node:assert/strict";

const fetchReal = globalThis.fetch;
globalThis.fetch = async (url, op = {}) => {
  const u = new URL(url);
  if (u.host !== "bucket-de-prueba.supabase.co") return fetchReal(url, op);
  const { paths } = JSON.parse(op.body);
  return new Response(JSON.stringify(paths.map(path => ({ path, signedURL: `/object/sign/pedidos/${path}?token=t` }))), { status: 200, headers: { "Content-Type": "application/json" } });
};

const { pool, reiniciarBase, crearCuenta, sesion, request, app } = await import("./ayuda.js");
const Chat = await import("../servicios/chatbot.js");

function falso(guiones) {
  const llamadas = [];
  return {
    llamadas,
    messages: {
      stream(params) {
        llamadas.push(structuredClone(params));
        const g = guiones[llamadas.length - 1];
        return { on() {}, finalMessage: async () => ({ stop_reason: g.stop, content: g.content }) };
      }
    }
  };
}
const texto = t => ({ stop: "end_turn", content: [{ type: "text", text: t }] });
const usa = (name, input, id = "tu_1") => ({ stop: "tool_use", content: [{ type: "tool_use", id, name, input }] });
const hablar = (s, t = "hola") => s.post("/api/chatbot/mensajes").send({ mensajes: [{ rol: "user", contenido: t }] });

const ENVIO = { direccionRecogida: "Calle 5 # 10-20", destinatarioNombre: "Laura Gómez", destinatarioTelefono: "3105551234", direccionEntrega: "Carrera 40 # 3-15", paquetes: 2 };

let admin, a, b, ca, cb, ga, gb;
before(async () => {
  await reiniciarBase();
  await crearCuenta({ email: "admin@js.co", rol: "admin" });
  admin = await sesion("admin@js.co");
  const m = (await admin.post("/api/mensajeros").send({ nombre: "Carlos" })).body.mensajero;
  ca = (await admin.post("/api/clientes").send({ nombre: "Tienda A", telefono: "3001111111" })).body.cliente;
  cb = (await admin.post("/api/clientes").send({ nombre: "Tienda B", telefono: "3002222222" })).body.cliente;
  ga = (await admin.post("/api/pedidos").send({ mensajeroId: m.id, clienteId: ca.id })).body.pedido.guia;
  gb = (await admin.post("/api/pedidos").send({ mensajeroId: m.id, clienteId: cb.id })).body.pedido.guia;
  for (const [g, t] of [[ga, "salida"], [ga, "entrega"], [ga, "firma"], [gb, "salida"], [ga, "previa"]]) {
    await pool.query(`INSERT INTO pedido_archivos (guia, tipo, ruta) VALUES ($1, $2, $3)`, [g, t, `${g}/${t}.jpg`]);
  }
  await crearCuenta({ email: "a@js.co", rol: "cliente", clienteId: ca.id });
  await crearCuenta({ email: "b@js.co", rol: "cliente", clienteId: cb.id });
  a = await sesion("a@js.co");
  b = await sesion("b@js.co");
});
after(() => pool.end());

const solicitudes = () => pool.query(`SELECT * FROM solicitudes ORDER BY creado`).then(r => r.rows);

test("preparar_solicitud arma el borrador pero NO crea la solicitud", async () => {
  const f = falso([usa("preparar_solicitud", ENVIO), texto("Revisa el resumen y confirma")]);
  Chat.usarCliente(f);
  const r = await hablar(a, "quiero enviar 2 paquetes");
  assert.equal(r.status, 200);
  assert.ok(r.body.borrador.id);
  assert.equal(r.body.borrador.resumen.entrega, ENVIO.direccionEntrega);
  assert.equal(r.body.borrador.resumen.contacto, "Tienda A"); // nombre de la ficha
  assert.equal((await solicitudes()).length, 0);
  // el modelo no recibe el id del borrador
  assert.ok(!JSON.stringify(f.llamadas[1].messages.at(-1)).includes(r.body.borrador.id));
});

test("confirmar crea la solicitud a nombre de la cuenta, una sola vez, y queda registrada", async () => {
  Chat.usarCliente(falso([usa("preparar_solicitud", ENVIO), texto("ok")]));
  const { borrador } = (await hablar(a)).body;
  const c1 = await a.post(`/api/chatbot/borradores/${borrador.id}/confirmar`);
  assert.equal(c1.status, 201);
  const c2 = await a.post(`/api/chatbot/borradores/${borrador.id}/confirmar`); // doble clic o reintento
  assert.equal(c2.status, 201);
  assert.equal(c2.body.solicitud.repetida, true);
  const s = await solicitudes();
  assert.equal(s.length, 1);
  assert.equal(s[0].cliente_id, ca.id);
  assert.equal(s[0].origen, "portal");
  assert.equal(s[0].via_chatbot, true);
  const h = await pool.query(`SELECT accion FROM historial WHERE tabla = 'solicitudes' AND registro = $1`, [s[0].id]);
  assert.match(h.rows[0].accion, /asistente \(JSBot\)/);
});

test("otro cliente no puede confirmar ni cancelar un borrador ajeno (404)", async () => {
  Chat.usarCliente(falso([usa("preparar_solicitud", { ...ENVIO, direccionEntrega: "Avenida 6 # 20-1" }), texto("ok")]));
  const { borrador } = (await hablar(a)).body;
  assert.equal((await b.post(`/api/chatbot/borradores/${borrador.id}/confirmar`)).status, 404);
  assert.equal((await b.post(`/api/chatbot/borradores/${borrador.id}/cancelar`)).status, 404);
  assert.equal((await admin.post(`/api/chatbot/borradores/${borrador.id}/confirmar`)).status, 403);
  assert.equal((await a.post(`/api/chatbot/borradores/${borrador.id}/cancelar`)).status, 204);
  assert.equal((await a.post(`/api/chatbot/borradores/${borrador.id}/confirmar`)).status, 409); // ya cancelado
  assert.equal((await solicitudes()).length, 1);
});

test("faltan datos: el modelo recibe el error y no se crea borrador; no pasan campos inventados", async () => {
  const f = falso([usa("preparar_solicitud", { direccionRecogida: "Calle 1", destinatarioNombre: "X", direccionEntrega: "Calle 2", paquetes: 0, clienteId: cb.id }), texto("¿Cuántos paquetes?")]);
  Chat.usarCliente(f);
  const r = await hablar(a);
  assert.equal(r.body.borrador, null);
  const res = f.llamadas[1].messages.at(-1).content[0];
  assert.equal(res.is_error, true);
  assert.match(res.content, /paquetes/);
});

test("un borrador nuevo reemplaza al anterior y el vencido no se puede confirmar", async () => {
  Chat.usarCliente(falso([usa("preparar_solicitud", { ...ENVIO, direccionEntrega: "Calle 70 # 1-1" }), texto("1")]));
  const uno = (await hablar(b)).body.borrador;
  Chat.usarCliente(falso([usa("preparar_solicitud", { ...ENVIO, direccionEntrega: "Calle 71 # 1-1" }), texto("2")]));
  const dos = (await hablar(b)).body.borrador;
  assert.equal((await b.post(`/api/chatbot/borradores/${uno.id}/confirmar`)).status, 409);
  await pool.query(`UPDATE chatbot_borradores SET vence = now() - interval '1 minute' WHERE id = $1`, [dos.id]);
  const r = await b.post(`/api/chatbot/borradores/${dos.id}/confirmar`);
  assert.equal(r.status, 409);
  assert.equal(r.body.error.code, "BORRADOR_VENCIDO");
});

test("límite de borradores por hora", async () => {
  // b ya armó 2; a armó 3 (uno cancelado, uno confirmado, uno con error no cuenta) → se llega al tope de 4
  let ultimo;
  for (let i = 0; i < 4; i++) {
    Chat.usarCliente(falso([usa("preparar_solicitud", { ...ENVIO, direccionEntrega: `Calle ${i} # 1-1` }), texto("x")]));
    ultimo = await hablar(a);
  }
  assert.equal(ultimo.body.borrador, null);
  assert.ok(ultimo.body.derivar);
});

test("tope de solicitudes confirmadas por día", async () => {
  await pool.query(`UPDATE solicitudes SET via_chatbot = true`);
  for (let i = 0; i < 3; i++) await pool.query(`INSERT INTO solicitudes (id, nombre, telefono, email, direccion_recogida, paquetes, destinatario_nombre, direccion_entrega, origen, cliente_id, via_chatbot, estado) VALUES ($1,'x','1234567','a@a.co','r',1,'d','e','portal',$2,true,'rechazada')`, [`t${i}`, cb.id]);
  Chat.usarCliente(falso([usa("preparar_solicitud", { ...ENVIO, direccionEntrega: "Calle 99 # 1-1" }), texto("x")]));
  const { borrador } = (await hablar(b)).body;
  const r = await b.post(`/api/chatbot/borradores/${borrador.id}/confirmar`);
  assert.equal(r.status, 429);
});

test("mostrar_evidencias entrega fotos y firma firmadas al pantalla, sin pasarlas al modelo ni incluir las previas", async () => {
  const f = falso([usa("mostrar_evidencias", { guia: ga }), texto("Aquí están")]);
  Chat.usarCliente(f);
  const r = await hablar(a, "muéstrame las fotos");
  const items = r.body.archivos[0].items;
  assert.deepEqual(items.map(i => i.tipo).sort(), ["entrega", "firma", "recogida"]);
  assert.ok(items.every(i => i.url.startsWith("https://bucket-de-prueba.supabase.co/storage/v1/")));
  assert.equal(r.headers["cache-control"], "no-store");
  assert.ok(!JSON.stringify(f.llamadas[1].messages).includes("supabase.co"));
});

test("mostrar_evidencias de un pedido ajeno: error y nada de imágenes", async () => {
  const f = falso([usa("mostrar_evidencias", { guia: gb }), texto("No la encuentro")]);
  Chat.usarCliente(f);
  const r = await hablar(a);
  assert.equal(r.body.archivos, null);
  assert.equal(f.llamadas[1].messages.at(-1).content[0].is_error, true);
});

test("consultar_pedido informa qué evidencias existen, sin URL", async () => {
  const f = falso([usa("consultar_pedido", { guia: ga }), texto("ok")]);
  Chat.usarCliente(f);
  await hablar(a);
  const res = f.llamadas[1].messages.at(-1).content[0].content;
  const { pedido } = JSON.parse(res);
  assert.equal(pedido.evidencias.entrega.disponible, true);
  assert.ok(!res.includes("http"));
});

test("un visitante sin sesión no puede usar las herramientas nuevas ni ve fotos", async () => {
  for (const [nombre, entrada] of [["mostrar_evidencias", { guia: ga }], ["preparar_solicitud", ENVIO]]) {
    const f = falso([usa(nombre, entrada), texto("no")]);
    Chat.usarCliente(f);
    const r = await request(app).post("/api/chatbot/publico/mensajes").set("Origin", "http://localhost:5173").set("X-JSL", "1").send({ mensajes: [{ rol: "user", contenido: "hola" }] });
    assert.equal(r.status, 200);
    assert.ok(!f.llamadas[0].tools.some(t => t.name === nombre));
    assert.equal(f.llamadas[1].messages.at(-1).content[0].is_error, true);
    assert.ok(r.body.archivos == null);
    assert.ok(r.body.borrador == null);
  }
  assert.equal((await solicitudes()).filter(s => s.cliente_id === null).length, 0);
});
