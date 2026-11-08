/* Estado de la interfaz que se conserva al cambiar de pestaña (como las variables globales del prototipo). */
import { hoy, semanaDe } from "./motor";

const leer = (k: string) => { try { return localStorage.getItem(k) || ""; } catch { return ""; } };
export const guardarLocal = (k: string, v: string) => { try { localStorage.setItem(k, v); } catch { /* sin almacenamiento */ } };

export const E = {
  rol: (leer("js_rol") || "admin") as "mensajero" | "admin",
  tabA: "inicio", tabM: "inicio", subMas: "panel",
  // Oficina → Pedidos
  filtroA: "sin", buscarA: "", diaPedA: "", mensPedA: "", limiteA: 100,
  // Oficina → Clientes
  filtroCli: "todos", buscarCli: "", diaCliF: "",
  // Oficina → Caja y Sueldos
  diaCaja: hoy(), diaLibro: hoy(), cierreAbierto: null as boolean | null, semA: semanaDe(hoy()),
  // Mensajero
  miMensajero: leer("js_mensajero"), actuarComo: false, diaPedM: "", diaEntM: hoy(), semM: semanaDe(hoy()), ultimaGuia: "",
  // Más → Resultados
  rangoPanel: "mes",
};
