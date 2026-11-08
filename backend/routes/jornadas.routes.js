import { Router } from "express";
import * as C from "../controllers/sueldos.controller.js";
import * as V from "../validators/dinero.validator.js";
import { validar } from "../middleware/validar.js";
import { permitir, EQUIPO } from "../middleware/autorizar.js";

// Días de pago fijo y sueldo anterior. El :id del PUT se ignora: lo arma el servidor (persona_dia o persona_previo_semana).
const r = Router();
r.get("/", permitir(EQUIPO), C.listarJornadas);
r.put("/:id", permitir("admin"), validar({ params: V.paramId, body: V.jornada }), C.ponerJornada);
r.delete("/:id", permitir("admin"), validar({ params: V.paramId }), C.quitarJornada);
export default r;
