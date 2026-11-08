import { Router } from "express";
import * as C from "../controllers/datos.controller.js";
import * as V from "../validators/dinero.validator.js";
import { validar } from "../middleware/validar.js";
import { permitir, EQUIPO } from "../middleware/autorizar.js";

// Se monta en /api: historial, papelera, respaldo, sincronizar y eventos.
const r = Router(), id = { params: V.paramId };
r.get("/historial", permitir(EQUIPO), validar({ query: V.historial }), C.historial); // administración ve todo; los demás, lo suyo
r.post("/historial", permitir(EQUIPO), validar({ body: V.nota }), C.anotar);

r.get("/papelera", permitir("admin"), C.papelera);
r.post("/papelera/:id/restaurar", permitir("admin"), validar(id), C.restaurar);
r.delete("/papelera/:id", permitir("admin"), validar(id), C.eliminarDefinitivo);
r.delete("/papelera", permitir("admin"), C.vaciarPapelera);

r.get("/respaldo/exportar", permitir("admin"), C.exportar);
r.get("/respaldo/espacio", permitir("admin"), C.espacio);

r.get("/sincronizar", permitir(EQUIPO, "cliente"), C.sincronizar);
r.get("/eventos", permitir(EQUIPO, "cliente"), C.escuchar);
export default r;
