/*
 * Línea de tiempo y matemáticas de la animación de entrada del ingreso ("La ruta de entrega").
 *
 * La referencia aprobada es animacion-ingreso/src/Intro.tsx (Remotion, 60 cuadros por segundo, 240 cuadros = 4 s).
 * Aquí se usan los mismos números y las mismas curvas, y todo se mide en cuadros igual que allá: para pasar a
 * segundos, cuadro / 60. Los resortes y las curvas son los de Framer Motion (paquete `motion`), evaluados sobre
 * un solo reloj, así cada instante de la app es el mismo cuadro del video.
 */
import { spring, cubicBezier, easeOut, easeInOut, backOut } from "motion";

export const FPS = 60;
/** Cuadro en el que termina todo (4 s). */
export const TOTAL = 240;
/** Los dos mensajeros chocan en el logo (0,967 s). */
export const COLISION = 58;
/** Empieza a armarse el contenido de la tarjeta (1,933 s). */
export const T0 = COLISION + 58;

export type Curva = (t: number) => number;
export const rapida: Curva = cubicBezier(0.65, 0, 0.25, 1);
export const curvaMensajero: Curva = cubicBezier(0.4, 0, 0.7, 0.95);
export const curvaCarga: Curva = cubicBezier(0.3, 0, 0.2, 1);
export { easeOut, easeInOut, backOut };

/** Lleva el cuadro `c` del tramo [a, b] al rango [x, y], sin salirse de los extremos. */
export function entre(c: number, a: number, b: number, x: number, y: number, curva?: Curva) {
  let t = c <= a ? 0 : c >= b ? 1 : (c - a) / (b - a);
  if (curva) t = curva(t);
  return x + (y - x) * t;
}

/** Avance de 0 a 1 entre los cuadros `a` y `b`. */
export const tramo = (c: number, a: number, b: number, curva: Curva = easeOut) => entre(c, a, b, 0, 1, curva);

type Resorte = { next: (ms: number) => { value: number } };
const resortes = new Map<string, Resorte>();

/** Resorte de Framer Motion (0 → 1) que arranca en el cuadro `inicio`. Puede pasarse de 1 y volver. */
export function resorte(c: number, inicio: number, stiffness: number, damping: number) {
  if (c < inicio) return 0;
  const clave = `${stiffness}/${damping}`;
  let r = resortes.get(clave);
  if (!r) { r = spring({ keyframes: [0, 1], stiffness, damping, mass: 1 }) as Resorte; resortes.set(clave, r); }
  const ms = ((c - inicio) / FPS) * 1000;
  const v = r.next(ms).value;
  // La cola del resorte (menos de 0,4 % después de 450 ms) no se ve, pero deja las piezas a fracciones de píxel
  // de su sitio y eso produce un saltico al entregar el ingreso real. Ahí se da por llegado.
  return ms > 450 && Math.abs(v - 1) < 0.004 ? 1 : v;
}

/** Mezcla dos colores `#rrggbb`. */
export function mezcla(a: string, b: string, t: number) {
  const pa = [1, 3, 5].map(i => parseInt(a.slice(i, i + 2), 16));
  const pb = [1, 3, 5].map(i => parseInt(b.slice(i, i + 2), 16));
  return `rgb(${pa.map((v, i) => Math.round(v + (pb[i] - v) * t)).join(",")})`;
}

/*
 * Números "al azar" de la referencia, fijos para que la app dé lo mismo que el video
 * (salen de `random()` de Remotion con las mismas semillas de Intro.tsx).
 */
/** Chispas del choque: [ángulo, velocidad], los dos entre 0 y 1. */
export const CHISPAS: [number, number][] = [
  [0.142229, 0.114908], [0.570169, 0.717265], [0.71364, 0.956365], [0.967222, 0.569745], [0.861492, 0.966098],
  [0.50616, 0.405108], [0.697251, 0.535833], [0.137387, 0.481774], [0.522737, 0.102902], [0.945348, 0.206673],
  [0.042943, 0.703806], [0.962642, 0.577132], [0.792382, 0.907331], [0.487577, 0.281462], [0.893975, 0.537032],
  [0.943729, 0.440264], [0.181215, 0.991612], [0.766209, 0.830179], [0.919821, 0.87806], [0.048734, 0.632886],
  [0.981736, 0.229877], [0.55369, 0.409176],
];
/** Temblor de la cámara: [x, y] entre 0 y 1 para los 14 cuadros que siguen al choque. */
export const TEMBLOR: [number, number][] = [
  [0.7885, 0.2153], [0.2255, 0.6756], [0.459, 0.0649], [0.4518, 0.3957], [0.6691, 0.3796], [0.0866, 0.1635],
  [0.3729, 0.923], [0.8901, 0.1254], [0.6774, 0.3074], [0.6418, 0.5984], [0.8689, 0.936], [0.3648, 0.1694],
  [0.6201, 0.4734], [0.9566, 0.2632],
];
