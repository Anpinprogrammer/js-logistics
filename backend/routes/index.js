/* Todas las rutas de la API, bajo /api. */
import { Router } from "express";
import { autenticar } from "../middleware/autenticar.js";
import { vivo, listo } from "../controllers/salud.controller.js";
import auth from "./auth.routes.js";
import usuarios from "./usuarios.routes.js";
import clientes from "./clientes.routes.js";
import mensajeros from "./mensajeros.routes.js";
import pedidos from "./pedidos.routes.js";

const r = Router();

// Públicas
r.get("/health", vivo);
r.head("/health", vivo);
r.get("/ready", listo);
r.head("/ready", listo);
r.use("/auth", auth);

// Desde aquí, todo exige sesión
r.use(autenticar);
r.use("/usuarios", usuarios);
r.use("/clientes", clientes);
r.use("/mensajeros", mensajeros);
r.use("/pedidos", pedidos);

export default r;
