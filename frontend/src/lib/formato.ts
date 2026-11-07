/* Formato de pesos, fechas y textos del negocio, en hora de Colombia. */
import type { Motivo, MetodoEntrega, Pedido, Rol, TipoPersonal, Movimiento } from "../api/tipos";

const ZONA = "America/Bogota";
const fmtPesos = new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 });
export const pesos = (v: number | null | undefined) => fmtPesos.format(Number(v) || 0);

export const fechaHora = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleString("es-CO", { timeZone: ZONA, day: "2-digit", month: "short", hour: "numeric", minute: "2-digit" }) : "";
export const hora = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleTimeString("es-CO", { timeZone: ZONA, hour: "numeric", minute: "2-digit" }) : "";

/** "AAAA-MM-DD" de hoy en Colombia. */
export const hoy = () => new Date().toLocaleDateString("en-CA", { timeZone: ZONA });
/** Inicio de un día de Colombia (UTC-5, sin horario de verano) en ISO. */
export const inicioDia = (dia: string) => new Date(`${dia}T00:00:00-05:00`).toISOString();
export const moverDia = (dia: string, n: number) => {
  const d = new Date(`${dia}T12:00:00-05:00`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toLocaleDateString("en-CA", { timeZone: ZONA });
};

export const MOTIVOS: Record<Motivo, string> = {
  no_contesta: "No contestan",
  direccion: "Dirección errada",
  rechazo: "Lo rechazaron",
  reprogramar: "Reprogramar (sigue en ruta)",
  otro: "Otro motivo"
};

export const METODOS: Record<MetodoEntrega, string> = {
  efectivo: "Efectivo",
  transf_js: "Transferencia a JS",
  transf_cliente: "Transferencia al cliente"
};

export const ROLES: Record<Rol, string> = {
  admin: "Administración",
  asistente: "Asistente (oficina)",
  mensajero: "Mensajero",
  cliente: "Cliente"
};

export const TIPOS_PERSONAL: Record<TipoPersonal, string> = {
  mensajero: "Mensajero",
  patinador: "Patinador",
  oficina: "Oficina",
  dueno: "Dueño",
  empresa: "Empresa"
};

export const MOVIMIENTOS: Record<Movimiento["tipo"], { t: string; signo: 1 | -1 }> = {
  cargo: { t: "Cargo (queda debiendo)", signo: -1 },
  abono: { t: "Abono a favor", signo: 1 },
  pago_de_cliente: { t: "Pago del cliente", signo: 1 },
  pago_a_cliente: { t: "Pago al cliente", signo: -1 },
  compra_cliente: { t: "Compra por encargo", signo: -1 },
  ganancia: { t: "Ganancia", signo: -1 }
};

export const metodoTexto = (p: Pedido) =>
  p.estado === "devuelto" ? `Devolución${p.motivoDev ? " (" + MOTIVOS[p.motivoDev].toLowerCase() + ")" : ""}`
    : p.metodo && p.metodo !== "devuelto" ? METODOS[p.metodo] + (p.cuentaJs ? ` · ${p.cuentaJs === "nequi" ? "Nequi" : "Bancolombia"}` : "") : "";

/** ¿Todavía está dentro de las 24 horas en que el mensajero puede corregir? */
export const corregible = (p: Pedido) => !!p.entregado && Date.now() - new Date(p.entregado).getTime() < 24 * 3_600_000;

/** Número escrito por el usuario → entero en pesos ("25.000" → 25000). */
export const aPesos = (s: string) => Number(String(s).replace(/[^\d]/g, "")) || 0;
