/* App del patinador: anota el dinero que le pagan los clientes en su ruta y ve su caja. Es la única pantalla de este rol:
   no baja la oficina ni el mensajero, y no usa los datos en memoria (`S`). Todo lo suma el servidor. */
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useSesion, useUsuario } from "../../auth/Sesion";
import * as api from "../../api/servicios";
import type { CajaPatinador, RegistroCajaPatinador } from "../../api/tipos";
import { DEMO, datosDemo } from "../demo";
import { motivoError } from "../datos";
import { Icono, IconoSalir, Kpi, Paginador, ProveedorVentana } from "../ui";
import { FormPago, Lista, type Anotar } from "../pagos";
import { fechaLarga, hoy, horaActual, pesos } from "../motor";
import { registrosDemo, resumenDe } from "./demoCaja";
import { useTema } from "../tema";
import { usePorPagina } from "../../lib/pantalla";
import { CLAVE_NAV_ADMIN, leerNavegacion, usePersistedTab } from "../../hooks/usePersistedTab";
import "../estilos.css";
import "../ajustes.css";

type Pestana = "inicio" | "historial";
const PESTANAS: [Pestana, string][] = [["inicio", "Mi caja"], ["historial", "Historial"]];

/* ---- modo demo: la caja vive en memoria, como el resto de la demo (demoCaja.ts) ---- */
const cajaDemo = (pagina: number, porPagina: number): CajaPatinador => {
  const todos = [...registrosDemo].reverse(), paginas = Math.max(1, Math.ceil(todos.length / porPagina)), p = Math.min(pagina, paginas);
  return { resumen: resumenDe(registrosDemo), registros: todos.slice((p - 1) * porPagina, p * porPagina), pagina: p, porPagina, total: todos.length, paginas };
};
const traerCaja = (pagina: number, porPagina: number) => (DEMO ? Promise.resolve(cajaDemo(pagina, porPagina)) : api.patinador.caja(pagina, porPagina));
const anotar = async (d: { clienteId: string; clienteNombre: string; concepto: string; valor: number }) => {
  if (!DEMO) return api.patinador.registrar({ clienteId: d.clienteId, concepto: d.concepto, valor: d.valor });
  const registro: RegistroCajaPatinador = { id: "demo-" + Date.now(), mensajeroId: "m-pat", clienteId: d.clienteId, clienteNombre: d.clienteNombre, concepto: d.concepto, valor: d.valor, fecha: new Date().toISOString() };
  registrosDemo.push(registro);
  return { registro, resumen: resumenDe(registrosDemo) };
};

const IconoSol = () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" /></svg>;
const IconoLuna = () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M21 12.8A8.5 8.5 0 1 1 11.2 3a6.5 6.5 0 0 0 9.8 9.8z" /></svg>;

export default function AppPatinador() {
  const { tema, oscuro, cambiar } = useTema();
  return (
    <div className="jsl" data-theme={tema === "sistema" ? undefined : tema}>
      <ProveedorVentana><Marco oscuro={oscuro} cambiarTema={cambiar} /></ProveedorVentana>
    </div>
  );
}

function Marco({ oscuro, cambiarTema }: { oscuro: boolean; cambiarTema: () => void }) {
  const usuario = useUsuario(), { salir } = useSesion();
  // Al recargar (F5) vuelve a la pestaña en la que estaba.
  const [tab, setTab] = useState<Pestana>(() => {
    const nav = leerNavegacion(CLAVE_NAV_ADMIN, usuario.id);
    return PESTANAS.some(([k]) => k === nav?.tab) ? (nav!.tab as Pestana) : "inicio";
  });
  usePersistedTab(CLAVE_NAV_ADMIN, usuario.id, { tab });
  useState(() => { if (DEMO) datosDemo(usuario); }); // en la demo, deja listos los clientes para buscar
  useEffect(() => { document.title = "JS Logistics"; }, []);
  const nom = usuario.nombre || usuario.email, h = horaActual();
  const iniciales = nom.replace(/@.*/, "").split(/\s+/).filter(Boolean).slice(0, 2).map(x => x[0]).join("").toUpperCase();
  const ir = (k: Pestana) => { setTab(k); scrollTo(0, 0); };
  const boton = ([k, t]: [Pestana, string]) => (
    <button key={k} aria-current={tab === k ? "page" : undefined} aria-label={t} title={t} onClick={() => ir(k)}><Icono n={k === "inicio" ? "caja" : "historial"} /><span className="t">{t}</span></button>
  );
  return <>
    <aside className="lateral" id="lateral">
      <div className="marca-lat"><img src="/logo_JS_sin_texto.webp" alt="" /><div className="marca-lat-txt"><b className="marca-lat-nombre">JS Logistics</b><small className="marca-lat-eslogan">Servir es nuestra labor</small></div></div>
      <nav id="navLateral" aria-label="Menú principal"><div className="lat-grupo"><span className="lat-titulo">Patinador</span>{PESTANAS.map(boton)}</div></nav>
    </aside>
    <header className="barra">
      <div className="barra-escritorio">
        <div className="marca"><img src="/logo_JS_sin_texto.webp" alt="" /><span>JS Logistics<small>Servir es nuestra labor</small></span></div>
        <div className="saludo"><b>{h < 12 ? "Buenos días" : h < 19 ? "Buenas tardes" : "Buenas noches"}{nom ? ", " + (nom.includes("@") ? nom.split("@")[0] : nom.split(" ")[0]) : ""}</b><span>{fechaLarga(hoy())}</span></div>
        <span className="avatar" aria-hidden="true">{iniciales}</span>
        <button type="button" className="tema" onClick={cambiarTema} aria-label={oscuro ? "Cambiar a modo claro" : "Cambiar a modo oscuro"} title={oscuro ? "Cambiar a modo claro" : "Cambiar a modo oscuro"}>{oscuro ? <IconoSol /> : <IconoLuna />}</button>
        <button className="salir" aria-label="Cerrar sesión" onClick={() => void salir()}><IconoSalir /><span>Salir</span></button>
      </div>
      <div className="barra-movil">
        <div className="marca marca-movil"><img src="/logo_JS_sin_texto.webp" alt="JS Logistics" /></div>
        <div className="barra-movil-acciones">
          <button type="button" className="campana" aria-label={oscuro ? "Cambiar a modo claro" : "Cambiar a modo oscuro"} onClick={cambiarTema}>{oscuro ? <IconoSol /> : <IconoLuna />}</button>
          <button type="button" className="campana" aria-label="Cerrar sesión" onClick={() => void salir()}><IconoSalir /></button>
        </div>
      </div>
    </header>
    <main id="vista">{tab === "inicio" ? <MiCaja irHistorial={() => ir("historial")} /> : <Historial />}</main>
    <nav className="pestanas" id="pestanas" aria-label="Secciones">{PESTANAS.map(boton)}</nav>
  </>;
}

function MiCaja({ irHistorial }: { irHistorial: () => void }) {
  const porPagina = usePorPagina();
  const q = useQuery({ queryKey: ["patinador", "caja", 1, porPagina], queryFn: () => traerCaja(1, porPagina), refetchInterval: 60_000 });
  const r = q.data?.resumen;
  return <>
    <h1>Mi caja</h1>
    <p className="sub">Anota cada pago que te hace un cliente en tu ruta. Todo se suma a tu caja.</p>
    {q.isError && <div className="aviso alerta">No se pudo traer tu caja: {motivoError(q.error)}</div>}
    <div className="kpis kpis-patinador">
      <Kpi ico="plata" lbl="Total en mi caja" val={r ? pesos(r.total) : "…"} pie={<small>{r ? `${r.registros} ${r.registros === 1 ? "pago" : "pagos"}` : ""}</small>} />
      <Kpi ico="caja" lbl="Hoy" val={r ? pesos(r.totalHoy) : "…"} pie={<small>{r ? `${r.registrosHoy} ${r.registrosHoy === 1 ? "pago" : "pagos"}` : ""}</small>} />
    </div>
    <FormPago anotar={anotarYContar} invalidar={["patinador"]} />
    <div className="cab-lista"><h2>Últimos pagos</h2>{q.data && q.data.total > 3 ? <button type="button" className="btn sec" onClick={irHistorial}>Ver todo</button> : null}</div>
    <Lista registros={q.data?.registros.slice(0, 3)} cargando={q.isLoading} />
  </>;
}

const anotarYContar: Anotar = d => anotar(d).then(({ registro, resumen }) => `Anotado: ${pesos(registro.valor)} de ${registro.clienteNombre}, a favor en su cuenta. Ya tienes ${pesos(resumen.total)} en tu caja.`);

function Historial() {
  const porPagina = usePorPagina(), [pagina, setPagina] = useState(1);
  const q = useQuery({ queryKey: ["patinador", "caja", pagina, porPagina], queryFn: () => traerCaja(pagina, porPagina), placeholderData: prev => prev });
  const d = q.data;
  return <>
    <h1>Historial</h1>
    <p className="sub">{d ? `${d.resumen.registros} ${d.resumen.registros === 1 ? "pago" : "pagos"} en tu caja · ${pesos(d.resumen.total)}` : "Todos los pagos que has anotado."}</p>
    {q.isError && <div className="aviso alerta">No se pudo traer el historial: {motivoError(q.error)}</div>}
    <Lista registros={d?.registros} cargando={q.isLoading} />
    {d && <Paginador pagina={d.pagina} paginas={d.paginas} total={d.total} porPagina={d.porPagina} cargando={q.isFetching} ir={p => { setPagina(p); scrollTo(0, 0); }} />}
  </>;
}
