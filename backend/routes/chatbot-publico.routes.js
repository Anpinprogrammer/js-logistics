/* Chat público: sin sesión. Solo información general y el estado general de un envío (sin nombres ni dinero).
   Se monta ANTES de `autenticar`; por eso lleva límites por IP y un tope global diario. */
import { Router } from "express";
import * as C from "../controllers/chatbot.controller.js";
import * as V from "../validators/chatbot.validator.js";
import { validar } from "../middleware/validar.js";
import { limitePublicoMinuto, limitePublicoDia, limitePublicoGlobal } from "../middleware/seguridad.js";

const r = Router();
r.post("/mensajes", limitePublicoMinuto, limitePublicoDia, limitePublicoGlobal, validar({ body: V.mensajes }), C.publico);
export default r;
