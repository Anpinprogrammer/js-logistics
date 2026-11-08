/* Fechas en hora de Colombia, igual que la app (que usa la hora del celular o del computador de la oficina).
   Colombia no tiene horario de verano: siempre es UTC−5. */
import { ahora } from "./reloj.js";

export const ZONA = "America/Bogota";
const DIA = 864e5;
const fmtDia = new Intl.DateTimeFormat("en-CA", { timeZone: ZONA, year: "numeric", month: "2-digit", day: "2-digit" });

/** "AAAA-MM-DD" del momento ts (ms) en Colombia. Equivale a diaDe() de la app. */
export const diaDe = ts => fmtDia.format(new Date(Number(ts)));
export const hoy = () => diaDe(ahora());
/** Mediodía de un día en Colombia, en ms (la app usa new Date(dia+"T12:00:00")). */
export const mediodia = dia => Date.parse(dia + "T12:00:00-05:00");
export const esDia = d => typeof d === "string" && /^\d{4}-\d{2}-\d{2}$/.test(d) && !Number.isNaN(mediodia(d));
/** Fecha de un movimiento registrado para un día: si es hoy, la hora actual; si no, el mediodía de ese día. */
export const fechaDia = f => (f === hoy() ? ahora() : mediodia(f));
export const moverDia = (d, n) => diaDe(mediodia(d || hoy()) + n * DIA);
/** Día de la semana (0 = domingo … 6 = sábado). */
export const diaSemana = d => new Date(mediodia(d)).getUTCDay();
/** Las semanas de sueldo van de sábado a viernes. */
export const semanaDe = dia => moverDia(dia, -((diaSemana(dia) + 1) % 7));
export const diasSemana = sem => [...Array(7)].map((_, i) => moverDia(sem, i));
export const moverSemana = (sem, n) => moverDia(sem, 7 * n);
/** Hora corta como la muestra la app: "05 nov., 3:40 p. m.". Se usa en los textos que quedan guardados. */
export const hora = ts => new Date(Number(ts)).toLocaleString("es-CO", { timeZone: ZONA, day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
export const fechaCorta = d => new Date(mediodia(d)).toLocaleDateString("es-CO", { timeZone: ZONA, day: "numeric", month: "short" });
export const fechaLarga = d => new Date(mediodia(d)).toLocaleDateString("es-CO", { timeZone: ZONA, weekday: "long", day: "numeric", month: "long", year: "numeric" });
