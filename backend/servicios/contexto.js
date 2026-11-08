/* Ayudas comunes de los servicios: quién hace la petición, cargar el estado para calcular y validar datos.
   Los servicios reciben ctx = { actor, db, eventos } (lo arma controllers/accion.js). */
import { cargarEstado, COLS_ESTADO, Meta } from "../models/documentos.js";
import { crearCalculos } from "../helpers/calculos.js";
import { datosInvalidos, permisoNegado, yaContadoError } from "./errores.js";
import { esDia, hoy } from "../helpers/fechas.js";
import { MEDIOS } from "../helpers/constantes.js";

/** Quien hace la petición, con los nombres que usan las reglas de la app (firestore.rules). */
export function actorDe(u) {
  if (!u) return null;
  const rol = u.rol;
  return {
    uid: u.id, email: u.email, nombre: u.nombre || u.email || "", rol, clienteId: u.clienteId || "", mensajeroId: u.mensajeroId || "",
    esAdmin: rol === "admin", esAsistente: rol === "asistente", esOficina: rol === "admin" || rol === "asistente",
    esEquipo: rol === "admin" || rol === "asistente" || rol === "mensajero", esCliente: rol === "cliente"
  };
}

/** Carga las colecciones indicadas (por defecto todo el estado S) y devuelve los cálculos de la app sobre ellas. */
export async function calculosDe(c, cols = COLS_ESTADO) {
  const S = await cargarEstado(c, cols), corteRemoto = await Meta.corte(c);
  return crearCalculos(S, { corteRemoto });
}

/* ---- permisos (equivalentes a las funciones de firestore.rules) ---- */
export const exigirAdmin = a => { if (!a?.esAdmin) throw permisoNegado("Solo administración puede hacer esto."); };
export const exigirOficina = a => { if (!a?.esOficina) throw permisoNegado("Solo la oficina puede hacer esto."); };
export const exigirEquipo = a => { if (!a?.esEquipo) throw permisoNegado(); };
export const esMio = (a, mid) => !!a?.mensajeroId && mid === a.mensajeroId;

/* ---- validaciones con los mismos mensajes que la app ---- */
export const numero = v => (v === "" || v === null || v === undefined ? NaN : Number(v));
export function valorPositivo(v, msg = "Escribe un valor mayor a cero") {
  const n = numero(v);
  if (!(n > 0)) throw datosInvalidos(msg);
  return Math.round(n);
}
export function medioValido(m, msg = "Elige el medio de pago") {
  if (!MEDIOS[m]) throw datosInvalidos(msg);
  return m;
}
/** Día de un movimiento: AAAA-MM-DD, sin pasar de hoy. Vacío = hoy. */
export function diaValido(d) {
  const dia = d || hoy();
  if (!esDia(dia)) throw datosInvalidos("El día no es válido (AAAA-MM-DD).");
  if (dia > hoy()) throw datosInvalidos("No se pueden registrar movimientos de días que no han llegado.");
  return dia;
}
export const texto = (v, max = 500) => String(v ?? "").trim().slice(0, max);
export function exigirNoContado(calc, fecha) {
  if (calc.yaContado(fecha)) throw yaContadoError(calc.textoContado());
}
export function exigirDiaAbierto(calc, dia) {
  const msg = calc.diaAntesDelArqueo(dia);
  if (msg) throw yaContadoError(msg);
}
