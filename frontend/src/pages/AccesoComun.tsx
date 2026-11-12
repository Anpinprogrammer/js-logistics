/* Piezas compartidas de las pantallas de acceso de la oficina: ingreso, recuperar y restablecer.
   Las clases son exactamente las del ingreso original: aquí solo se reutilizan, no se cambia el diseño. */
import type { CSSProperties, ReactNode, Ref } from "react";

/*
 * Animación de entrada del ingreso (pages/intro/). Solo `Ingreso.tsx` pasa estas props, y solo mientras la animación corre:
 * traen el estilo del cuadro actual para cada pieza y las capas decorativas. Sin ellas (recuperar, restablecer y el ingreso
 * cuando la animación ya terminó) todo queda exactamente como siempre.
 */
type ConRef<E> = { ref?: Ref<E>; style?: CSSProperties };
export type IntroMarco = {
  raiz: ConRef<HTMLDivElement>;
  fondo: CSSProperties; malla: CSSProperties; rutas: CSSProperties;
  nodos: { punto: CSSProperties; pulso: CSSProperties }[];
  manchas: CSSProperties;
  /** Capas decorativas detrás de la tarjeta (mensajeros, onda, chispas, telemetría). */
  detras: ReactNode;
  tarjeta: ConRef<HTMLDivElement>; borde: CSSProperties; halo: CSSProperties;
  /** El vidrio de la tarjeta mientras se revela y el trazo de luz del borde. */
  vidrio: ReactNode;
  /** Capas decorativas encima de todo (marca blanca, destello, viñeta). */
  frente: ReactNode;
};
export type IntroCabecera = {
  insignia: ConRef<HTMLDivElement>; halo: CSSProperties; placa: ConRef<HTMLDivElement>; icono: CSSProperties;
  ceja: CSSProperties; titulo: ConRef<HTMLHeadingElement>;
  /** El título letra por letra, encima del título real. */
  letras: ReactNode;
  descripcion: CSSProperties;
};
export type IntroBoton = ConRef<HTMLButtonElement>;

export const TARJETA =
  "relative space-y-3 rounded-3xl border border-slate-200/90 bg-white dark:border-0 dark:bg-[#0f172a]/75 p-4 sm:space-y-5 sm:p-9 shadow-2xl shadow-slate-900/[0.08] dark:shadow-[0_24px_80px_-20px_rgba(37,99,235,.5),0_8px_30px_rgba(0,0,0,.5)] backdrop-blur-xl dark:backdrop-blur-[16px]";

export const ENTRADA =
  "peer w-full rounded-xl border border-slate-300/80 bg-slate-50 dark:border-[#334155] dark:bg-[#070B19]/70 py-[9px] pl-11 text-base sm:py-3 sm:text-[15px] text-slate-900 dark:text-slate-100 " +
  "placeholder:text-slate-400 dark:placeholder:text-slate-500 transition duration-200 hover:border-slate-500 " +
  "focus:border-sky-500 dark:focus:border-[#38bdf8] focus:outline-none focus:ring-4 focus:ring-[#38bdf8]/20 focus:shadow-[0_0_24px_-6px_#38bdf8] disabled:opacity-60";

export const ICONO =
  "pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500 transition-colors duration-200 peer-focus:text-[#38bdf8]";

export const ENLACE =
  "font-semibold text-sky-600 dark:text-[#38bdf8] underline-offset-4 transition-colors hover:text-sky-700 dark:hover:text-cyan-300 hover:underline";

const ic = { viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, "aria-hidden": true };

export const IcCorreo = () => <svg {...ic} className="size-5"><rect x="3" y="5" width="18" height="14" rx="2.5" /><path d="m4 7.5 8 6 8-6" /></svg>;
export const IcCandado = () => <svg {...ic} className="size-5"><rect x="4.5" y="10.5" width="15" height="10" rx="2.5" /><path d="M8 10.5V8a4 4 0 0 1 8 0v2.5M12 14.5v2" /></svg>;
export const IcOjo = () => <svg {...ic} className="size-5"><path d="M2 12s3.6-6.5 10-6.5S22 12 22 12s-3.6 6.5-10 6.5S2 12 2 12z" /><circle cx="12" cy="12" r="3" /></svg>;
export const IcOjoTachado = () => <svg {...ic} className="size-5"><path d="M10.6 5.6A10 10 0 0 1 12 5.5c6.4 0 10 6.5 10 6.5a17 17 0 0 1-3.2 4M6.5 7A16.6 16.6 0 0 0 2 12s3.6 6.5 10 6.5c1.6 0 3-.4 4.3-1M9.9 9.9a3 3 0 0 0 4.2 4.2M3 3l18 18" /></svg>;
export const IcFlecha = () => <svg {...ic} className="size-5 transition-transform duration-200 group-hover:translate-x-1 group-active:translate-x-2"><path d="M5 12h14M13 6l6 6-6 6" /></svg>;
export const IcAlerta = () => <svg {...ic} className="mt-0.5 size-5 shrink-0"><path d="M12 8v5M12 16.5v.1" /><path d="M10.3 3.9 2.4 17.5A2 2 0 0 0 4.1 20.5h15.8a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" /></svg>;
export const IcCheck = () => <svg {...ic} className="size-7"><circle cx="12" cy="12" r="9" /><path d="m8 12.5 2.8 2.8L16.5 9.5" /></svg>;
export const IcVolver = () => <svg {...ic} className="size-5"><path d="M19 12H5M11 18l-6-6 6-6" /></svg>;

/** Fondo, tarjeta con borde brillante y ancho: el mismo marco del ingreso. */
export function MarcoAcceso({ children, intro, seguirTema = false, controles }: { children: ReactNode; intro?: IntroMarco; seguirTema?: boolean; controles?: ReactNode }) {
  return (
    <div ref={intro?.raiz.ref} style={intro?.raiz.style} className={`${seguirTema ? "" : "dark"} [--acceso-red:#0284c7] dark:[--acceso-red:#38bdf8] [--acceso-grid:rgba(2,132,199,0.08)] dark:[--acceso-grid:rgba(56,189,248,0.09)] relative isolate grid min-h-dvh place-items-center overflow-hidden bg-slate-50 dark:bg-[#0b0f19] px-4 py-6 sm:py-10 text-slate-700 dark:text-slate-200 transition-colors duration-300`}>
      {controles}
      <div aria-hidden style={intro?.fondo} className="pointer-events-none absolute inset-0 -z-10">
        <div
          className="jsl-malla absolute inset-0 opacity-100 dark:opacity-60"
          style={{
            backgroundImage:
              "linear-gradient(to right, var(--acceso-grid) 1px, transparent 1px), linear-gradient(to bottom, var(--acceso-grid) 1px, transparent 1px)",
            backgroundSize: "48px 48px",
            maskImage: "radial-gradient(ellipse 70% 60% at 50% 45%, #000 30%, transparent 100%)",
            WebkitMaskImage: "radial-gradient(ellipse 70% 60% at 50% 45%, #000 30%, transparent 100%)",
            ...intro?.malla,
          }}
        />
        <svg style={intro?.rutas} className="absolute inset-0 size-full opacity-60 dark:opacity-50" preserveAspectRatio="xMidYMid slice" viewBox="0 0 1200 800" fill="none">
          <path className="jsl-ruta" d="M-20 620 C 220 560, 300 300, 560 340 S 900 520, 1220 180" stroke="url(#jslRuta)" strokeWidth="1.5" strokeDasharray="6 10" />
          <path className="jsl-ruta jsl-ruta-2" d="M-20 220 C 200 260, 360 120, 620 190 S 960 80, 1220 360" stroke="url(#jslRuta)" strokeWidth="1.2" strokeDasharray="4 12" />
          {[[560, 340], [300, 330], [900, 505], [620, 190], [960, 120]].map(([x, y], i) => (
            <g key={i}>
              <circle cx={x} cy={y} r="3.5" fill="var(--acceso-red)" style={intro?.nodos[i]?.punto} />
              <circle className="jsl-pulso" cx={x} cy={y} r="3.5" stroke="var(--acceso-red)" strokeWidth="1.2" style={{ animationDelay: `${i * 0.7}s`, ...intro?.nodos[i]?.pulso }} />
            </g>
          ))}
          <defs>
            <linearGradient id="jslRuta" x1="0" x2="1">
              <stop offset="0" stopColor="#0284c7" stopOpacity="0" />
              <stop offset=".5" stopColor="var(--acceso-red)" />
              <stop offset="1" stopColor="#0284c7" stopOpacity="0" />
            </linearGradient>
          </defs>
        </svg>
        <div style={intro?.manchas} className="jsl-flota absolute -left-32 -top-32 size-[28rem] rounded-full bg-[#0284c7]/30 blur-[120px]" />
        <div style={intro?.manchas} className="jsl-flota jsl-flota-2 absolute -bottom-40 -right-24 size-[32rem] rounded-full bg-[#38bdf8]/20 blur-[130px]" />
        <div style={intro?.manchas} className="absolute left-1/2 top-1/3 size-72 -translate-x-1/2 rounded-full bg-indigo-500/10 blur-[110px]" />
        {intro?.detras}
      </div>

      <div ref={intro?.tarjeta.ref} style={intro?.tarjeta.style} className="relative w-full max-w-[21rem] sm:max-w-[26rem]">
        <div aria-hidden style={intro?.borde} className="absolute -inset-px rounded-[1.6rem] bg-gradient-to-br from-[#38bdf8] via-[#2563eb]/40 to-[#38bdf8]/60 opacity-70 blur-[1px]" />
        <div aria-hidden style={intro?.halo} className="absolute -inset-6 -z-10 rounded-[2.5rem] bg-[#2563eb]/20 blur-3xl" />
        {intro?.vidrio}
        {children}
      </div>
      {intro?.frente}
    </div>
  );
}

/** Logo, "Logistics · Cali" y el título de la pantalla, con el mismo tamaño del ingreso. */
export function CabeceraAcceso({ titulo, descripcion, intro }: { titulo: string; descripcion: ReactNode; intro?: IntroCabecera }) {
  return (
    <header className="text-center">
      <div ref={intro?.insignia.ref} style={intro?.insignia.style} className="relative mx-auto mb-2 grid size-14 place-items-center sm:mb-5 sm:size-28">
        <span aria-hidden style={intro?.halo} className="absolute -inset-3 rounded-[2rem] bg-[#38bdf8]/50 blur-2xl" />
        <div ref={intro?.placa.ref} style={intro?.placa.style} className="relative grid size-14 place-items-center rounded-2xl bg-gradient-to-br from-white to-sky-100 p-1.5 sm:size-28 sm:rounded-[1.75rem] sm:p-3 shadow-[0_0_0_1px_rgba(255,255,255,.7),0_0_28px_6px_rgba(56,189,248,.45),0_12px_28px_-6px_rgba(2,132,199,.55),inset_0_1px_0_#fff]">
          {/* El .webp trae "LOGISTICS CALI" en blanco (invisible sobre el badge claro): se recorta y el texto va aparte. */}
          <div style={intro?.icono} className="relative size-full overflow-hidden rounded-xl sm:rounded-2xl">
            <img src="/icono-96.webp" alt="JS Logistics Cali" width={96} height={96} className="absolute left-[-10%] top-[3%] w-[120%] max-w-none" />
          </div>
        </div>
      </div>
      <p style={intro?.ceja} className="-mt-1 mb-2 text-[11px] font-bold dark:font-semibold uppercase tracking-[0.32em] text-sky-600 dark:text-[#38bdf8]">Logistics · Cali</p>
      <h1 ref={intro?.titulo.ref} style={intro?.titulo.style} className="text-2xl font-black dark:font-bold tracking-tight text-slate-900 dark:text-white sm:text-4xl">{titulo}{intro?.letras}</h1>
      <p style={intro?.descripcion} className="mx-auto mt-1 max-w-[19rem] text-xs sm:mt-2.5 sm:text-sm leading-relaxed text-slate-500 dark:text-slate-300">{descripcion}</p>
    </header>
  );
}

/** Botón principal del acceso, con el mismo degradado y animación del ingreso. */
export function BotonAcceso({ cargando, children, cargandoTexto, intro }: { cargando: boolean; children: ReactNode; cargandoTexto: string; intro?: IntroBoton }) {
  return (
    <button
      type="submit" disabled={cargando} ref={intro?.ref} style={intro?.style}
      className="group relative flex w-full items-center justify-center gap-2 overflow-hidden rounded-xl bg-gradient-to-r from-[#0284c7] to-[#22d3ee] px-5 py-2.5 text-base font-bold sm:py-4 text-white shadow-[0_8px_24px_-8px_rgba(34,211,238,.6)] transition duration-200 hover:-translate-y-0.5 hover:shadow-[0_14px_34px_-8px_rgba(34,211,238,.8)] active:translate-y-0 disabled:cursor-wait disabled:opacity-90 disabled:hover:translate-y-0"
    >
      <span aria-hidden className="absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/25 to-transparent transition-transform duration-700 group-hover:translate-x-full" />
      {cargando ? (
        <>
          <svg className="size-5 animate-spin" viewBox="0 0 24 24" fill="none" aria-hidden>
            <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity=".3" strokeWidth="3" />
            <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
          </svg>
          <span className="relative">{cargandoTexto}</span>
        </>
      ) : (
        <>
          <span className="relative">{children}</span>
          <span className="relative"><IcFlecha /></span>
        </>
      )}
    </button>
  );
}

/** Aviso de error con el mismo formato del ingreso. */
export function AvisoError({ children }: { children: ReactNode }) {
  return (
    <div role="alert" className="flex gap-2.5 rounded-xl border border-red-400/30 bg-red-500/10 px-3.5 py-3 text-sm text-red-700 dark:text-red-200">
      <IcAlerta />
      <span>{children}</span>
    </div>
  );
}
