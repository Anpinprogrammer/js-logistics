import { Router } from "express";
import * as C from "../controllers/sueldos.controller.js";
import * as V from "../validators/dinero.validator.js";
import { validar } from "../middleware/validar.js";
import { permitir, EQUIPO } from "../middleware/autorizar.js";

const r = Router();
r.get("/semana", permitir("admin"), validar({ query: V.semana }), C.semana);
r.get("/mensajeros/:id", permitir(EQUIPO), validar({ params: V.paramId, query: V.semana }), C.deMensajero); // el mensajero, solo el suyo
export default r;
