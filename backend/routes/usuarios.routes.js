import { Router } from "express";
import * as C from "../controllers/usuarios.controller.js";
import * as V from "../validators/usuarios.validator.js";
import { paramId } from "../validators/comunes.js";
import { validar } from "../middleware/validar.js";
import { permitir } from "../middleware/autorizar.js";

// Accesos a la app: todo es de administración.
const r = Router();
r.use(permitir("admin"));

r.get("/", C.listar);
r.post("/", validar({ body: V.crear }), C.crear);
r.patch("/:id", validar({ params: paramId, body: V.actualizar }), C.actualizar);
r.put("/:id/clave", validar({ params: paramId, body: V.nuevaClave }), C.cambiarClave);
r.delete("/:id", validar({ params: paramId }), C.eliminar);

export default r;
