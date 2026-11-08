/* Cuántos pedidos caben por página según la pantalla: 8 en el celular y 20 en el computador. */
import { useSyncExternalStore } from "react";

const COMPUTADOR = "(min-width: 768px)";
export const POR_PAGINA = { celular: 8, computador: 20 } as const;

const consulta = () => (typeof window !== "undefined" && window.matchMedia ? window.matchMedia(COMPUTADOR) : null);
const suscribir = (aviso: () => void) => { const m = consulta(); m?.addEventListener("change", aviso); return () => m?.removeEventListener("change", aviso); };

/** 8 o 20, y cambia solo si se gira el celular o se cambia el tamaño de la ventana. */
export function usePorPagina() {
  const esComputador = useSyncExternalStore(suscribir, () => !!consulta()?.matches, () => false);
  return esComputador ? POR_PAGINA.computador : POR_PAGINA.celular;
}
