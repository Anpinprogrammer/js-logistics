/* Cliente HTTP con axios. La sesión va en una cookie HttpOnly que pone el backend: aquí no se guarda ningún token. */
import axios, { AxiosError } from "axios";
import type { ErrorApi } from "./tipos";

export const api = axios.create({
  // Por defecto el mismo sitio (/api), con proxy en desarrollo y reescritura en producción.
  baseURL: import.meta.env.VITE_API_URL || "/api",
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
