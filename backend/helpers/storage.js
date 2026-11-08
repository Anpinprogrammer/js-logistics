/* Supabase Storage por su API REST, con la service role key (solo en el servidor, nunca en el frontend).
   El bucket debe ser privado: el navegador recibe URL firmadas que vencen. */
import { env } from "../config/env.js";

export const storageConfigurado = () => !!(env.SUPABASE_URL && env.SUPABASE_SERVICE_ROLE_KEY);

const cabeceras = () => ({
  Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
  apikey: env.SUPABASE_SERVICE_ROLE_KEY,
  "Content-Type": "application/json"
});

/** URL firmadas para varias rutas del bucket. Devuelve { ruta: url }; si Storage no está configurado, {}. */
export async function firmarUrls(rutas, segundos = 3600) {
  if (!rutas.length || !storageConfigurado()) return {};
  const r = await fetch(`${env.SUPABASE_URL}/storage/v1/object/sign/${encodeURIComponent(env.STORAGE_BUCKET)}`, {
    method: "POST",
    headers: cabeceras(),
    body: JSON.stringify({ expiresIn: segundos, paths: rutas })
  });
  if (!r.ok) throw new Error(`Supabase Storage respondió ${r.status} al firmar URL`);
  const lista = await r.json();
  const out = {};
  for (const x of lista) if (x.signedURL && !x.error) out[x.path] = `${env.SUPABASE_URL}/storage/v1${x.signedURL}`;
  return out;
}

const objeto = ruta => `${env.SUPABASE_URL}/storage/v1/object/${encodeURIComponent(env.STORAGE_BUCKET)}/${ruta}`;

/** Sube un archivo al bucket. Por defecto no reemplaza: cada foto tiene un nombre nuevo que pone el servidor.
    La importación de Firestore usa `reemplazar` para poder repetirse sin error. */
export async function subirArchivo(ruta, contenido, tipoContenido, { reemplazar = false } = {}) {
  const r = await fetch(objeto(ruta), {
    method: "POST",
    headers: { ...cabeceras(), "Content-Type": tipoContenido, "x-upsert": String(reemplazar), "Cache-Control": "max-age=31536000" },
    body: contenido
  });
  if (!r.ok) throw new Error(`Supabase Storage respondió ${r.status} al subir ${ruta}`);
}

/** Borra archivos del bucket. Se usa para no dejar huérfanos si falla el registro en la base. */
export async function borrarArchivos(rutas) {
  if (!rutas.length || !storageConfigurado()) return;
  const r = await fetch(`${env.SUPABASE_URL}/storage/v1/object/${encodeURIComponent(env.STORAGE_BUCKET)}`, {
    method: "DELETE", headers: cabeceras(), body: JSON.stringify({ prefixes: rutas })
  });
  if (!r.ok) throw new Error(`Supabase Storage respondió ${r.status} al borrar archivos`);
}
