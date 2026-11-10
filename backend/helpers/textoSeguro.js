/* Limpieza de texto que va hacia el modelo. Quita lo que un humano no ve pero el modelo sí lee
   (caracteres de ancho cero, de control, de dirección y la "tinta invisible" Unicode de las etiquetas U+E0000),
   que es la forma típica de esconder instrucciones dentro de un mensaje o de un dato guardado. */
const INVISIBLES = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F­͏؜ᅟᅠ឴឵᠋-᠏​-‏‪-‮⁠-⁯ㅤ︀-️﻿ﾠ￹-￻\u{E0000}-\u{E01EF}]/gu;

export const limpiarTexto = t => String(t ?? "").normalize("NFC").replace(INVISIBLES, "");

/** Para un texto libre guardado en la base (quién recibió, notas): limpio y corto. */
export const textoDeDato = (t, max = 120) => {
  const l = limpiarTexto(t).replace(/\s+/g, " ").trim();
  return l ? l.slice(0, max) : null;
};
