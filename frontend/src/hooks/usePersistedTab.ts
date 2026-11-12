/*
 * Pestaña y sub-pestaña activas que sobreviven a una recarga (F5).
 * Se escriben en la URL (?tab=caja&subtab=arqueos, para poder copiar el enlace) y en sessionStorage como respaldo,
 * con una clave por app: `js_admin_nav` aquí (oficina y mensajeros) y `js_client_nav` en el portal de clientes.
 * Al leer, primero la URL y después sessionStorage. Lo guardado lleva el id de la cuenta: si en esa pestaña del
 * navegador entra otra persona, no hereda la navegación de la anterior. Validar que la pestaña exista para el rol
 * le toca a quien restaura (cada app sabe qué pestañas tiene cada rol).
 * sessionStorage es por pestaña del navegador y se borra al cerrarla; no guarda nada sensible.
 */
import { useEffect } from "react";

export const CLAVE_NAV_ADMIN = "js_admin_nav";

export interface Navegacion {
  /** Modo de la app interna: "admin" (oficina) o "mensajero". */
  modo?: string;
  tab: string;
  subtab?: string;
}
interface Guardada extends Navegacion { uid?: string }

const PARAMS = ["modo", "tab", "subtab"] as const;
const PESTANA_INICIAL = "inicio";

function leerSesion(clave: string): Guardada | null {
  try {
    const x = JSON.parse(sessionStorage.getItem(clave) || "null") as Guardada | null;
    return x && typeof x.tab === "string" ? x : null;
  } catch { return null; }
}

/** Lo último guardado para esta cuenta: de la URL si trae `tab`, si no de sessionStorage. Sin nada, null. */
export function leerNavegacion(clave: string, uid: string): Navegacion | null {
  if (typeof window === "undefined") return null;
  const q = new URLSearchParams(window.location.search);
  const tab = q.get("tab");
  const guardada = leerSesion(clave);
  if (tab) return { tab, subtab: q.get("subtab") || undefined, modo: q.get("modo") || (guardada?.uid === uid ? guardada.modo : undefined) };
  if (guardada && guardada.uid === uid) return { tab: guardada.tab, subtab: guardada.subtab, modo: guardada.modo };
  if (guardada) limpiarNavegacion(clave); // era de otra cuenta
  return null;
}

/** Escribe la navegación en sessionStorage y en la URL (sin crear entradas nuevas en el historial del navegador). */
export function guardarNavegacion(clave: string, uid: string, nav: Navegacion) {
  try { sessionStorage.setItem(clave, JSON.stringify({ ...nav, uid })); } catch { /* sin almacenamiento: queda solo la URL */ }
  if (typeof window === "undefined") return;
  const url = new URL(window.location.href);
  const enInicio = nav.tab === PESTANA_INICIAL && !nav.subtab;
  for (const k of PARAMS) {
    const v = enInicio ? "" : k === "modo" ? nav.modo : nav[k];
    if (v) url.searchParams.set(k, v); else url.searchParams.delete(k);
  }
  if (url.href !== window.location.href) window.history.replaceState(window.history.state, "", url);
}

/** Borra la navegación guardada (al cerrar sesión): sessionStorage y los parámetros de la URL. */
export function limpiarNavegacion(...claves: string[]) {
  for (const c of claves) { try { sessionStorage.removeItem(c); } catch { /* sin almacenamiento */ } }
  if (typeof window === "undefined") return;
  const url = new URL(window.location.href);
  PARAMS.forEach(k => url.searchParams.delete(k));
  if (url.href !== window.location.href) window.history.replaceState(window.history.state, "", url);
}

/**
 * Mantiene la URL y sessionStorage al día con la pestaña que se ve. La app interna guarda su estado en `E`
 * (estado.ts) y vuelve a pintar con `tocar()`, así que el hook recibe los valores ya calculados en cada render.
 */
export function usePersistedTab(clave: string, uid: string, { modo, tab, subtab }: Navegacion) {
  useEffect(() => { if (uid) guardarNavegacion(clave, uid, { modo, tab, subtab }); }, [clave, uid, modo, tab, subtab]);
}
