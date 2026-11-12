/*
 * Qué pestaña y sub-pestaña se guardan para la recarga (F5), y cómo se restauran validando el rol.
 * El estado vive en `E` (estado.ts); aquí solo se traduce entre `E` y { modo, tab, subtab } de usePersistedTab.
 */
import type { Rol } from "../api/tipos";
import { CLAVE_NAV_ADMIN, leerNavegacion, type Navegacion } from "../hooks/usePersistedTab";
import { E } from "./estado";
import { SUBMAS } from "./motor";

const TABS_ADMIN = ["inicio", "pedidos", "solicitudes", "clientes", "caja", "cuentas", "sueldos", "mas"];
const TABS_ASISTENTE = ["inicio", "pedidos", "solicitudes", "clientes", "caja", "cuentas"];
const TABS_MENSAJERO = ["inicio", "recepcion", "pend", "caja", "sueldo", "entregados"];
const TABS_PATINADOR = ["caja", "historial"];
const FILTROS_PEDIDOS = ["todos", "sin", "rec", "pend", "ent", "dev", "dif", "cambio", "serv"];

type Sub = { leer: () => string; poner: (v: string) => void; validos: readonly string[] };
/** Sub-pestaña (o filtro principal) que se recuerda en cada pestaña de la oficina. */
const SUB_OFICINA: Record<string, Sub> = {
  caja: { leer: () => E.tabCaja, poner: v => { E.tabCaja = v as typeof E.tabCaja; }, validos: ["caja", "mensajeros", "patinadores", "liquidaciones", "arqueos"] },
  cuentas: { leer: () => E.tabCuentas, poner: v => { E.tabCuentas = v as typeof E.tabCuentas; }, validos: ["cuentas", "movimientos", "ganancias"] },
  mas: { leer: () => E.subMas, poner: v => { E.subMas = v; }, validos: SUBMAS.map(([k]) => k) },
  solicitudes: { leer: () => E.filtroSol, poner: v => { E.filtroSol = v as typeof E.filtroSol; }, validos: ["todas", "pendientes", "por_confirmar", "aceptadas", "rechazadas"] },
  clientes: { leer: () => E.filtroCli, poner: v => { E.filtroCli = v; }, validos: ["todos", "cobrar", "pagar"] },
  pedidos: { leer: () => E.filtroA, poner: v => { E.filtroA = v; }, validos: FILTROS_PEDIDOS },
};
const SUB_MENSAJERO: Record<string, Sub> = {
  recepcion: { leer: () => E.subRecM, poner: v => { E.subRecM = v as typeof E.subRecM; }, validos: ["pedido", "dinero"] },
  pend: { leer: () => E.subPedM, poner: v => { E.subPedM = v as typeof E.subPedM; }, validos: ["todos", "entregar", "recoger"] },
};

/** Modos en los que puede estar cada rol: el admin en los tres; el asistente solo en oficina; el mensajero solo en su modo. */
const modosDe = (rol: Rol) => (rol === "admin" ? ["admin", "mensajero", "patinador"] : rol === "asistente" ? ["admin"] : ["mensajero"]);

/**
 * Pone en `E` la pestaña guardada si existe y le corresponde a esta cuenta. Lo que no cuadra (otra cuenta, una
 * pestaña que el rol no tiene, un modo que ya no le toca porque le cambiaron el rol) se descarta y queda el Inicio.
 * Se llama una vez, al entrar a la app interna.
 */
export function restaurarNavegacion(uid: string, rol: Rol) {
  E.tabA = "inicio"; E.tabM = "inicio"; E.tabP = "caja"; // nada de la sesión anterior en esta misma pestaña del navegador
  const nav = leerNavegacion(CLAVE_NAV_ADMIN, uid);
  if (!nav) return;
  if (nav.tab === "nuevo") nav.tab = "recepcion"; // la pestaña Nuevo del mensajero ahora es Recepción → Nuevo pedido
  const modos = modosDe(rol);
  const modo = nav.modo && modos.includes(nav.modo) ? nav.modo : modos.includes(E.rol) ? E.rol : modos[0];
  E.rol = modo as typeof E.rol;
  if (modo === "patinador") { if (TABS_PATINADOR.includes(nav.tab)) E.tabP = nav.tab as typeof E.tabP; return; }
  const mensajero = modo === "mensajero";
  const tabs = mensajero ? TABS_MENSAJERO : rol === "admin" ? TABS_ADMIN : TABS_ASISTENTE;
  if (!tabs.includes(nav.tab)) return; // pestaña que no existe para este rol: se queda en Inicio
  if (mensajero) E.tabM = nav.tab; else E.tabA = nav.tab;
  const sub = (mensajero ? SUB_MENSAJERO : SUB_OFICINA)[nav.tab];
  // Un enlace con ?estado=… para Pedidos manda sobre el filtro guardado (ver estadoInicialPedidos).
  const conEstado = !mensajero && nav.tab === "pedidos" && new URLSearchParams(window.location.search).has("estado");
  if (sub && nav.subtab && sub.validos.includes(nav.subtab) && !conEstado) sub.poner(nav.subtab);
}

/** Lo que se ve ahora, para guardarlo. */
export function navegacionActual(): Navegacion {
  if (E.rol === "patinador") return { modo: E.rol, tab: E.tabP };
  const mensajero = E.rol === "mensajero", tab = mensajero ? E.tabM : E.tabA;
  const sub = (mensajero ? SUB_MENSAJERO : SUB_OFICINA)[tab];
  return { modo: E.rol, tab, subtab: sub?.leer() || undefined };
}
