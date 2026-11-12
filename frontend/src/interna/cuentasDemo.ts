/* Cuentas del modo demo. Este archivo no importa nada más, así la sesión (que se carga primero) no arrastra el motor. */
import type { Usuario } from "../api/tipos";

export const DEMO = import.meta.env.VITE_DEMO === "true";

export const USUARIOS_DEMO: Usuario[] = [
  { id: "u-admin", email: "admin@demo.co", nombre: "Laura Gómez", rol: "admin", clienteId: null, mensajeroId: "m-dueno" },
  { id: "u-asis", email: "asistente@demo.co", nombre: "Camila Ríos", rol: "asistente", clienteId: null, mensajeroId: null },
  { id: "u-mens", email: "mensajero@demo.co", nombre: "Andrés Mora", rol: "mensajero", clienteId: null, mensajeroId: "m1" },
  { id: "u-pat", email: "patinador@demo.co", nombre: "Tomás Vélez", rol: "patinador", clienteId: null, mensajeroId: "m-pat" },
];
