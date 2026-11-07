import { Router } from "express";
import * as C from "../controllers/clientes.controller.js";
import * as V from "../validators/clientes.validator.js";
import { paramId } from "../validators/comunes.js";
import { validar } from "../middleware/validar.js";
import { permitir, OFICINA } from "../middleware/autorizar.js";

const r = Router();

r.get("/", permitir(OFICINA), validar({ query: V.listar }), C.listar);
r.get("/:id", permitir(OFICINA, "cliente"), validar({ params: paramId }), C.obtener);
r.post("/", permitir(OFICINA), validar({ body: V.crear }), C.crear);
r.patch("/:id", permitir(OFICINA), validar({ params: paramId, body: V.actualizar }), C.actualizar);
r.delete("/:id", permitir("admin"), validar({ params: paramId }), C.eliminar);

export default r;
