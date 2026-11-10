import { Router } from "express";
import * as C from "../controllers/auth.controller.js";
import * as V from "../validators/auth.validator.js";
import { validar } from "../middleware/validar.js";
import { autenticar } from "../middleware/autenticar.js";
import { limiteIngreso, limiteCorreo, limiteEnlace } from "../middleware/seguridad.js";
import { permitir } from "../middleware/autorizar.js";

const r = Router();

r.post("/ingresar", limiteIngreso, validar({ body: V.ingreso }), C.ingresar);
r.post("/salir", C.salir);
r.post("/salir-de-todo", autenticar, C.salirDeTodo);
r.get("/yo", autenticar, C.yo);
r.post("/clave", autenticar, limiteIngreso, validar({ body: V.cambiarMiClave }), C.cambiarMiClave);
// Administración manda el enlace de restablecimiento a una cuenta (por id o por correo).
r.post("/send-reset-email", autenticar, permitir("admin"), limiteCorreo, validar({ body: V.enviarReset }), C.enviarReset);
// Lote de enlaces de restablecimiento: entra a la cola y responde 202 (se manda en segundo plano).
r.post("/send-bulk-reset-emails", autenticar, permitir("admin"), limiteCorreo, validar({ body: V.enviarResetMasivo }), C.enviarResetsMasivo);

// Públicas: los enlaces llegan por correo y la persona todavía no tiene sesión.
r.post("/recuperar", limiteCorreo, validar({ body: V.recuperar }), C.recuperar);
r.get("/enlace/:token", limiteEnlace, validar({ params: V.paramToken }), C.verEnlace);
r.post("/restablecer", limiteEnlace, validar({ body: V.restablecer }), C.restablecer);
r.post("/activar", limiteEnlace, validar({ body: V.activar }), C.activar);
r.post("/activate-account", limiteEnlace, validar({ body: V.activarCuenta }), C.activarCuenta);

export default r;
