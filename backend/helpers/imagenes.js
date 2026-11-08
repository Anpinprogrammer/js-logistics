/* Reconoce el tipo real de una imagen por sus primeros bytes, sin creerle a la cabecera Content-Type. */

export const TIPOS_ARCHIVO = ["salida", "mini", "entrega", "firma"]; // "previa" no se sube: la pone el servidor al reabrir
export const MAX_IMAGEN = 1024 * 1024; // 1 MB: el celular ya la manda comprimida (~150 KB)

const empieza = (b, bytes, desde = 0) => bytes.every((x, i) => b[desde + i] === x);

/** Devuelve { mime, ext } si el contenido es JPEG, PNG o WebP; si no, null. */
export function tipoDeImagen(b) {
  if (!Buffer.isBuffer(b) || b.length < 12) return null;
  if (empieza(b, [0xff, 0xd8, 0xff])) return { mime: "image/jpeg", ext: "jpg" };
  if (empieza(b, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return { mime: "image/png", ext: "png" };
  if (b.toString("ascii", 0, 4) === "RIFF" && b.toString("ascii", 8, 12) === "WEBP") return { mime: "image/webp", ext: "webp" };
  return null;
}
