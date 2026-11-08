/// <reference types="vite/client" />

// Variables de entorno que lee el frontend. Terminan en el navegador: nunca pongas secretos aquí.
interface ImportMetaEnv {
  /** URL del backend, por ejemplo https://api.jslogistics.pro. Vacía: se usa /api en el mismo dominio. */
  readonly VITE_API_URL?: string;
  /** "true" para el modo demo, con datos inventados y sin backend. */
  readonly VITE_DEMO?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
