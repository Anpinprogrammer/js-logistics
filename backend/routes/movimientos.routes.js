import { Router } from "express";
import * as C from "../controllers/movimientos.controller.js";
import * as V from "../validators/dinero.validator.js";
import { validar } from "../middleware/validar.js";
import { permitir, OFICINA } from "../middleware/autorizar.js";

// Movimientos de la cuenta de los clientes. El cliente ve los suyos en GET /clientes/:id/movimientos.
const r = Router();
r.get("/", permitir(OFICINA), C.listar);
r.post("/", permitir(OFICINA), validar({ body: V.movimiento }), C.crear);
r.post("/reversar", permitir(OFICINA), validar({ body: V.reversar }), C.reversar);
r.patch("/:id", permitir(OFICINA), validar({ params: V.paramId, body: V.movimiento }), C.actualizar);
r.delete("/:id", permitir(OFICINA), validar({ params: V.paramId }), C.eliminar);
export default r;
