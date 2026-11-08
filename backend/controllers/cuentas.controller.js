/* Cuentas internas (socios y la base de JS): saldos y movimientos. Reglas en servicios/caja.js. */
import * as C from "../servicios/caja.js";
import { responder, diaDeFecha } from "./accion.js";

export const listar = responder(ctx => C.cuentas(ctx), { clave: "cuentas" });
export const crear = responder((ctx, req) => C.crearCuenta(ctx, req.valido.body), { clave: "cuenta", status: 201 });
export const iniciales = responder(ctx => C.crearCuentasIniciales(ctx), { clave: "cuentas", status: 201 });
export const movimiento = responder((ctx, req) => {
  const b = req.valido.body;
  return C.movimientoCuenta(ctx, req.valido.params.id, { ...b, dia: b.dia ?? diaDeFecha(b.fecha) });
}, { clave: "movimiento", status: 201 });
