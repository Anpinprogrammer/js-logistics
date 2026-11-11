/* Estado de la interfaz que se conserva al cambiar de pestaña (como las variables globales del prototipo). */
import { hoy, moverDia, semanaDe } from "./motor";
import type { GrupoSolicitud } from "../api/tipos";

const leer = (k: string) => { try { return localStorage.getItem(k) || ""; } catch { return ""; } };
export const guardarLocal = (k: string, v: string) => { try { localStorage.setItem(k, v); } catch { /* sin almacenamiento */ } };

const tabCajaGuardada = leer("js_caja");
const tabCuentasGuardada = leer("js_cuentas");

export const E = {
  rol: (leer("js_rol") || "admin") as "mensajero" | "admin",
  filtroSol: "todas" as GrupoSolicitud, paginaSol: 1,
  tabA: "inicio", tabM: "inicio", subMas: "resultados",
  // Oficina → Pedidos
  filtroA: "sin", buscarA: "", diaPedA: "", mensPedA: "", paginaA: 1,
  // Oficina → Clientes
  filtroCli: "todos", buscarCli: "", diaCliF: "", paginaCli: 1,
  // Oficina → Caja y Sueldos
  tabCaja: (tabCajaGuardada === "mensajeros" || tabCajaGuardada === "liquidaciones" || tabCajaGuardada === "arqueos" ? tabCajaGuardada : "caja") as "caja" | "mensajeros" | "liquidaciones" | "arqueos",
  diaCaja: hoy(), diaLibro: hoy(), semA: semanaDe(hoy()), paginaLiq: 1, diaLiq: "", estadoLiq: "todos" as "todos" | "cobrar" | "favor" | "paz", buscarLiq: "",
  // Oficina → Cuentas
  tabCuentas: (tabCuentasGuardada === "movimientos" || tabCuentasGuardada === "ganancias" ? tabCuentasGuardada : "cuentas") as "cuentas" | "movimientos" | "ganancias",
  buscarCue: "", buscarGan: "", diaInternos: "", medioInternos: "" as "" | "efectivo" | "nequi" | "bancolombia", paginaInternos: 1, tipoCue: "todos" as "todos" | "pagos" | "compras" | "ganancias", paginaCue: 1, paginaGan: 1,
  desdeCue: moverDia(hoy(), -30), hastaCue: hoy(),
  // Mensajero
  miMensajero: leer("js_mensajero"), actuarComo: false, diaPedM: "", diaEntM: hoy(), semM: semanaDe(hoy()), ultimaGuia: "",
  // Más → Resultados
  rangoPanel: "mes",
  // Más → Historial
  paginaHist: 1,
  // Personal
  paginaPersonal: 1, paginaAcceso: 1,
};
