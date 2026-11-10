import { Router } from "express";
import * as C from "../controllers/liquidaciones.controller.js";
import * as V from "../validators/dinero.validator.js";
import { validar } from "../middleware/validar.js";
import { permitir, EQUIPO } from "../middleware/autorizar.js";

const r = Router();
r.get("/", permitir(EQUIPO), C.listar);
r.get("/pagina", permitir("admin"), validar({ query: V.liquidacionesPagina }), C.pagina);
r.post("/", permitir("admin"), validar({ body: V.liquidacion }), C.crear);
r.patch("/:id", permitir("admin"), validar({ params: V.paramId, body: V.ajusteLiquidacion }), C.ajustar); // compatibilidad: no cambia nada
r.delete("/:id", permitir("admin"), validar({ params: V.paramId }), C.reabrir);
export default r;
