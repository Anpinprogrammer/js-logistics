/* Selector de una fecha con calendario flotante, estilo cápsula (Airbnb) y colores de la app. */
import { useEffect, useRef, useState } from "react";
import { hoy, moverDia } from "./motor";

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
export function SelectorFecha({ valor, alCambiar, etiqueta = "Fecha", vacio = "Todas las fechas", minimo, maximo, obligatorio = false, alinear = "derecha", id }: {
  valor: string;
  alCambiar: (v: string) => void;
  etiqueta?: string;
  vacio?: string;
  minimo?: string;
  maximo?: string;
  obligatorio?: boolean;
  alinear?: "izquierda" | "derecha";
  id?: string;
}) {
  const [abierto, setAbierto] = useState(false);
  const caja = useRef<HTMLDivElement>(null);
  const pop = useRef<HTMLDivElement>(null);
  const inicial = deIso(valor) || deIso(hoy()) || { a: 2026, m: 0, d: 1 };
  const [vista, setVista] = useState({ a: inicial.a, m: inicial.m });

  useEffect(() => {
    const fuera = (e: MouseEvent) => { if (caja.current && !caja.current.contains(e.target as Node)) setAbierto(false); };
    const tecla = (e: KeyboardEvent) => { if (e.key === "Escape") setAbierto(false); };
    document.addEventListener("mousedown", fuera);
    document.addEventListener("keydown", tecla);
    return () => { document.removeEventListener("mousedown", fuera); document.removeEventListener("keydown", tecla); };
  }, []);

  // Dentro de una hoja con scroll el calendario queda debajo: se lleva a la vista.
  useEffect(() => { if (abierto) pop.current?.scrollIntoView({ block: "nearest" }); }, [abierto]);

  const abrir = () => {
    const x = deIso(valor) || deIso(hoy()) || inicial;
    setVista({ a: x.a, m: x.m });
    setAbierto(v => !v);
  };
  const mover = (paso: number) => setVista(v => {
    const m = v.m + paso;
    return { a: v.a + Math.floor(m / 12), m: ((m % 12) + 12) % 12 };
  });
  const elegir = (d: number) => { const f = iso(vista.a, vista.m, d); if ((minimo && f < minimo) || (maximo && f > maximo)) return; alCambiar(f); setAbierto(false); };
  const primeros = new Date(vista.a, vista.m, 1).getDay();
  const dias = new Date(vista.a, vista.m + 1, 0).getDate();
  const hoyIso = hoy();

  return <div className={"fecha-picker" + (alinear === "izquierda" ? " fecha-izquierda" : "")} ref={caja}>
    <button type="button" className="fecha-btn" id={id} onClick={abrir} aria-expanded={abierto} aria-label={`${etiqueta}: ${valor ? fechaCorta(valor) : vacio}`}>
      <span className="fecha-etq">{etiqueta}</span>
      <span className="fecha-valor">{valor ? fechaCorta(valor) : vacio}<IconoCal /></span>
    </button>
    {abierto ? <div className="fecha-pop" ref={pop} role="dialog" aria-label="Elegir una fecha">
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
            onClick={() => elegir(d)} disabled={!!((minimo && f < minimo) || (maximo && f > maximo))} aria-pressed={f === valor} aria-label={fechaCorta(f)}>{d}</button>;
        })}
      </div>
      {valor && !obligatorio ? <button type="button" className="fecha-limpiar" onClick={() => { alCambiar(""); setAbierto(false); }}>Limpiar fecha</button> : null}
    </div> : null}
  </div>;
}

const IconoX = () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>;

/** "11 oct 2026 – 09 nov 2026", o una sola fecha si el rango es de un día. */
export function textoRango(desde: string, hasta: string) {
  if (!desde && !hasta) return "";
  if (!hasta || hasta === desde) return fechaCorta(desde || hasta);
  return `${fechaCorta(desde)} – ${fechaCorta(hasta)}`;
}

/**
 * Selector de rango de fechas: un solo botón y un solo calendario. `desde` y `hasta` van en YYYY-MM-DD y "" = sin límite.
 * Con el primer clic se marca el inicio y con el segundo el final; un clic anterior al inicio lo vuelve el nuevo inicio,
 * así `desde <= hasta` siempre. En el celular el calendario sube como hoja desde abajo.
 */
export function RangoFechas({ desde, hasta, alCambiar, etiqueta = "Fechas", vacio = "Todas las fechas", maximo = hoy(), id }: {
  desde: string;
  hasta: string;
  alCambiar: (r: { desde: string; hasta: string }) => void;
  etiqueta?: string;
  vacio?: string;
  maximo?: string;
  id?: string;
}) {
  const [abierto, setAbierto] = useState(false);
  const [ini, setIni] = useState(desde);
  const [fin, setFin] = useState(hasta);
  const caja = useRef<HTMLDivElement>(null);
  const pop = useRef<HTMLDivElement>(null);
  const base = deIso(desde) || deIso(hoy()) || { a: 2026, m: 0, d: 1 };
  const [vista, setVista] = useState({ a: base.a, m: base.m });

  useEffect(() => { setIni(desde); setFin(hasta); }, [desde, hasta]);
  useEffect(() => {
    if (!abierto) return;
    const fuera = (e: MouseEvent) => { if (caja.current && !caja.current.contains(e.target as Node)) setAbierto(false); };
    const tecla = (e: KeyboardEvent) => { if (e.key === "Escape") setAbierto(false); };
    document.addEventListener("mousedown", fuera);
    document.addEventListener("keydown", tecla);
    return () => { document.removeEventListener("mousedown", fuera); document.removeEventListener("keydown", tecla); };
  }, [abierto]);

  const abrir = () => {
    if (!abierto) { const x = deIso(desde) || deIso(hoy()) || base; setVista({ a: x.a, m: x.m }); setIni(desde); setFin(hasta); }
    setAbierto(v => !v);
  };
  const mover = (paso: number) => setVista(v => { const m = v.m + paso; return { a: v.a + Math.floor(m / 12), m: ((m % 12) + 12) % 12 }; });
  const aplicar = (d: string, h: string) => { alCambiar({ desde: d, hasta: h }); setAbierto(false); };
  const tocar = (f: string) => {
    if (f > maximo) return;
    if (!ini || fin || f < ini) { setIni(f); setFin(""); } else setFin(f);
  };

  const h = hoy();
  const mesActual = h.slice(0, 8) + "01";
  const finMesPasado = moverDia(mesActual, -1);
  const atajos: [string, () => void][] = [
    ["Hoy", () => aplicar(h, h)],
    ["Últimos 7 días", () => aplicar(moverDia(h, -6), h)],
    ["Este mes", () => aplicar(mesActual, h)],
    ["Mes pasado", () => aplicar(finMesPasado.slice(0, 8) + "01", finMesPasado)],
    ["Ver todo", () => aplicar("", "")],
  ];

  const primeros = new Date(vista.a, vista.m, 1).getDay();
  const dias = new Date(vista.a, vista.m + 1, 0).getDate();
  const hayRango = !!(desde || hasta);
  const texto = hayRango ? textoRango(desde, hasta) : vacio;

  return <div className={"fecha-picker rango-picker" + (hayRango ? " con-rango" : "")} ref={caja}>
    <button type="button" className="fecha-btn" id={id} onClick={abrir} aria-expanded={abierto} aria-haspopup="dialog" aria-label={`${etiqueta}: ${texto}`}>
      <span className="fecha-etq">{etiqueta}</span>
      <span className="fecha-valor"><span className="rango-texto">{texto}</span><IconoCal /></span>
    </button>
    {hayRango ? <button type="button" className="rango-limpiar" aria-label="Quitar el rango de fechas" onClick={() => aplicar("", "")}><IconoX /></button> : null}
    {abierto ? <>
      <div className="rango-fondo" aria-hidden="true" onClick={() => setAbierto(false)} />
      <div className="fecha-pop rango-pop" ref={pop} role="dialog" aria-label="Elegir un rango de fechas">
        <div className="rango-atajos">{atajos.map(([t, f]) => <button type="button" key={t} onClick={f}>{t}</button>)}</div>
        <div className="fecha-cab">
          <button type="button" className="fecha-nav" onClick={() => mover(-1)} aria-label="Mes anterior"><Chevron izq /></button>
          <span className="fecha-mes">{MESES[vista.m]} {vista.a}</span>
          <button type="button" className="fecha-nav" onClick={() => mover(1)} aria-label="Mes siguiente"><Chevron /></button>
        </div>
        <div className="fecha-semana" aria-hidden="true">{DIAS.map((d, i) => <span key={i}>{d}</span>)}</div>
        <div className="fecha-grid rango-grid">
          {Array.from({ length: primeros }, (_, i) => <span key={"v" + i} aria-hidden="true" />)}
          {Array.from({ length: dias }, (_, i) => {
            const d = i + 1, f = iso(vista.a, vista.m, d);
            const esIni = f === ini, esFin = f === fin, dentro = !!(ini && fin && f > ini && f < fin);
            return <button type="button" key={f}
              className={"fecha-dia" + (esIni || esFin ? " sel" : "") + (dentro ? " en-rango" : "") + (esIni && fin && fin !== ini ? " ini" : "") + (esFin && ini !== fin ? " fin" : "") + (f === h ? " hoy" : "")}
              onClick={() => tocar(f)} disabled={f > maximo} aria-pressed={esIni || esFin} aria-label={fechaCorta(f)}>{d}</button>;
          })}
        </div>
        <div className="rango-pie">
          <span>{ini && !fin ? "Elige el día final" : ini ? textoRango(ini, fin) : "Elige el día inicial"}</span>
          <button type="button" className="btn chico" disabled={!ini} onClick={() => aplicar(ini, fin || ini)}>Aplicar</button>
        </div>
      </div>
    </> : null}
  </div>;
}
