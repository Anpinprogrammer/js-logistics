import express, { Router } from "express";
import * as C from "../controllers/pedidos.controller.js";
import * as V from "../validators/pedidos.validator.js";
import { validar } from "../middleware/validar.js";
import { permitir, OFICINA, EQUIPO } from "../middleware/autorizar.js";
import { MAX_IMAGEN } from "../helpers/imagenes.js";

// Fotos y firmas llegan como cuerpo binario (no multipart): el celular las comprime y las manda de a una.
const imagen = express.raw({ type: ["image/jpeg", "image/png", "image/webp"], limit: MAX_IMAGEN });

const r = Router();
const guia = { params: V.paramGuia };

r.get("/", validar({ query: V.listar }), C.listar);                          // cada rol ve lo suyo
r.get("/:guia", validar(guia), C.obtener);
r.get("/:guia/archivos", validar(guia), C.archivos);
r.post("/:guia/archivos/:tipo", permitir(EQUIPO), validar({ params: V.paramArchivo }), imagen, C.subirArchivo);
r.post("/", permitir(EQUIPO), validar({ body: V.crear }), C.crear);
r.post("/en-bloque", permitir(OFICINA), validar({ body: V.enBloque }), C.enBloque);
r.patch("/:guia", permitir(OFICINA), validar({ ...guia, body: V.actualizar }), C.actualizar);
r.post("/:guia/entrega", permitir(EQUIPO), validar({ ...guia, body: V.entrega }), C.entregar);
r.post("/:guia/no-entregado", permitir(EQUIPO), validar({ ...guia, body: V.noEntregado }), C.noEntregado);
r.patch("/:guia/remitente", permitir("mensajero"), validar({ ...guia, body: V.remitente }), C.asignarRemitente);
r.patch("/:guia/correccion", permitir("mensajero"), validar({ ...guia, body: V.correccion }), C.corregir);
r.post("/:guia/cambio-recibido", permitir(OFICINA, "cliente"), validar(guia), C.confirmarCambio);
r.post("/:guia/reabrir", permitir("admin"), validar(guia), C.reabrir);
r.post("/:guia/pago-domicilio", permitir(OFICINA), validar({ ...guia, body: V.pagoDomicilio }), C.pagoDomicilio);
r.delete("/:guia/pago-domicilio", permitir(OFICINA), validar(guia), C.quitarPagoDomicilio);
r.post("/:guia/diferencia-revisada", permitir(OFICINA), validar(guia), C.diferenciaRevisada);
r.delete("/:guia", permitir("admin"), validar(guia), C.eliminar);

export default r;
