/* IDs cortos y aleatorios, con la misma forma que los que generaba la app (nuevoId). */
import { randomInt } from "node:crypto";

const ALFABETO = "abcdefghijklmnopqrstuvwxyz0123456789";

export function nuevoId(largo = 16) {
  let s = "";
  for (let i = 0; i < largo; i++) s += ALFABETO[randomInt(ALFABETO.length)];
  return s;
}

/** Número de guía: 1 → "JS-00001". */
export const formatoGuia = n => "JS-" + String(n).padStart(5, "0");
