/* Historial de cambios: quién hizo qué y cuándo. Mismos textos que registrar()/logCambio() de la app,
   pero ahora los escribe el servidor (el celular ya no puede saltárselo ni falsearlo). */
import { Historial, cargarEstado } from "../models/documentos.js";
import { COL_NOM, CAMPOS, NO_LOG, ESTADOS, METODOS, MOTIVOS, CUENTAS_JS, TIPOS, MOVS, MEDIOS, CATS } from "../helpers/constantes.js";
import { hora } from "../helpers/fechas.js";
import { pesos } from "../helpers/texto.js";
import { ahora } from "../helpers/reloj.js";
import { textoLiq } from "../helpers/calculos.js";

/** t: transacción en curso ({ c, actor }). */
export async function registrar(t, texto, { col = null, id = null } = {}) {
  const a = t.actor || {};
  await Historial.agregar(t.c, { uid: a.uid || "", t: ahora(), a: texto, m: a.mensajeroId || "", r: a.rol || "", tabla: col, registro: id });
}

/** Nombres de clientes y personal para los textos (se cargan una vez por transacción). */
async function nombres(t) {
  if (!t._nombres) t._nombres = await cargarEstado(t.c, ["clientes", "mensajeros"]);
  return t._nombres;
}

function resumenDoc(N, col, id, d) {
  d = d || {};
  const nm = x => N.mensajeros[x]?.nombre || "", nc = x => N.clientes[x]?.nombre || d.clienteNombre || "";
  switch (col) {
    case "pedidos": return id + (d.clienteId ? " (" + nc(d.clienteId) + ")" : "");
    case "clientes": case "mensajeros": return d.nombre || id;
    case "movimientos": return (MOVS[d.tipo]?.corto || "") + " " + pesos(d.valor) + " · " + nc(d.clienteId);
    case "recaudos": return pesos(d.valor) + " de " + nm(d.mensajeroId);
    case "liquidaciones": return nm(d.mensajeroId) + " · " + textoLiq(Number(d.debe) || 0);
    case "cajamovs": return (CATS[d.cat] || "") + " " + pesos(d.valor) + (d.personaId ? " · " + nm(d.personaId) : "") + (d.concepto ? " · " + d.concepto : "");
    case "jornadas": return nm(d.personaId) + " · " + d.dia + " · " + pesos(d.valor);
    case "vinculos": return nm(d.mensajeroId);
    default: return id;
  }
}
function fmtCampo(N, k, v) {
  if (k === "clienteId") return N.clientes[v]?.nombre || "—";
  if (k === "estado") return ESTADOS[v] || v;
  if (k === "metodo") return METODOS[v]?.t || (v === "devuelto" ? "devolución" : v || "—");
  if (k === "cambioRecibido") return v ? "recibido " + hora(v) : "pendiente";
  if (k === "motivoDev") return MOTIVOS[v] || v;
  if (k === "cuentaJs") return CUENTAS_JS[v] || "—";
  if (k === "tipo") return TIPOS[v] || MOVS[v]?.corto || v;
  if (typeof v === "boolean") return v ? "sí" : "no";
  if (["valorServicio", "valorCobrado", "aCobrar", "tarifa", "gasto", "domiPagoValor"].includes(k)) return pesos(v);
  if (k === "domiPagoMedio") return MEDIOS[v] || "—";
  return String(v ?? "");
}

/** op: crear | editar | borrar. Igual que logCambio() de la app. */
export async function logCambio(t, op, col, id, data, antes) {
  if (NO_LOG.includes(col)) return;
  const N = await nombres(t), nom = COL_NOM[col] || col, ref = { col, id };
  const anotar = texto => registrar(t, texto, ref);
  if (op === "borrar") return anotar("Eliminó " + nom + ": " + resumenDoc(N, col, id, antes));
  if (op === "crear") return anotar("Creó " + nom + ": " + resumenDoc(N, col, id, data));
  const d = { ...(antes || {}), ...data };
  if (col === "pedidos" && data.estado === "entregado") return anotar(`Entregó ${id}: cobró ${pesos(data.valorCobrado)} (${fmtCampo(N, "metodo", data.metodo)}${data.cuentaJs ? " a " + CUENTAS_JS[data.cuentaJs] : ""})${data.difCobro ? " · diferencia " + pesos(data.difCobro) : ""}${data.cambio ? " · recibió un cambio" : ""}${data.gasto ? " · gastó " + pesos(data.gasto) + (data.gastoNota ? " (" + data.gastoNota + ")" : "") : ""}`);
  if (col === "pedidos" && data.estado === "devuelto") return anotar(`Devolución de ${id}: ${MOTIVOS[data.motivoDev] || ""}${data.notaDev ? " · " + data.notaDev : ""}`);
  if (col === "pedidos" && data.intentos && !data.estado) { const u = data.intentos[data.intentos.length - 1]; return anotar(`Intento fallido en ${id}: ${MOTIVOS[u?.motivo] || ""}${u?.nota ? " · " + u.nota : ""}`); }
  const det = Object.entries(data).filter(([k]) => CAMPOS[k] && (!antes || antes[k] !== data[k])).map(([k, v]) => CAMPOS[k] + ": " + fmtCampo(N, k, v)).join(", ");
  return anotar("Editó " + nom + " " + resumenDoc(N, col, id, d) + (det ? " (" + det + ")" : ""));
}

export { resumenDoc };
