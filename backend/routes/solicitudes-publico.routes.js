/* "Solicitar envío" desde la landing: sin sesión. Se monta ANTES de `autenticar`, por eso lleva límites por IP,
   un tope global diario, campo trampa para robots y una respuesta que no devuelve ningún dato guardado. */
import { Router } from "express";
import * as C from "../controllers/solicitudes.controller.js";
import * as V from "../validators/solicitudes.validator.js";
import { validar } from "../middleware/validar.js";
import { limiteSolicitudHora, limiteSolicitudDia, limiteSolicitudGlobal } from "../middleware/seguridad.js";

const r = Router();
r.post("/", limiteSolicitudHora, limiteSolicitudDia, limiteSolicitudGlobal, validar({ body: V.crear }), C.crear);
export default r;
