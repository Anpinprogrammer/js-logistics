/* Avisos y confirmaciones de la app interna (oficina, asistentes y mensajeros), hechos con SweetAlert2.
   Toman los colores de la app (los mismos del tema claro/oscuro de `.jsl`), así que cambian solos con el tema.
   Si hay una ventana (`<dialog>`) abierta, el aviso se monta dentro de ella: lo que está fuera de un diálogo modal
   queda inerte y tapado, y la confirmación no se podría tocar. */
import type { SweetAlertIcon, SweetAlertOptions } from "sweetalert2";
import "./alertas.css";

/* SweetAlert2 se descarga con el primer aviso, no al abrir la app: así no pesa en la carga inicial.
   Después queda en memoria. Las opciones se leen al mostrar el aviso (qué ventana está abierta en ese momento). */
let cargaSwal: Promise<typeof import("sweetalert2").default> | null = null;
const swal = () => (cargaSwal ??= import("sweetalert2").then(m => m.default).catch(e => { cargaSwal = null; throw e; }));
/** Precarga la librería de avisos cuando el navegador queda libre, para que el primer aviso salga sin espera. */
export const precargarAvisos = () => { void swal().catch(() => { /* se reintenta con el primer aviso */ }); };

export type TonoAviso = "exito" | "error" | "aviso" | "info";

const ICONOS: Record<TonoAviso, SweetAlertIcon> = { exito: "success", error: "error", aviso: "warning", info: "info" };

/** Variables del tema que el aviso necesita copiar, porque se dibuja fuera de `.jsl` cuando no hay ventana abierta. */
const VARIABLES = ["--papel", "--tinta", "--suave", "--linea", "--hueco", "--marca2"] as const;

function leerTema() {
  const raiz = document.querySelector<HTMLElement>(".jsl");
  const estilo = raiz ? getComputedStyle(raiz) : null;
  const oscuro = raiz?.dataset.theme
    ? raiz.dataset.theme === "dark"
    : !!window.matchMedia?.("(prefers-color-scheme: dark)").matches;
  const valores = Object.fromEntries(VARIABLES.map(v => [v, estilo?.getPropertyValue(v).trim() || ""]));
  return {
    oscuro,
    valores,
    fondo: valores["--papel"] || (oscuro ? "#0f172a" : "#ffffff"),
    texto: valores["--tinta"] || (oscuro ? "#f8fafc" : "#0f172a"),
  };
}

function opcionesBase(): SweetAlertOptions {
  const { oscuro, valores, fondo, texto } = leerTema();
  return {
    target: document.querySelector<HTMLElement>("dialog[open]") ?? document.body,
    background: fondo,
    color: texto,
    buttonsStyling: false,
    heightAuto: false,
    scrollbarPadding: false,
    customClass: {
      container: "jsl-swal" + (oscuro ? " jsl-swal-oscuro" : ""),
      popup: "jsl-swal-popup",
      title: "jsl-swal-titulo",
      htmlContainer: "jsl-swal-texto",
      actions: "jsl-swal-acciones",
      confirmButton: "jsl-swal-ok",
      cancelButton: "jsl-swal-cancelar",
    },
    didOpen: el => { for (const [k, v] of Object.entries(valores)) if (v) el.style.setProperty(k, v); },
  };
}

/** Aviso corto que se quita solo (reemplaza al "toast" de la app interna). */
export async function avisoRapido(mensaje: string, tono: TonoAviso = "exito") {
  const Swal = await swal();
  const base = opcionesBase();
  return Swal.fire({
    ...base,
    toast: true,
    position: "top-end",
    icon: ICONOS[tono],
    title: mensaje,
    showConfirmButton: false,
    timer: tono === "error" ? 4500 : 2600,
    timerProgressBar: true,
    customClass: { ...base.customClass, container: base.customClass?.container + " jsl-swal-aviso", popup: "jsl-swal-popup jsl-swal-toast" },
  });
}

export const alertaAdmin = {
  exito: (titulo: string, texto?: string) => avisoRapido(texto ? `${titulo}. ${texto}` : titulo, "exito"),
  error: async (titulo: string, texto?: string) => (await swal()).fire({ ...opcionesBase(), icon: "error", title: titulo, text: texto, confirmButtonText: "Entendido" }),
  aviso: async (titulo: string, texto?: string) => (await swal()).fire({ ...opcionesBase(), icon: "warning", title: titulo, text: texto, confirmButtonText: "Aceptar" }),

  /** Pregunta antes de una acción. `peligro` pinta el botón en rojo (borrar, quitar, deshacer). */
  async confirmar({ titulo, texto, boton = "Sí, continuar", cancelar = "Cancelar", peligro = false, icono = "question" }: {
    titulo: string; texto?: string; boton?: string; cancelar?: string; peligro?: boolean; icono?: SweetAlertIcon;
  }): Promise<boolean> {
    const Swal = await swal();
    const base = opcionesBase();
    const r = await Swal.fire({
      ...base,
      icon: peligro && icono === "question" ? "warning" : icono,
      title: titulo,
      text: texto,
      showCancelButton: true,
      confirmButtonText: boton,
      cancelButtonText: cancelar,
      reverseButtons: true,
      focusCancel: peligro,
      customClass: { ...base.customClass, confirmButton: "jsl-swal-ok" + (peligro ? " peligro" : "") },
    });
    return r.isConfirmed;
  },
};

/** Elige el tono de un aviso suelto según cómo empieza el texto (la app interna los escribe como frases cortas). */
export function tonoDeAviso(mensaje: string): TonoAviso {
  if (/^(No se pudo|No pudimos|Error|Falló)/i.test(mensaje)) return "error";
  if (/^(Escribe|Elige|Selecciona|Los valores|Ya hay|Falta|No hay|Pon )/i.test(mensaje)) return "aviso";
  return "exito";
}
