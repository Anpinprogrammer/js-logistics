/* Avisos que comparten varias pestañas de la oficina. Viven aparte para que una pestaña no tenga que bajar el código de otra. */
import { corteCaja, diaMinCaja, fechaLarga, hora } from "../motor";
import type { useVentana } from "../ui";

type Ventana = ReturnType<typeof useVentana>;
export const avisoContado = (v: Ventana) => v.avisar("Eso ya quedó contado en el arqueo del " + hora(corteCaja()) + ". Para corregirlo, registra un movimiento nuevo.");
/** La caja ya se contó ese día: no se registran movimientos de días anteriores al arqueo. */
export const diaAntesDelArqueo = (v: Ventana, dia: string) => { const m = diaMinCaja(); if (m && dia < m) { v.avisar("La caja ya se contó el " + fechaLarga(m) + ": no se pueden registrar movimientos de días anteriores."); return true; } return false; };
