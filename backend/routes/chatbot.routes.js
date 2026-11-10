/* Chat del cliente. Solo el rol cliente; límites por cuenta antes de gastar una llamada a Claude. */
import { Router } from "express";
import * as C from "../controllers/chatbot.controller.js";
import * as V from "../validators/chatbot.validator.js";
import { validar } from "../middleware/validar.js";
import { permitir } from "../middleware/autorizar.js";
import { limiteChatMinuto, limiteChatDia } from "../middleware/seguridad.js";

const r = Router();
r.post("/mensajes", permitir("cliente"), limiteChatMinuto, limiteChatDia, validar({ body: V.mensajes }), C.mensajes);
export default r;
