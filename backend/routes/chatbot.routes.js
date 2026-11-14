/* Chat del cliente. Solo el rol cliente; límites por cuenta antes de gastar una llamada a Claude.
   Los borradores de solicitud los arma el asistente, pero SOLO estos dos botones (Confirmar y Cancelar) los crean. */
import { Router } from "express";
import * as C from "../controllers/chatbot.controller.js";
import * as V from "../validators/chatbot.validator.js";
import { validar } from "../middleware/validar.js";
import { permitir } from "../middleware/autorizar.js";
import { limiteChatMinuto, limiteChatDia, limiteBorradorMinuto } from "../middleware/seguridad.js";

const r = Router();
r.post("/mensajes", permitir("cliente"), limiteChatMinuto, limiteChatDia, validar({ body: V.mensajes }), C.mensajes);
r.post("/borradores/:id/confirmar", permitir("cliente"), limiteBorradorMinuto, validar({ params: V.paramBorrador }), C.confirmarBorrador);
r.post("/borradores/:id/cancelar", permitir("cliente"), limiteBorradorMinuto, validar({ params: V.paramBorrador }), C.cancelarBorrador);
export default r;
