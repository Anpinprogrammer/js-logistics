/* Compresión de fotos en el celular antes de subirlas. Mismos valores que la app actual:
   800 px y calidad 0,5 para las fotos (~100 KB), 140 px para la miniatura de la lista. */
export const FOTO = { px: 800, calidad: 0.5 };
export const MINI = { px: 140, calidad: 0.6 };

const aBlob = (c: HTMLCanvasElement, calidad: number) =>
  new Promise<Blob>((ok, mal) => c.toBlob(b => (b ? ok(b) : mal(new Error("No se pudo preparar la foto"))), "image/jpeg", calidad));

/** Reduce la imagen a `px` en su lado mayor y la pasa a JPEG con fondo blanco. */
export async function comprimir(archivo: Blob, { px, calidad } = FOTO): Promise<Blob> {
  const img = await createImageBitmap(archivo).catch(() => { throw new Error("Ese archivo no es una foto. Toma otra."); });
  const k = Math.min(1, px / Math.max(img.width, img.height));
  const c = document.createElement("canvas");
  c.width = Math.round(img.width * k);
  c.height = Math.round(img.height * k);
  const x = c.getContext("2d")!;
  x.fillStyle = "#fff"; // las transparencias de un PNG quedan blancas, no negras
  x.fillRect(0, 0, c.width, c.height);
  x.drawImage(img, 0, 0, c.width, c.height);
  img.close();
  return aBlob(c, calidad);
}

/** Copia la firma a 480 px de ancho sobre fondo blanco (así se ve igual en modo oscuro). */
export function firmaABlob(lienzo: HTMLCanvasElement): Promise<Blob> {
  const c = document.createElement("canvas");
  c.width = 480;
  c.height = Math.round((480 * lienzo.height) / lienzo.width);
  const x = c.getContext("2d")!;
  x.fillStyle = "#fff";
  x.fillRect(0, 0, c.width, c.height);
  x.drawImage(lienzo, 0, 0, c.width, c.height);
  return aBlob(c, 0.7);
}
