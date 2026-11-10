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

/** Cuentas → Movimientos y Ganancias: 6 filas en celular y 15 en computador. */
export const POR_PAGINA_CUENTAS = { celular: 6, computador: 15 } as const;
export function usePorPaginaCuentas() {
  const esComputador = useSyncExternalStore(suscribirComputador, esComputadorAhora, () => false);
  return esComputador ? POR_PAGINA_CUENTAS.computador : POR_PAGINA_CUENTAS.celular;
}

/** `true` desde 960 px: ahí se muestra el menú lateral y se ocultan las pestañas del celular. */
export function useEscritorio() {
  return useSyncExternalStore(suscribirEscritorio, esEscritorioAhora, () => false);
}

/** Cuentas → Movimientos de las cuentas internas: 5 filas en celular y 10 en computador. */
export const POR_PAGINA_INTERNOS = { celular: 5, computador: 10 } as const;
export function usePorPaginaInternos() {
  const esComputador = useSyncExternalStore(suscribirComputador, esComputadorAhora, () => false);
  return esComputador ? POR_PAGINA_INTERNOS.computador : POR_PAGINA_INTERNOS.celular;
}

/** Personal → Acceso: 5 filas en celular y 10 en computador. */
export const POR_PAGINA_ACCESOS = { celular: 5, computador: 10 } as const;
export function usePorPaginaAccesos() {
  const esComputador = useSyncExternalStore(suscribirComputador, esComputadorAhora, () => false);
  return esComputador ? POR_PAGINA_ACCESOS.computador : POR_PAGINA_ACCESOS.celular;
}

/** Más → Historial: 5 filas en celular y 13 en computador. */
export const POR_PAGINA_HISTORIAL = { celular: 5, computador: 13 } as const;
export function usePorPaginaHistorial() {
  const esComputador = useSyncExternalStore(suscribirComputador, esComputadorAhora, () => false);
  return esComputador ? POR_PAGINA_HISTORIAL.computador : POR_PAGINA_HISTORIAL.celular;
}

/** Caja → Liquidaciones recientes: 5 filas en celular y 9 en computador. */
export const POR_PAGINA_LIQUIDACIONES = { celular: 5, computador: 9 } as const;
export function usePorPaginaLiquidaciones() {
  const esComputador = useSyncExternalStore(suscribirComputador, esComputadorAhora, () => false);
  return esComputador ? POR_PAGINA_LIQUIDACIONES.computador : POR_PAGINA_LIQUIDACIONES.celular;
}

/** Personal → Personal JS: 4 filas en celular y 7 en computador. */
export const POR_PAGINA_PERSONAL = { celular: 4, computador: 7 } as const;
export function usePorPaginaPersonal() {
  const esComputador = useSyncExternalStore(suscribirComputador, esComputadorAhora, () => false);
  return esComputador ? POR_PAGINA_PERSONAL.computador : POR_PAGINA_PERSONAL.celular;
}
