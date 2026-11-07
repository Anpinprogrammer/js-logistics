/* Piezas de interfaz compartidas: botones, campos, avisos, diálogos y etiquetas. */
import { useEffect, useId, useRef, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes } from "react";
import type { Pedido } from "../api/tipos";

const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(" ");

type Variante = "primario" | "secundario" | "peligro" | "fantasma";
const VARIANTES: Record<Variante, string> = {
  primario: "bg-marca text-white hover:brightness-110",
  secundario: "bg-papel text-tinta border border-linea hover:bg-hueco",
  peligro: "bg-rojo text-white hover:brightness-110",
  fantasma: "text-marca hover:bg-marca-claro"
};

export function Boton({ variante = "primario", chico, cargando, className, children, disabled, ...p }:
  ButtonHTMLAttributes<HTMLButtonElement> & { variante?: Variante; chico?: boolean; cargando?: boolean }) {
  return (
    <button
      {...p}
      disabled={disabled || cargando}
      className={cx(
        "inline-flex items-center justify-center gap-2 rounded-xl font-semibold transition disabled:cursor-not-allowed disabled:opacity-55",
        chico ? "min-h-9 px-3 text-sm" : "min-h-11 px-4",
        VARIANTES[variante], className
      )}
    >
      {cargando && <span className="size-4 animate-spin rounded-full border-2 border-current border-t-transparent" aria-hidden />}
      {children}
    </button>
  );
}

export function Campo({ etiqueta, ayuda, error, className, ...p }: InputHTMLAttributes<HTMLInputElement> & { etiqueta: string; ayuda?: string; error?: string }) {
  const id = useId();
  return (
    <div className={className}>
      <label htmlFor={id} className="etiqueta">{etiqueta}</label>
      <input id={id} {...p} className="entrada" aria-invalid={!!error} aria-describedby={ayuda || error ? id + "-a" : undefined} />
      {(error || ayuda) && <p id={id + "-a"} className={cx("mt-1 text-xs", error ? "text-rojo" : "text-suave")}>{error || ayuda}</p>}
    </div>
  );
}

export function Selector({ etiqueta, children, className, ...p }: SelectHTMLAttributes<HTMLSelectElement> & { etiqueta: string }) {
  const id = useId();
  return (
    <div className={className}>
      <label htmlFor={id} className="etiqueta">{etiqueta}</label>
      <select id={id} {...p} className="entrada">{children}</select>
    </div>
  );
}

export function Casilla({ etiqueta, checked, onChange }: { etiqueta: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex min-h-11 cursor-pointer items-center gap-3 text-sm">
      <input type="checkbox" className="size-5 accent-[var(--color-marca)]" checked={checked} onChange={e => onChange(e.target.checked)} />
      {etiqueta}
    </label>
  );
}

export function Aviso({ tipo = "info", children }: { tipo?: "info" | "alerta" | "error" | "ok"; children: ReactNode }) {
  const t = { info: "bg-marca-claro text-tinta", alerta: "bg-ambar-claro text-tinta", error: "bg-rojo-claro text-rojo", ok: "bg-verde-claro text-tinta" }[tipo];
  return <div role={tipo === "error" ? "alert" : "status"} className={cx("rounded-xl px-4 py-3 text-sm", t)}>{children}</div>;
}

export const Cargando = ({ texto = "Cargando…" }: { texto?: string }) => (
  <div className="flex items-center justify-center gap-3 py-12 text-suave" role="status">
    <span className="size-5 animate-spin rounded-full border-2 border-marca border-t-transparent" aria-hidden />{texto}
  </div>
);

export const Vacio = ({ titulo, children }: { titulo: string; children?: ReactNode }) => (
  <div className="py-12 text-center text-suave"><p className="font-semibold text-tinta">{titulo}</p>{children && <div className="mt-1 text-sm">{children}</div>}</div>
);

export const Titulo = ({ children, accion, sub }: { children: ReactNode; accion?: ReactNode; sub?: ReactNode }) => (
  <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
    <div><h1 className="text-xl font-bold md:text-2xl">{children}</h1>{sub && <p className="text-sm text-suave">{sub}</p>}</div>
    {accion}
  </div>
);

/** Diálogo modal nativo (<dialog>): foco atrapado y Escape para cerrar. */
export function Dialogo({ abierto, alCerrar, titulo, children }: { abierto: boolean; alCerrar: () => void; titulo: string; children: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (abierto && !d.open) d.showModal();
    if (!abierto && d.open) d.close();
  }, [abierto]);
  return (
    <dialog
      ref={ref}
      onClose={alCerrar}
      onClick={e => { if (e.target === ref.current) alCerrar(); }}
      className="m-auto w-[min(560px,calc(100vw-24px))] max-h-[calc(100dvh-24px)] rounded-caja bg-papel p-0 text-tinta shadow-2xl backdrop:bg-black/50"
    >
      {abierto && (
        <div className="p-5">
          <div className="mb-4 flex items-start justify-between gap-3">
            <h2 className="text-lg font-bold">{titulo}</h2>
            <button onClick={alCerrar} className="-m-2 rounded-lg p-2 text-suave hover:bg-hueco" aria-label="Cerrar">✕</button>
          </div>
          {children}
        </div>
      )}
    </dialog>
  );
}

export function EtiquetaEstado({ p }: { p: Pedido }) {
  const e = {
    pendiente: ["En ruta", "bg-ambar-claro text-ambar"],
    entregado: ["Entregado", "bg-verde-claro text-verde"],
    devuelto: ["Devuelto", "bg-rojo-claro text-rojo"]
  }[p.estado];
  return (
    <span className="inline-flex flex-wrap gap-1">
      <span className={cx("rounded-full px-2.5 py-0.5 text-xs font-semibold", e[1])}>{e[0]}</span>
      {p.difCobro !== 0 && !p.difRevisada && <span className="rounded-full bg-rojo-claro px-2.5 py-0.5 text-xs font-semibold text-rojo">Diferencia</span>}
      {p.cambio && <span className="rounded-full bg-marca-claro px-2.5 py-0.5 text-xs font-semibold text-marca">Cambio</span>}
    </span>
  );
}

/** Fila de datos "etiqueta: valor" para fichas de detalle. */
export const Dato = ({ k, children }: { k: string; children: ReactNode }) => (
  <div className="flex justify-between gap-4 border-b border-linea py-2 text-sm last:border-0">
    <dt className="text-suave">{k}</dt><dd className="text-right font-medium">{children}</dd>
  </div>
);

export { cx };
