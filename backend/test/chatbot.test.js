/* Chatbot: identidad siempre desde la sesión, herramientas, streaming, derivación y límites. Claude va simulado. */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";

process.env.CHATBOT_LIMITE_MINUTO = "20";
process.env.CHATBOT_PUBLICO_MINUTO = "6";
process.env.CHATBOT_WHATSAPP = "573001234567";
process.env.CHATBOT_INFO_ARCHIVO = "chatbot/informacion-empresa.md";
const { pool, reiniciarBase, crearCuenta, sesion, request, app, ORIGEN } = await import("./ayuda.js");
const Chat = await import("../servicios/chatbot.js");

/** Cliente de Anthropic falso: cada llamada a stream() consume el siguiente guion y guarda lo que recibió. */
function falso(guiones) {
  const llamadas = [];
  return {
    llamadas,
    messages: {
      stream(params) {
        llamadas.push(structuredClone(params));
        const g = guiones[llamadas.length - 1];
        if (g instanceof Error) return { on() {}, finalMessage: () => Promise.reject(g) };
        const oyentes = [];
        return {
          on: (ev, fn) => { if (ev === "text") oyentes.push(fn); },
          finalMessage: async () => { for (const t of g.textos ?? []) oyentes.forEach(f => f(t)); return { stop_reason: g.stop, content: g.content }; }
        };
      }
    }
  };
}
const texto = (...ts) => ({ stop: "end_turn", textos: ts, content: [{ type: "text", text: ts.join("") }] });
const usaHerramienta = (name, input, id = "tu_1") => ({ stop: "tool_use", content: [{ type: "tool_use", id, name, input }] });

let a, b, admin, ca, cb, ga, gb;
before(async () => {
  await reiniciarBase();
  await crearCuenta({ email: "admin@js.co", rol: "admin" });
  admin = await sesion("admin@js.co");
  const m = (await admin.post("/api/mensajeros").send({ nombre: "Carlos" })).body.mensajero;
  ca = (await admin.post("/api/clientes").send({ nombre: "Tienda A", telefono: "3001111111" })).body.cliente;
  cb = (await admin.post("/api/clientes").send({ nombre: "Tienda B", telefono: "3002222222" })).body.cliente;
  ga = (await admin.post("/api/pedidos").send({ mensajeroId: m.id, clienteId: ca.id, valorServicio: 8000, aCobrar: 50000 })).body.pedido.guia;
  gb = (await admin.post("/api/pedidos").send({ mensajeroId: m.id, clienteId: cb.id, valorServicio: 9000, aCobrar: 70000 })).body.pedido.guia;
  await crearCuenta({ email: "a@js.co", rol: "cliente", clienteId: ca.id });
  await crearCuenta({ email: "b@js.co", rol: "cliente", clienteId: cb.id });
  a = await sesion("a@js.co");
  b = await sesion("b@js.co");
});
after(() => pool.end());

const hablar = (s, texto = "hola", extra = {}) => s.post("/api/chatbot/mensajes").send({ mensajes: [{ rol: "user", contenido: texto }], ...extra });

test("solo el rol cliente puede usar el chat", async () => {
  Chat.usarCliente(falso([texto("hola")]));
  assert.equal((await hablar(admin)).status, 403);
});

test("valida la conversación: último mensaje del cliente, sin vacíos y sin campos extra", async () => {
  Chat.usarCliente(falso([]));
  const mal = [
    { mensajes: [{ rol: "assistant", contenido: "hola" }] },
    { mensajes: [{ rol: "user", contenido: "  " }] },
    { mensajes: [] },
    { mensajes: [{ rol: "user", contenido: "x".repeat(2001) }] },
    { mensajes: [{ rol: "user", contenido: "hola" }], clienteId: cb.id }
  ];
  for (const cuerpo of mal) assert.equal((await a.post("/api/chatbot/mensajes").send(cuerpo)).status, 400);
});

test("consultar_pedido devuelve el pedido propio y nunca campos internos", async () => {
  const f = falso([usaHerramienta("consultar_pedido", { guia: ga }), texto("Tu pedido va en ruta")]);
  Chat.usarCliente(f);
  const r = await hablar(a, "¿dónde está mi pedido?");
  assert.equal(r.status, 200);
  assert.equal(r.body.respuesta, "Tu pedido va en ruta");
  const resultado = f.llamadas[1].messages.at(-1).content[0];
  assert.equal(resultado.type, "tool_result");
  assert.equal(resultado.is_error, undefined);
  const datos = JSON.parse(resultado.content);
  assert.equal(datos.guia, ga);
  assert.equal(datos.aCobrar, 50000);
  for (const k of ["difCobro", "mensajeroId", "mensajeroNombre", "clienteId", "miniRuta"]) assert.ok(!(k in datos), k);
});

test("un cliente NO puede ver el pedido de otro aunque el modelo pida su guía", async () => {
  const f = falso([usaHerramienta("consultar_pedido", { guia: gb }), texto("No la encuentro")]);
  Chat.usarCliente(f);
  await hablar(a);
  const resultado = f.llamadas[1].messages.at(-1).content[0];
  assert.equal(resultado.is_error, true);
  assert.ok(!resultado.content.includes("70000") && !resultado.content.includes("Tienda B"));
});

test("el modelo no puede cambiar de cliente: los argumentos extra se ignoran y la lista sale de la sesión", async () => {
  const f = falso([usaHerramienta("listar_mis_pedidos", { clienteId: cb.id }), texto("listo")]);
  Chat.usarCliente(f);
  await hablar(a);
  const { pedidos } = JSON.parse(f.llamadas[1].messages.at(-1).content[0].content);
  assert.deepEqual(pedidos.map(p => p.guia), [ga]);
  // Ninguna herramienta declara un parámetro de cliente
  for (const h of Chat.HERRAMIENTAS) assert.ok(!Object.keys(h.input_schema.properties).some(k => /cliente|usuario|id$/i.test(k)), h.name);
});

test("el prompt lleva la información de la empresa con caché, y la parte variable va aparte", async () => {
  const f = falso([texto("hola")]);
  Chat.usarCliente(f);
  await hablar(a);
  const p = f.llamadas[0];
  assert.equal(p.model, "claude-haiku-5-5");
  assert.equal(p.system[0].cache_control.type, "ephemeral");
  assert.ok(p.system[0].text.includes("Horarios de atención"));
  assert.equal(p.system[1].cache_control, undefined);
  assert.ok(!("temperature" in p) && !("tool_choice" in p));
});

test("derivar_a_persona devuelve el enlace de WhatsApp", async () => {
  Chat.usarCliente(falso([usaHerramienta("derivar_a_persona", { motivo: "reclamo" }), texto("Te paso con una persona")]));
  const r = await hablar(a, "quiero poner un reclamo");
  assert.equal(r.body.derivar.canal, "whatsapp");
  assert.match(r.body.derivar.url, /^https:\/\/wa\.me\/573001234567\?text=/);
});

test("streaming: eventos texto, derivar y fin", async () => {
  Chat.usarCliente(falso([{ ...usaHerramienta("derivar_a_persona", { motivo: "x" }), textos: [] }, texto("Hola ", "mundo")]));
  const r = await a.post("/api/chatbot/mensajes").set("Accept", "text/event-stream").send({ mensajes: [{ rol: "user", contenido: "hola" }] }).buffer(true).parse((res, cb) => {
    let d = ""; res.on("data", c => (d += c)); res.on("end", () => cb(null, d));
  });
  assert.equal(r.status, 200);
  assert.match(r.headers["content-type"], /text\/event-stream/);
  assert.match(r.body, /event: texto\ndata: {"texto":"Hola "}/);
  assert.match(r.body, /event: texto\ndata: {"texto":"mundo"}/);
  assert.match(r.body, /event: derivar/);
  assert.match(r.body, /event: fin/);
});

test("si Claude falla responde 503 con la derivación a WhatsApp (sin filtrar el error)", async () => {
  Chat.usarCliente(falso([new Error("401 invalid x-api-key sk-ant-secreta")]));
  const r = await hablar(a);
  assert.equal(r.status, 503);
  assert.equal(r.body.error.code, "CHATBOT_NO_DISPONIBLE");
  assert.ok(r.body.error.detalle.derivar.url);
  assert.ok(!JSON.stringify(r.body).includes("sk-ant"));
});

test("sin ANTHROPIC_API_KEY responde 503 CHATBOT_NO_CONFIGURADO", async () => {
  Chat.usarCliente(null);
  const r = await hablar(a);
  assert.equal(r.status, 503);
  assert.equal(r.body.error.code, "CHATBOT_NO_CONFIGURADO");
});

test("límite por minuto por cuenta: una cuenta agotada no afecta a otra", async () => {
  Chat.usarCliente(falso(Array(40).fill(texto("ok"))));
  const codigos = [];
  for (let i = 0; i < 25; i++) codigos.push((await hablar(b)).status);
  assert.ok(codigos.includes(429), codigos.join());
  const r = await hablar(b);
  assert.equal(r.body.error.code, "CHAT_DEMASIADO_RAPIDO");
  assert.equal((await hablar(a)).status, 200); // la cuenta A tiene su propio contador
});

/* ---- Chat público (sin sesión) ---- */
const visitante = (texto = "hola") => request(app).post("/api/chatbot/publico/mensajes").set("Origin", ORIGEN).set("X-JSL", "1")
  .send({ mensajes: [{ rol: "user", contenido: texto }] });

test("público: sin sesión se puede hablar y solo recibe las herramientas públicas", async () => {
  const f = falso([texto("Atendemos de lunes a viernes")]);
  Chat.usarCliente(f);
  const r = await visitante("¿qué horario tienen?");
  assert.equal(r.status, 200);
  assert.equal(r.body.respuesta, "Atendemos de lunes a viernes");
  assert.deepEqual(f.llamadas[0].tools.map(t => t.name).sort(), ["consultar_estado_envio", "derivar_a_persona"]);
  assert.match(f.llamadas[0].system[1].text, /VISITANTE/);
});

test("público: el estado de un envío no incluye nombres, valores ni mensajero", async () => {
  const f = falso([usaHerramienta("consultar_estado_envio", { guia: ga }), texto("Va en ruta")]);
  Chat.usarCliente(f);
  await visitante("¿cómo va mi envío?");
  const resultado = f.llamadas[1].messages.at(-1).content[0];
  assert.equal(resultado.is_error, undefined);
  const datos = JSON.parse(resultado.content);
  assert.deepEqual(Object.keys(datos).sort(), ["entregadoODevueltoEn", "estado", "guia", "intentosDeEntrega", "salida"]);
  assert.ok(!/Tienda|Carlos|50000|8000|destinatario/i.test(resultado.content));
});

test("público: una guía que no existe se dice sin más datos", async () => {
  const f = falso([usaHerramienta("consultar_estado_envio", { guia: "JS-99999" }), texto("No la encuentro")]);
  Chat.usarCliente(f);
  await visitante();
  assert.equal(f.llamadas[1].messages.at(-1).content[0].is_error, true);
});

test("público: aunque el modelo invente consultar_pedido, sin sesión no devuelve nada", async () => {
  const f = falso([usaHerramienta("consultar_pedido", { guia: ga }), texto("Inicia sesión")]);
  Chat.usarCliente(f);
  await visitante();
  const resultado = f.llamadas[1].messages.at(-1).content[0];
  assert.equal(resultado.is_error, true);
  assert.ok(!resultado.content.includes(ga) && !resultado.content.includes("50000"));
});

test("público: estar logueado no cambia nada en esta ruta (siempre es visitante)", async () => {
  const f = falso([texto("ok")]);
  Chat.usarCliente(f);
  const r = await a.post("/api/chatbot/publico/mensajes").send({ mensajes: [{ rol: "user", contenido: "hola" }] });
  assert.equal(r.status, 200);
  assert.ok(!f.llamadas[0].tools.some(t => t.name === "consultar_pedido"));
});

test("público: exige la cabecera X-JSL (CSRF) y valida la conversación", async () => {
  Chat.usarCliente(falso([]));
  const sin = await request(app).post("/api/chatbot/publico/mensajes").set("Origin", ORIGEN).send({ mensajes: [{ rol: "user", contenido: "hola" }] });
  assert.equal(sin.status, 403);
  const mal = await request(app).post("/api/chatbot/publico/mensajes").set("Origin", ORIGEN).set("X-JSL", "1").send({ mensajes: [] });
  assert.equal(mal.status, 400);
});

test("público: límite por IP por minuto", async () => {
  Chat.usarCliente(falso(Array(40).fill(texto("ok"))));
  const codigos = [];
  for (let i = 0; i < 9; i++) codigos.push((await visitante()).status);
  assert.ok(codigos.includes(429), codigos.join());
  assert.equal((await visitante()).body.error.code, "CHAT_DEMASIADO_RAPIDO");
});
