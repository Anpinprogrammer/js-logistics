/* Cliente HTTP con axios. La sesión va en una cookie HttpOnly que pone el backend: aquí no se guarda ningún token. */
import axios, { AxiosError } from "axios";
import type { ErrorApi } from "./tipos";

/**
 * Dirección de la API. Sin VITE_API_URL se usa /api en el mismo dominio (proxy en desarrollo, reescritura de vercel.json en producción).
 * Con VITE_API_URL (por ejemplo https://api.jslogistics.pro) se llama directo; se le agrega /api si no lo trae.
 */
function direccionApi(valor?: string): string {
  const v = (valor ?? "").trim().replace(/\/+$/, "");
  if (!v) return "/api";
  return v.endsWith("/api") ? v : `${v}/api`;
}

export const api = axios.create({
  baseURL: direccionApi(import.meta.env.VITE_API_URL),
  withCredentials: true,
  timeout: 20_000,
  headers: { "X-JSL": "1" } // protección CSRF que exige el backend en todo lo que no sea GET
});

/** Error con el mensaje del servidor listo para mostrar. */
export class FalloApi extends Error {
  status: number;
  code: string;
  campos: ErrorApi["campos"];
  datos: unknown;
  constructor(status: number, e: ErrorApi, datos?: unknown) {
    super(e.message);
    this.status = status;
    this.code = e.code;
    this.campos = e.campos;
    this.datos = datos;
  }
}

let alPerderSesion: (() => void) | null = null;
export const cuandoSePierdaLaSesion = (fn: () => void) => { alPerderSesion = fn; };

api.interceptors.response.use(
  r => r,
  (e: AxiosError<{ error?: ErrorApi }>) => {
    if (!e.response) {
      throw new FalloApi(0, { code: "SIN_CONEXION", message: "No hay conexión con el servidor. Revisa tu internet e intenta de nuevo." });
    }
    const { status, data } = e.response;
    if (status === 401 && !e.config?.url?.includes("/auth/")) alPerderSesion?.();
    throw new FalloApi(status, data?.error ?? { code: "ERROR", message: "Algo salió mal. Intenta de nuevo." }, data);
  }
);

export const mensajeDe = (e: unknown) => (e instanceof Error ? e.message : "Algo salió mal. Intenta de nuevo.");
