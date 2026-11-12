import { Router } from "express";
import * as C from "../controllers/patinador.controller.js";
import * as V from "../validators/patinador.validator.js";
import { validar } from "../middleware/validar.js";
import { permitir, OFICINA } from "../middleware/autorizar.js";

// Caja del patinador. Solo él anota (en su propia caja); la oficina puede consultarla.
const r = Router();
r.get("/caja", permitir("patinador", OFICINA), validar({ query: V.caja }), C.caja);
r.post("/caja", permitir("patinador"), validar({ body: V.registro }), C.registrar);
export default r;
