/* Solicitudes de envío: las atiende la oficina (administración y asistentes). */
import { Router } from "express";
import * as C from "../controllers/solicitudes.controller.js";
import * as V from "../validators/solicitudes.validator.js";
import { paramId } from "../validators/comunes.js";
import { validar } from "../middleware/validar.js";
import { permitir, OFICINA } from "../middleware/autorizar.js";

const r = Router();
r.get("/", permitir(OFICINA), validar({ query: V.listar }), C.listar);
r.get("/:id", permitir(OFICINA), validar({ params: paramId }), C.obtener);
r.post("/:id/aceptar", permitir(OFICINA), validar({ params: paramId, body: V.aceptar }), C.aceptar);
r.post("/:id/confirmar", permitir(OFICINA), validar({ params: paramId }), C.confirmar);
r.post("/:id/rechazar", permitir(OFICINA), validar({ params: paramId, body: V.rechazar }), C.rechazar);
r.post("/:id/asignar", permitir(OFICINA), validar({ params: paramId, body: V.asignar }), C.asignar);
export default r;
