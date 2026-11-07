import { Router } from "express";
import * as C from "../controllers/pedidos.controller.js";
import * as V from "../validators/pedidos.validator.js";
import { validar } from "../middleware/validar.js";
import { permitir, OFICINA, EQUIPO } from "../middleware/autorizar.js";

const r = Router();
const guia = { params: V.paramGuia };

r.get("/", validar({ query: V.listar }), C.listar);                          // cada rol ve lo suyo
r.get("/:guia", validar(guia), C.obtener);
r.post("/", permitir(EQUIPO), validar({ body: V.crear }), C.crear);
r.patch("/:guia", permitir(OFICINA), validar({ ...guia, body: V.actualizar }), C.actualizar);
r.post("/:guia/entrega", permitir(EQUIPO), validar({ ...guia, body: V.entrega }), C.entregar);
r.post("/:guia/no-entregado", permitir(EQUIPO), validar({ ...guia, body: V.noEntregado }), C.noEntregado);
r.patch("/:guia/correccion", permitir("mensajero"), validar({ ...guia, body: V.correccion }), C.corregir);
r.post("/:guia/cambio-recibido", permitir(OFICINA, "cliente"), validar(guia), C.confirmarCambio);
r.delete("/:guia", permitir("admin"), validar(guia), C.eliminar);

export default r;
