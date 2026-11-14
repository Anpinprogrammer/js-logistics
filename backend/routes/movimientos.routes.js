import { Router } from "express";
import * as C from "../controllers/movimientos.controller.js";
import * as V from "../validators/dinero.validator.js";
import { validar } from "../middleware/validar.js";
import { permitir, OFICINA, EQUIPO } from "../middleware/autorizar.js";

// Movimientos de la cuenta de los clientes. El cliente ve los suyos en GET /clientes/:id/movimientos.
const r = Router();
r.get("/", permitir(EQUIPO), C.listar); // cada rol lee lo suyo (lecturasDe): el mensajero, solo los pagos que él recibió
// Recepción → Recibir dinero: el mensajero anota lo que le paga un cliente en la calle y ve lo que ha recibido.
r.get("/recibidos", permitir(EQUIPO), validar({ query: V.recibidos }), C.recibidos);
r.get("/recibidos/historial", permitir(EQUIPO), validar({ query: V.recibidosHistorial }), C.historialRecibidos);
r.post("/recibidos",permitir("mensajero", "admin"), validar({ body: V.recibido }), C.recibir);
r.get("/pagina", permitir(OFICINA), validar({ query: V.movimientosPagina }), C.pagina);
r.get("/ganancias", permitir(OFICINA), validar({ query: V.gananciasPagina }), C.ganancias);
r.post("/", permitir(OFICINA), validar({ body: V.movimiento }), C.crear);
r.post("/reversar", permitir(OFICINA), validar({ body: V.reversar }), C.reversar);
r.patch("/:id", permitir(OFICINA), validar({ params: V.paramId, body: V.movimiento }), C.actualizar);
r.delete("/:id", permitir(OFICINA), validar({ params: V.paramId }), C.eliminar);
export default r;
