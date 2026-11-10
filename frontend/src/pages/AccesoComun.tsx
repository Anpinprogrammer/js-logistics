/* Piezas compartidas de las pantallas de acceso de la oficina: ingreso, recuperar y restablecer.
   Las clases son exactamente las del ingreso original: aquí solo se reutilizan, no se cambia el diseño. */
import type { CSSProperties, ReactNode } from "react";

export const TARJETA =
  "relative space-y-4 rounded-3xl bg-[#0f172a]/75 p-5 sm:space-y-5 sm:p-9 shadow-[0_24px_80px_-20px_rgba(37,99,235,.5),0_8px_30px_rgba(0,0,0,.5)] backdrop-blur-[16px]";

export const ENTRADA =
  "peer w-full rounded-xl border border-[#334155] bg-[#070B19]/70 py-2.5 pl-11 text-base sm:py-3 sm:text-[15px] text-slate-100 " +
  "placeholder:text-slate-500 transition duration-200 hover:border-slate-500 " +
  "focus:border-[#38bdf8] focus:outline-none focus:ring-4 focus:ring-[#38bdf8]/20 focus:shadow-[0_0_24px_-6px_#38bdf8] disabled:opacity-60";

export const ICONO =
  "pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500 transition-colors duration-200 peer-focus:text-[#38bdf8]";

export const ENLACE =
  "font-semibold text-[#38bdf8] underline-offset-4 transition-colors hover:text-cyan-300 hover:underline";

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
export function MarcoAcceso({ children, intro }: { children: ReactNode; intro?: boolean }) {
  return (
    <div className="relative isolate grid min-h-dvh place-items-center overflow-hidden bg-[#0b0f19] px-4 py-6 sm:py-10 text-slate-200">
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
        <div
          className="jsl-malla absolute inset-0 opacity-60"
          style={{
            backgroundImage:
              "linear-gradient(to right, rgba(56,189,248,.09) 1px, transparent 1px), linear-gradient(to bottom, rgba(56,189,248,.09) 1px, transparent 1px)",
            backgroundSize: "48px 48px",
            maskImage: "radial-gradient(ellipse 70% 60% at 50% 45%, #000 30%, transparent 100%)",
            WebkitMaskImage: "radial-gradient(ellipse 70% 60% at 50% 45%, #000 30%, transparent 100%)",
          }}
        />
        <svg className="absolute inset-0 size-full opacity-50" preserveAspectRatio="xMidYMid slice" viewBox="0 0 1200 800" fill="none">
          <path className="jsl-ruta" d="M-20 620 C 220 560, 300 300, 560 340 S 900 520, 1220 180" stroke="url(#jslRuta)" strokeWidth="1.5" strokeDasharray="6 10" />
          <path className="jsl-ruta jsl-ruta-2" d="M-20 220 C 200 260, 360 120, 620 190 S 960 80, 1220 360" stroke="url(#jslRuta)" strokeWidth="1.2" strokeDasharray="4 12" />
          {[[560, 340], [300, 330], [900, 505], [620, 190], [960, 120]].map(([x, y], i) => (
            <g key={i}>
              <circle cx={x} cy={y} r="3.5" fill="#38bdf8" />
              <circle className="jsl-pulso" cx={x} cy={y} r="3.5" stroke="#38bdf8" strokeWidth="1.2" style={{ animationDelay: `${i * 0.7}s` }} />
            </g>
          ))}
          <defs>
            <linearGradient id="jslRuta" x1="0" x2="1">
              <stop offset="0" stopColor="#0284c7" stopOpacity="0" />
              <stop offset=".5" stopColor="#38bdf8" />
              <stop offset="1" stopColor="#0284c7" stopOpacity="0" />
            </linearGradient>
          </defs>
        </svg>
        <div className="jsl-flota absolute -left-32 -top-32 size-[28rem] rounded-full bg-[#0284c7]/30 blur-[120px]" />
        <div className="jsl-flota jsl-flota-2 absolute -bottom-40 -right-24 size-[32rem] rounded-full bg-[#38bdf8]/20 blur-[130px]" />
        <div className="absolute left-1/2 top-1/3 size-72 -translate-x-1/2 rounded-full bg-indigo-500/10 blur-[110px]" />
      </div>

      <div className={"relative w-full max-w-[22rem] sm:max-w-[26rem]" + (intro ? " jsl-intro-carta" : "")} data-intro-card>
        <div aria-hidden className="absolute -inset-px rounded-[1.6rem] bg-gradient-to-br from-[#38bdf8] via-[#2563eb]/40 to-[#38bdf8]/60 opacity-70 blur-[1px]" />
        <div aria-hidden className="absolute -inset-6 -z-10 rounded-[2.5rem] bg-[#2563eb]/20 blur-3xl" />
        {children}
      </div>
    </div>
  );
}

/** Logo, "Logistics · Cali" y el título de la pantalla, con el mismo tamaño del ingreso. */
export function CabeceraAcceso({ titulo, descripcion, intro }: { titulo: string; descripcion: ReactNode; intro?: boolean }) {
  return (
    <header className="text-center">
      <div className={"relative mx-auto mb-3 grid size-20 place-items-center sm:mb-5 sm:size-28" + (intro ? " jsl-intro-badge" : "")} data-intro-badge>
        <span aria-hidden className="absolute -inset-3 rounded-[2rem] bg-[#38bdf8]/50 blur-2xl" />
        <div className="relative grid size-20 place-items-center rounded-[1.4rem] bg-gradient-to-br from-white to-sky-100 p-2 sm:size-28 sm:rounded-[1.75rem] sm:p-3 shadow-[0_0_0_1px_rgba(255,255,255,.7),0_0_28px_6px_rgba(56,189,248,.45),0_12px_28px_-6px_rgba(2,132,199,.55),inset_0_1px_0_#fff]">
          {/* El .webp trae "LOGISTICS CALI" en blanco (invisible sobre el badge claro): se recorta y el texto va aparte. */}
          <div className="relative size-full overflow-hidden rounded-2xl">
            <img src="/icono-96.webp" alt="JS Logistics Cali" width={96} height={96} className={"absolute left-[-10%] top-[3%] w-[120%] max-w-none" + (intro ? " jsl-intro-logo" : "")} />
          </div>
        </div>
      </div>
      <p className={"-mt-1 mb-2 text-[11px] font-semibold uppercase tracking-[0.32em] text-[#38bdf8]" + (intro ? " jsl-intro-ceja" : "")}>Logistics · Cali</p>
      <h1 className="text-3xl font-bold tracking-tight text-white sm:text-4xl" aria-label={titulo}>
        {intro ? titulo.split("").map((c, i) => (
          <span key={i} className="jsl-intro-letra"
            style={{ animationDelay: `${2.033 + i * 0.037}s`, "--rot": i % 2 ? "8deg" : "-8deg" } as CSSProperties}>{c === " " ? "\u00a0" : c}</span>
        )) : titulo}
      </h1>
      <p className={"mx-auto mt-2 max-w-[19rem] text-[13px] sm:mt-2.5 sm:text-sm leading-relaxed text-slate-300" + (intro ? " jsl-intro-desc" : "")}>{descripcion}</p>
    </header>
  );
}

/** Botón principal del acceso, con el mismo degradado y animación del ingreso. */
export function BotonAcceso({ cargando, children, cargandoTexto, intro }: { cargando: boolean; children: ReactNode; cargandoTexto: string; intro?: boolean }) {
  return (
    <button
      type="submit" disabled={cargando}
      data-intro-button className={"group relative flex w-full items-center justify-center gap-2 overflow-hidden rounded-xl bg-gradient-to-r from-[#0284c7] to-[#22d3ee] px-5 py-3 text-base font-bold sm:py-4 text-white shadow-[0_8px_24px_-8px_rgba(34,211,238,.6)] transition duration-200 hover:-translate-y-0.5 hover:shadow-[0_14px_34px_-8px_rgba(34,211,238,.8)] active:translate-y-0 disabled:cursor-wait disabled:opacity-90 disabled:hover:translate-y-0" + (intro ? " jsl-intro-boton" : "")}
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
    <div role="alert" className="flex gap-2.5 rounded-xl border border-red-400/30 bg-red-500/10 px-3.5 py-3 text-sm text-red-200">
      <IcAlerta />
      <span>{children}</span>
    </div>
  );
}
