/* Selector de una fecha con calendario flotante, estilo cápsula (Airbnb) y colores de la app. */
import { useEffect, useRef, useState } from "react";
import { hoy } from "./motor";

const MESES = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];
const MESES_CORTOS = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
const DIAS = ["D", "L", "M", "M", "J", "V", "S"];
const dos = (n: number) => String(n).padStart(2, "0");
const iso = (a: number, m: number, d: number) => `${a}-${dos(m + 1)}-${dos(d)}`;
const deIso = (v: string) => {
  const [a, m, d] = v.split("-").map(Number);
  return Number.isFinite(a) && Number.isFinite(m) && Number.isFinite(d) ? { a, m: m - 1, d } : null;
};

const IconoCal = () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true"><rect x="3.5" y="5" width="17" height="15.5" rx="2.5" /><path d="M8 3v4M16 3v4M3.5 10h17" /></svg>;
const Chevron = ({ izq = false }: { izq?: boolean }) => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={izq ? "M15 5l-7 7 7 7" : "M9 5l7 7-7 7"} /></svg>;

/** Fecha de un `YYYY-MM-DD` como "03 nov 2026". */
export function fechaCorta(d: string) {
  const x = deIso(d);
  return x ? `${dos(x.d)} ${MESES_CORTOS[x.m] || ""} ${x.a}`.trim() : "";
}

/**
 * Cápsula con la fecha elegida y un calendario de un mes. `valor` va en YYYY-MM-DD y "" = sin filtro.
 */
export function SelectorFecha({ valor, alCambiar, etiqueta = "Fecha", vacio = "Todas las fechas" }: {
  valor: string;
  alCambiar: (v: string) => void;
  etiqueta?: string;
  vacio?: string;
}) {
  const [abierto, setAbierto] = useState(false);
  const caja = useRef<HTMLDivElement>(null);
  const inicial = deIso(valor) || deIso(hoy()) || { a: 2026, m: 0, d: 1 };
  const [vista, setVista] = useState({ a: inicial.a, m: inicial.m });

  useEffect(() => {
    const fuera = (e: MouseEvent) => { if (caja.current && !caja.current.contains(e.target as Node)) setAbierto(false); };
    document.addEventListener("mousedown", fuera);
    return () => document.removeEventListener("mousedown", fuera);
  }, []);

  const abrir = () => {
    const x = deIso(valor) || deIso(hoy()) || inicial;
    setVista({ a: x.a, m: x.m });
    setAbierto(v => !v);
  };
  const mover = (paso: number) => setVista(v => {
    const m = v.m + paso;
    return { a: v.a + Math.floor(m / 12), m: ((m % 12) + 12) % 12 };
  });
  const elegir = (d: number) => { alCambiar(iso(vista.a, vista.m, d)); setAbierto(false); };
  const primeros = new Date(vista.a, vista.m, 1).getDay();
  const dias = new Date(vista.a, vista.m + 1, 0).getDate();
  const hoyIso = hoy();

  return <div className="fecha-picker" ref={caja}>
    <button type="button" className="fecha-btn" onClick={abrir} aria-expanded={abierto} aria-label="Filtrar por fecha">
      <span className="fecha-etq">{etiqueta}</span>
      <span className="fecha-valor">{valor ? fechaCorta(valor) : vacio}<IconoCal /></span>
    </button>
    {abierto ? <div className="fecha-pop" role="dialog" aria-label="Elegir una fecha">
      <div className="fecha-cab">
        <button type="button" className="fecha-nav" onClick={() => mover(-1)} aria-label="Mes anterior"><Chevron izq /></button>
        <span className="fecha-mes">{MESES[vista.m]} {vista.a}</span>
        <button type="button" className="fecha-nav" onClick={() => mover(1)} aria-label="Mes siguiente"><Chevron /></button>
      </div>
      <div className="fecha-semana" aria-hidden="true">{DIAS.map((d, i) => <span key={i}>{d}</span>)}</div>
      <div className="fecha-grid">
        {Array.from({ length: primeros }, (_, i) => <span key={"v" + i} aria-hidden="true" />)}
        {Array.from({ length: dias }, (_, i) => {
          const d = i + 1, f = iso(vista.a, vista.m, d);
          return <button type="button" key={f} className={"fecha-dia" + (f === valor ? " sel" : "") + (f === hoyIso ? " hoy" : "")}
            onClick={() => elegir(d)} aria-pressed={f === valor} aria-label={fechaCorta(f)}>{d}</button>;
        })}
      </div>
      {valor ? <button type="button" className="fecha-limpiar" onClick={() => { alCambiar(""); setAbierto(false); }}>Limpiar fecha</button> : null}
    </div> : null}
  </div>;
}
