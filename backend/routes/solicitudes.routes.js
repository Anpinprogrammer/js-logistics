/* Solicitudes de envío: las atiende la oficina (administración y asistentes); los clientes con cuenta las crean desde el portal. */
import { Router } from "express";
import * as C from "../controllers/solicitudes.controller.js";
import * as V from "../validators/solicitudes.validator.js";
import { paramId } from "../validators/comunes.js";
import { validar } from "../middleware/validar.js";
import { permitir, OFICINA } from "../middleware/autorizar.js";

const r = Router();
// Un cliente con cuenta pide un envío desde su portal. Su ficha se toma de la sesión, nunca del cuerpo.
r.post("/portal", permitir("cliente"), validar({ body: V.crearPortal }), C.crearDesdePortal);
// "Mis solicitudes": el cliente ve solo las suyas (va antes de /:id para que "mias" no se lea como un id).
r.get("/mias", permitir("cliente"), validar({ query: V.mias }), C.listarMias);
// El cliente acepta o rechaza la propuesta de domicilio desde su portal. La ficha sale de la sesión.
r.post("/mias/:id/responder", permitir("cliente"), validar({ params: paramId, body: V.responderCliente }), C.responderMia);
r.get("/", permitir(OFICINA), validar({ query: V.listar }), C.listar);
r.get("/:id", permitir(OFICINA), validar({ params: paramId }), C.obtener);
r.post("/:id/aceptar", permitir(OFICINA), validar({ params: paramId, body: V.aceptar }), C.aceptar);
r.post("/:id/confirmar", permitir(OFICINA), validar({ params: paramId }), C.confirmar);
r.post("/:id/rechazar", permitir(OFICINA), validar({ params: paramId, body: V.rechazar }), C.rechazar);
r.post("/:id/asignar", permitir(OFICINA), validar({ params: paramId, body: V.asignar }), C.asignar);
export default r;
