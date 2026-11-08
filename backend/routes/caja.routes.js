import { Router } from "express";
import * as C from "../controllers/caja.controller.js";
import * as V from "../validators/dinero.validator.js";
import { validar } from "../middleware/validar.js";
import { permitir, OFICINA, EQUIPO } from "../middleware/autorizar.js";

const r = Router(), id = { params: V.paramId }, uid = { params: V.paramUid };
r.get("/resumen", permitir("admin"), C.resumen);
r.get("/libro", permitir("admin"), validar({ query: V.diaQuery }), C.libro);
r.get("/cierre-del-dia", permitir("admin"), C.cierreDelDia);
r.get("/corte", permitir(OFICINA), C.corte);

r.get("/movimientos", permitir(EQUIPO), C.listar);
r.post("/movimientos", permitir(OFICINA), validar({ body: V.cajaMov }), C.crear);
r.patch("/movimientos/:id", permitir("admin"), validar({ ...id, body: V.devuelto }), C.actualizar);
r.delete("/movimientos/:id", permitir("admin"), validar(id), C.eliminar);

r.post("/bases", permitir(OFICINA), validar({ body: V.base }), C.base);

r.get("/oficinas", permitir("admin"), validar({ query: V.diaQuery }), C.oficinas);
r.get("/oficinas/:uid", permitir(OFICINA), validar({ ...uid, query: V.diaQuery }), C.oficina);
r.post("/oficinas/:uid/base", permitir("admin"), validar({ ...uid, body: V.baseOficina }), C.baseOficina);
r.post("/oficinas/:uid/cierre", permitir("admin"), validar({ ...uid, body: V.cierreOficina }), C.cierreOficina);

r.get("/arqueo/esperado", permitir("admin"), C.esperado);
r.get("/arqueos", permitir("admin"), C.arqueos);
r.post("/arqueos", permitir("admin"), validar({ body: V.arqueo }), C.arquear);
r.delete("/arqueos/:id", permitir("admin"), validar(id), C.deshacerArqueo);

r.post("/adelantos/:id/devolucion", permitir("admin"), validar({ ...id, body: V.devolucion }), C.devolucion);
r.delete("/adelantos/:id", permitir("admin"), validar(id), C.quitarAdelanto);
export default r;
