import { Router } from "express";
import * as C from "../controllers/clientes.controller.js";
import * as V from "../validators/clientes.validator.js";
import { paramId } from "../validators/comunes.js";
import { validar } from "../middleware/validar.js";
import { permitir, OFICINA } from "../middleware/autorizar.js";
import * as D from "../validators/dinero.validator.js";

const r = Router();

r.get("/", permitir(OFICINA), validar({ query: V.listar }), C.listar);
r.get("/saldos", permitir(OFICINA), validar({ query: V.saldos }), C.saldos);       // lista con el saldo de cada uno
r.get("/cuadre", permitir(OFICINA), validar({ query: D.cuadre }), C.cuadre);         // cuadre del día por cliente
r.get("/repetidos", permitir("admin"), C.repetidos);
r.post("/pagar-saldos", permitir(OFICINA), validar({ body: D.pagarSaldos }), C.pagarSaldos);
r.patch("/mi-perfil", permitir("cliente"), validar({ body: V.miPerfil }), C.actualizarMiPerfil);
r.get("/:id/cuenta", permitir(OFICINA, "cliente"), validar({ params: paramId, query: V.cuenta }), C.cuenta);
r.post("/:id/unir", permitir("admin"), validar({ params: paramId, body: D.unir }), C.unir);
r.get("/:id", permitir(OFICINA, "cliente"), validar({ params: paramId }), C.obtener);
r.get("/:id/movimientos", permitir(OFICINA, "cliente"), validar({ params: paramId, query: V.movimientos }), C.movimientos);
r.post("/", permitir(OFICINA), validar({ body: V.crear }), C.crear);
r.patch("/:id", permitir(OFICINA), validar({ params: paramId, body: V.actualizar }), C.actualizar);
r.delete("/:id", permitir("admin"), validar({ params: paramId }), C.eliminar);

export default r;
