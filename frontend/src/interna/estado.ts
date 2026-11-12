/* Estado de la interfaz que se conserva al cambiar de pestaña (como las variables globales del prototipo). */
import { hoy, moverDia, semanaDe } from "./motor";
import type { EstadoFiltroSolicitudes, OrigenFiltroSolicitudes } from "../api/tipos";

const leer = (k: string) => { try { return localStorage.getItem(k) || ""; } catch { return ""; } };
export const guardarLocal = (k: string, v: string) => { try { localStorage.setItem(k, v); } catch { /* sin almacenamiento */ } };

const tabCajaGuardada = leer("js_caja");
const tabCuentasGuardada = leer("js_cuentas");
const subPedMGuardada = leer("js_pedidos_m");

/** Un enlace puede abrir Pedidos con un estado explícito; en cualquier otro caso empieza en Todos. */
export function estadoInicialPedidos() {
  if (typeof window === "undefined") return "todos";
  const q = new URLSearchParams(window.location.search);
  const estado = q.get("estado") || q.get("filtroEstado") || "";
  const alias: Record<string, string> = { sin_remitente: "sin", por_recoger: "rec", por_entregar: "pend", entregados: "ent", devueltos: "dev", con_diferencia: "dif", cambios: "cambio" };
  const filtro = alias[estado] || estado;
  return ["todos", "sin", "rec", "pend", "ent", "dev", "dif", "cambio", "serv"].includes(filtro) ? filtro : "todos";
}

export const E = {
  // Modo de la app de administración: oficina, mensajero o patinador (los dos últimos, "como si fuera" esa persona).
  rol: (leer("js_rol") || "admin") as "mensajero" | "admin" | "patinador",
  filtroSol: "todas" as EstadoFiltroSolicitudes, paginaSol: 1, buscarSol: "", origenSol: "todos" as OrigenFiltroSolicitudes, diaSol: "",
  tabA: "inicio", tabM: "inicio", subMas: "resultados",
  // Oficina → Pedidos
  filtroA: estadoInicialPedidos(), buscarA: "", diaPedA: "", mensPedA: "", paginaA: 1,
  // Oficina → Clientes
  filtroCli: "todos", buscarCli: "", diaCliF: "", paginaCli: 1,
  // Oficina → Caja y Sueldos
  tabCaja: (tabCajaGuardada === "mensajeros" || tabCajaGuardada === "patinadores" || tabCajaGuardada === "liquidaciones" || tabCajaGuardada === "arqueos" ? tabCajaGuardada : "caja") as "caja" | "mensajeros" | "patinadores" | "liquidaciones" | "arqueos",
  diaCaja: hoy(), diaLibro: hoy(), semA: semanaDe(hoy()), paginaLiq: 1, diaLiq: "", estadoLiq: "todos" as "todos" | "cobrar" | "favor" | "paz", buscarLiq: "",
  // Oficina → Cuentas
  tabCuentas: (tabCuentasGuardada === "movimientos" || tabCuentasGuardada === "ganancias" ? tabCuentasGuardada : "cuentas") as "cuentas" | "movimientos" | "ganancias",
  buscarCue: "", buscarGan: "", diaInternos: "", medioInternos: "" as "" | "efectivo" | "nequi" | "bancolombia", paginaInternos: 1, tipoCue: "todos" as "todos" | "pagos" | "compras" | "ganancias", paginaCue: 1, paginaGan: 1,
  desdeCue: moverDia(hoy(), -30), hastaCue: hoy(),
  // Mensajero
  // subPedM: sub-pestaña de Pedidos (Todos, Por entregar, Por recoger), guardada en js_pedidos_m
  subPedM: (subPedMGuardada === "entregar" || subPedMGuardada === "recoger" ? subPedMGuardada : "todos") as "todos" | "entregar" | "recoger",
  miMensajero: leer("js_mensajero"), actuarComo: false, diaPedM: "", diaEntM: hoy(), semM: semanaDe(hoy()), ultimaGuia: "",
  // Modo Patinador de administración: pestaña (Caja o Historial) y el patinador elegido, guardado en js_patinador
  tabP: "caja" as "caja" | "historial", miPatinador: leer("js_patinador"),
  // Más → Resultados
  rangoPanel: "mes",
  // Más → Historial
  paginaHist: 1,
  // Personal
  paginaPersonal: 1, paginaAcceso: 1,
};
