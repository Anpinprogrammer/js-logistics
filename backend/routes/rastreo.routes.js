/* Rastreo público: sin sesión. Se monta ANTES de `autenticar`, por eso lleva límites por IP y un tope global diario
   (las guías son consecutivas: sin límites alguien podría barrerlas todas). */
import { Router } from "express";
import * as C from "../controllers/rastreo.controller.js";
import * as V from "../validators/rastreo.validator.js";
import { validar } from "../middleware/validar.js";
import { limiteRastreoMinuto, limiteRastreoDia, limiteRastreoGlobal } from "../middleware/seguridad.js";

const r = Router();
r.get("/:guia", limiteRastreoMinuto, limiteRastreoDia, limiteRastreoGlobal, validar({ params: V.paramGuia }), C.obtener);
export default r;
