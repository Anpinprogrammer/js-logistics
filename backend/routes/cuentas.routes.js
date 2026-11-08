import { Router } from "express";
import * as C from "../controllers/cuentas.controller.js";
import * as V from "../validators/dinero.validator.js";
import { validar } from "../middleware/validar.js";
import { permitir, OFICINA } from "../middleware/autorizar.js";

// Cuentas internas: socios (JS Envíos, MT) y la base de JS.
const r = Router();
r.get("/", permitir(OFICINA), C.listar);
r.post("/", permitir("admin"), validar({ body: V.cuenta }), C.crear);
r.post("/iniciales", permitir("admin"), C.iniciales);
r.post("/:id/movimientos", permitir(OFICINA), validar({ params: V.paramId, body: V.movCuenta }), C.movimiento);
export default r;
