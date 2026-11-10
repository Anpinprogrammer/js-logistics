import { Router } from "express";
import * as C from "../controllers/mensajeros.controller.js";
import * as V from "../validators/mensajeros.validator.js";
import { paramId } from "../validators/comunes.js";
import { validar } from "../middleware/validar.js";
import { permitir, OFICINA, EQUIPO } from "../middleware/autorizar.js";
import * as L from "../controllers/liquidaciones.controller.js";

const r = Router();

r.get("/", permitir(OFICINA), C.listar);
r.get("/resumen", permitir(OFICINA), L.resumen);                              // período abierto de cada repartidor (pestaña Caja)
r.get("/:id/periodo", permitir(EQUIPO), validar({ params: paramId }), L.periodo); // el mensajero, solo el suyo
r.get("/pagina", permitir(OFICINA), validar({ query: V.paginaPersonal }), C.pagina);
r.get("/:id", permitir(OFICINA, "mensajero"), validar({ params: paramId }), C.obtener);
r.post("/", permitir("admin"), validar({ body: V.crear }), C.crear);
r.patch("/:id", permitir("admin"), validar({ params: paramId, body: V.actualizar }), C.actualizar);
r.delete("/:id", permitir("admin"), validar({ params: paramId }), C.eliminar);

export default r;
