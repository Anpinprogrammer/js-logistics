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
