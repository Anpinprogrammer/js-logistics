import { Router } from "express";
import * as C from "../controllers/auth.controller.js";
import * as V from "../validators/auth.validator.js";
import { validar } from "../middleware/validar.js";
import { autenticar } from "../middleware/autenticar.js";
import { limiteIngreso } from "../middleware/seguridad.js";

const r = Router();

r.post("/ingresar", limiteIngreso, validar({ body: V.ingreso }), C.ingresar);
r.post("/salir", C.salir);
r.post("/salir-de-todo", autenticar, C.salirDeTodo);
r.get("/yo", autenticar, C.yo);
r.post("/clave", autenticar, limiteIngreso, validar({ body: V.cambiarMiClave }), C.cambiarMiClave);

export default r;
