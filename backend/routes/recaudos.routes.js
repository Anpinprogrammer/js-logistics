import { Router } from "express";
import * as C from "../controllers/recaudos.controller.js";
import * as V from "../validators/dinero.validator.js";
import { validar } from "../middleware/validar.js";
import { permitir, OFICINA, EQUIPO } from "../middleware/autorizar.js";

// Dinero que entregan los mensajeros. El mensajero solo ve lo suyo (el filtro lo pone el servidor).
const r = Router();
r.get("/", permitir(EQUIPO), C.listar);
r.post("/", permitir(OFICINA), validar({ body: V.recaudo }), C.crear);
r.patch("/:id", permitir(OFICINA), validar({ params: V.paramId, body: V.recaudo }), C.actualizar);
r.delete("/:id", permitir("admin"), validar({ params: V.paramId }), C.eliminar);
export default r;
