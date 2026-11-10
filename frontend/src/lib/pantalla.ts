/* Medidas de la pantalla que cambian con el tamaño de la ventana. */
import { useSyncExternalStore } from "react";

const COMPUTADOR = "(min-width: 768px)";
/** El escritorio es el mismo corte en el que aparece el menú lateral (ver `estilos.css`). */
const ESCRITORIO = "(min-width: 960px)";
export const POR_PAGINA = { celular: 8, computador: 20 } as const;

const consulta = (q: string) => (typeof window !== "undefined" && window.matchMedia ? window.matchMedia(q) : null);
const suscribir = (q: string) => (aviso: () => void) => { const m = consulta(q); m?.addEventListener("change", aviso); return () => m?.removeEventListener("change", aviso); };
const coincide = (q: string) => () => !!consulta(q)?.matches;
const suscribirComputador = suscribir(COMPUTADOR), suscribirEscritorio = suscribir(ESCRITORIO);
const esComputadorAhora = coincide(COMPUTADOR), esEscritorioAhora = coincide(ESCRITORIO);

/** 8 o 20, y cambia solo si se gira el celular o se cambia el tamaño de la ventana. */
export function usePorPagina() {
  const esComputador = useSyncExternalStore(suscribirComputador, esComputadorAhora, () => false);
  return esComputador ? POR_PAGINA.computador : POR_PAGINA.celular;
}

/** `true` desde 960 px: ahí se muestra el menú lateral y se ocultan las pestañas del celular. */
export function useEscritorio() {
  return useSyncExternalStore(suscribirEscritorio, esEscritorioAhora, () => false);
}
