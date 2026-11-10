/* Chat del cliente. POST /api/chatbot/mensajes
   - Con `Accept: text/event-stream` responde en streaming (SSE): eventos `texto`, `derivar`, `fin` y `error`.
   - Sin eso, responde JSON { respuesta, derivar } cuando termina.
   La identidad sale de la sesión (req.usuario); el cuerpo solo trae la conversación. */
import { responder, derivacion } from "../servicios/chatbot.js";
import { prohibido, HttpError } from "../helpers/errores.js";
import { env } from "../config/env.js";

const evento = (res, nombre, datos) => res.write(`event: ${nombre}\ndata: ${JSON.stringify(datos)}\n\n`);

/** Con sesión (rol cliente): ve sus pedidos. Público: `publico` = true, sin sesión y sin datos personales. */
const atender = publico => async (req, res) => {
  // En el chat público se ignora cualquier cookie: es siempre un visitante.
  const u = publico ? null : req.usuario;
  if (publico && !env.CHATBOT_PUBLICO_ACTIVO)
    throw new HttpError(503, "CHATBOT_NO_DISPONIBLE", "El asistente no está disponible. Escríbenos por WhatsApp.", undefined, { derivar: derivacion() });
  if (!publico && !u.clienteId) throw prohibido("Tu cuenta no está vinculada con un cliente");
  const { mensajes } = req.valido.body;

  const abortar = new AbortController();
  res.on("close", () => { if (!res.writableFinished) abortar.abort(); }); // si el cliente se va, se deja de gastar
  const streaming = (req.get("accept") ?? "").includes("text/event-stream");

  if (!streaming) {
    const r = await responder({ usuario: u, mensajes, signal: abortar.signal });
    return res.json({ respuesta: r.texto, derivar: r.derivar });
  }

  let abierto = false;
  const abrir = () => {
    if (abierto) return;
    abierto = true;
    res.writeHead(200, { "Content-Type": "text/event-stream; charset=utf-8", "Cache-Control": "no-cache, no-transform", Connection: "keep-alive", "X-Accel-Buffering": "no" });
  };
  try {
    const r = await responder({ usuario: u, mensajes, signal: abortar.signal, onTexto: t => { abrir(); evento(res, "texto", { texto: t }); } });
    abrir();
    if (r.derivar) evento(res, "derivar", r.derivar);
    evento(res, "fin", {});
    res.end();
  } catch (e) {
    if (!abierto) throw e; // antes de abrir el flujo, el manejador central responde con JSON y el código HTTP
    console.error("Chatbot:", e.message);
    evento(res, "error", { code: e.code ?? "ERROR_INTERNO", message: e.status ? e.message : "El asistente falló. Intenta de nuevo.", derivar: e.detalle?.derivar ?? null });
    res.end();
  }
};

export const mensajes = atender(false);
export const publico = atender(true);
