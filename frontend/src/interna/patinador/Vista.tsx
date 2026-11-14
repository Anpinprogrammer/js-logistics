/* Las pantallas del patinador (Inicio, Mi caja con su historial y Solicitudes). Las usan su app (Patinador.tsx) y el modo Patinador de administración
   (DesdeOficina.tsx), que pasa `ajeno` con el patinador elegido: las cifras y lo anotado van a la caja de ese patinador. */
import { createContext, useContext, useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowDownLeft, ArrowRight, CheckCircle2, ClipboardList, PackageCheck, PlusCircle, Receipt, Wallet } from "lucide-react";
import * as api from "../../api/servicios";
import type { CajaPatinador, FiltrosCajaPatinador, PaginaSolicitudesRecogida, RegistroCajaPatinador, SolicitudRecogida } from "../../api/tipos";
import { DEMO } from "../demo";
import { motivoError } from "../datos";
import { FiltroDia, IconoFiltro, Kpi, Paginador, useVentana } from "../ui";
import { FormPago, Lista, type Anotar } from "../pagos";
import { diaDe, hora, pesos, S } from "../motor";
import { registrosDemo, resumenDe, solicitudesRecogidaDemo } from "./demoCaja";
import { POR_PAGINA, POR_PAGINA_RECOGIDAS, useComputador, usePorPagina, usePorPaginaRecogidas } from "../../lib/pantalla";

const DEMO_PROPIO = "m-pat"; // la ficha de patinador@demo.co

/* ---- modo demo: la caja vive en memoria, como el resto de la demo (demoCaja.ts) ---- */
const cajaDemo = (pagina: number, porPagina: number, mensajeroId = DEMO_PROPIO, filtros: FiltrosCajaPatinador = {}): CajaPatinador => {
  const suyos = registrosDemo.filter(r => r.mensajeroId === mensajeroId);
  // Las entregas a administración (S.recaudos) también salen en su historial, como en el servidor.
  const entregas: RegistroCajaPatinador[] = Object.values(S.recaudos).filter(r => r.mensajeroId === mensajeroId).map(r => ({
    id: r.id, mensajeroId, clienteId: "", clienteNombre: r.porNombre ? "Entregado a " + r.porNombre : "Entregado a la oficina", concepto: r.nota, valor: Number(r.valor) || 0,
    fecha: new Date(r.fecha).toISOString(), medio: r.medio, tipo: "entrega"
  }));
  const q = (filtros.buscar || "").toLowerCase();
  const todos = [...suyos, ...entregas].sort((a, b) => Date.parse(b.fecha) - Date.parse(a.fecha)).filter(r =>
    (filtros.tipo !== "ingresos" || r.tipo !== "entrega") && (filtros.tipo !== "salidas" || r.tipo === "entrega")
    && (!filtros.dia || diaDe(Date.parse(r.fecha)) === filtros.dia) && (!q || (r.clienteNombre + " " + r.concepto).toLowerCase().includes(q))), paginas = Math.max(1, Math.ceil(todos.length / porPagina)), p = Math.min(pagina, paginas);
  return { resumen: resumenDe(suyos, mensajeroId), registros: todos.slice((p - 1) * porPagina, p * porPagina), pagina: p, porPagina, total: todos.length, paginas };
};
const traerCaja = (pagina: number, porPagina: number, mensajeroId?: string, filtros?: FiltrosCajaPatinador) =>
  (DEMO ? Promise.resolve(cajaDemo(pagina, porPagina, mensajeroId, filtros)) : api.patinador.caja(pagina, porPagina, mensajeroId, filtros));
const traerSolicitudes = (page: number, limit: number, mensajeroId?: string): Promise<PaginaSolicitudesRecogida> =>
  (DEMO ? Promise.resolve(solicitudesRecogidaDemo(page, limit)) : api.patinador.solicitudes(page, limit, mensajeroId));
const anotar = async (d: { mensajeroId?: string; clienteId: string; clienteNombre: string; concepto: string; valor: number }) => {
  if (!DEMO) return api.patinador.registrar({ mensajeroId: d.mensajeroId, clienteId: d.clienteId, concepto: d.concepto, valor: d.valor });
  const mensajeroId = d.mensajeroId || DEMO_PROPIO;
  const registro: RegistroCajaPatinador = { id: "demo-" + Date.now(), mensajeroId, clienteId: d.clienteId, clienteNombre: d.clienteNombre, concepto: d.concepto, valor: d.valor, fecha: new Date().toISOString() };
  registrosDemo.push(registro);
  return { registro, resumen: resumenDe(registrosDemo.filter(r => r.mensajeroId === mensajeroId), mensajeroId) };
};

/** Caja de qué patinador: la propia (sin `ajeno`) o la que eligió administración en su modo Patinador. */
export interface Ajeno { id: string; nombre: string; cambiar: React.ReactNode }
const claveCaja = (ajeno?: Ajeno) => ["patinador", "caja", ajeno?.id ?? "mia"];
const claveSolicitudes = (ajeno?: Ajeno) => ["patinador", "solicitudes", ajeno?.id ?? "mia"];

/** En la app del patinador todo se ve y se comporta como en el celular (barra de abajo, "Registrar pago" en una ventana, filtros en
    la hoja, 5 solicitudes por página), también en el computador. El modo Patinador de administración sigue el tamaño de la pantalla. */
export const SoloCelular = createContext(false);
const usePorPaginaPat = () => { const solo = useContext(SoloCelular), p = usePorPagina(); return solo ? POR_PAGINA.celular : p; };
const usePorPaginaRecogidasPat = () => { const solo = useContext(SoloCelular), p = usePorPaginaRecogidas(); return solo ? POR_PAGINA_RECOGIDAS.celular : p; };
const useComputadorPat = () => { const solo = useContext(SoloCelular), c = useComputador(); return !solo && c; };

export type TabPatinador = "inicio" | "caja" | "solicitudes";

/** Cuántas solicitudes de recogida tiene pendientes (el número de la pestaña Solicitudes y de la campana). Se comparte la consulta. */
export function useSolicitudesPendientes(ajenoId?: string) {
  const q = useQuery({ queryKey: ["patinador", "solicitudes", ajenoId ?? "mia", "conteo"], queryFn: () => traerSolicitudes(1, 1, ajenoId), refetchInterval: 60_000 });
  return q.data?.total ?? 0;
}

/** Las tres pestañas del patinador. La usan su app y el modo Patinador de administración. */
export function VistaPatinador({ tab, ir, ajeno }: { tab: TabPatinador; ir: (t: TabPatinador) => void; ajeno?: Ajeno }) {
  return tab === "inicio" ? <Inicio ir={ir} ajeno={ajeno} /> : tab === "caja" ? <MiCaja ajeno={ajeno} /> : <Solicitudes ajeno={ajeno} />;
}

/** Abre "Anotar un pago" en una ventana (desde Inicio y desde Mi caja en el celular). */
function useAbrirPago(ajeno?: Ajeno) {
  const v = useVentana();
  return () => v.abrir(<>
    <header><h2>Anotar un pago</h2><button className="cerrar" data-cerrar aria-label="Cerrar">×</button></header>
    <p className="sub">{ajeno ? "Registra el dinero que recibió el patinador de un cliente" : "Registra el dinero recibido de un cliente en ruta"}</p>
    <FormPago enModal anotar={x => anotarYContar(x, ajeno)} invalidar={["patinador"]} deOtro={!!ajeno} alGuardar={() => v.cerrar()} />
  </>, "centrada");
}

/* ---- Inicio: accesos rápidos, tres cifras del período y dos cuadros (solicitudes por recoger y últimos movimientos de la caja) ---- */
function Inicio({ ir, ajeno }: { ir: (t: TabPatinador) => void; ajeno?: Ajeno }) {
  const porPagina = usePorPaginaPat(), abrirPago = useAbrirPago(ajeno);
  const q = useQuery({ queryKey: [...claveCaja(ajeno), 1, porPagina], queryFn: () => traerCaja(1, porPagina, ajeno?.id), refetchInterval: 60_000 });
  // Las 3 solicitudes más recientes; el total de la respuesta es el número de recogidas pendientes (cifra y contador del botón).
  const qs = useQuery({ queryKey: [...claveSolicitudes(ajeno), "inicio"], queryFn: () => traerSolicitudes(1, 3, ajeno?.id), refetchInterval: 60_000 });
  const r = q.data?.resumen, pendientes = qs.data?.total, movs = q.data?.registros.slice(0, 3) ?? [];
  return <div className="pat-inicio">
    <div className="pat-cab">
      <div className="pat-cab-txt">
        <h1>{ajeno ? "Inicio del patinador" : "Inicio"}</h1>
        {ajeno && <span className="pat-nombre"><b>{ajeno.nombre}</b>{ajeno.cambiar}</span>}
        <p className="sub">Resumen de recogidas y dinero recaudado en {ajeno ? "su" : "tu"} período activo.</p>
      </div>
      <div className="pat-acciones">
        <button type="button" className="btn ok" onClick={abrirPago}><PlusCircle size={16} aria-hidden="true" /> Registrar pago</button>
        <button type="button" className="btn sec" onClick={() => ir("solicitudes")}><ClipboardList size={16} aria-hidden="true" /> Solicitudes{!!pendientes && <span className="pat-num">{pendientes}</span>}</button>
      </div>
    </div>
    {q.isError && <div className="aviso alerta">No se pudo traer {ajeno ? "la" : "tu"} caja: {motivoError(q.error)}</div>}
    <div className="pat-kpis">
      <button type="button" className="pat-kpi fuerte" onClick={() => ir("caja")}><span className="pat-kpi-cab"><span>{ajeno ? "Dinero en mano (su caja)" : "Dinero en mano (mi caja)"}</span><i><Wallet size={16} aria-hidden="true" /></i></span>
        <b>{r ? pesos(r.enCaja ?? r.total) : "…"}</b><small>{ajeno ? "Lo que tiene en la mano por entregar" : "Lo que tienes en la mano por entregar"}</small></button>
      <button type="button" className="pat-kpi" onClick={() => ir("solicitudes")}><span className="pat-kpi-cab"><span>Recogidas pendientes</span><i className="ambar"><PackageCheck size={16} aria-hidden="true" /></i></span>
        <b>{pendientes ?? "…"}</b><small>Por gestionar hoy</small></button>
      <button type="button" className="pat-kpi" onClick={() => ir("caja")}><span className="pat-kpi-cab"><span>Pagos recibidos</span><i className="verde"><ArrowDownLeft size={16} aria-hidden="true" /></i></span>
        <b>{r ? `${r.registros} ${r.registros === 1 ? "pago" : "pagos"}` : "…"}</b><small>Abonos de clientes{r ? ` · hoy ${r.registrosHoy}` : ""}</small></button>
    </div>
    <div className="pat-tarjetas">
      <section className="pat-tarjeta" aria-labelledby="pat-t-sol">
        <div className="pat-tarjeta-cab"><div><h2 id="pat-t-sol">Solicitudes de recogida</h2><small>Pendientes por recoger en clientes</small></div>
          <button type="button" className="btn sec chico" onClick={() => ir("solicitudes")}>Ver todas<ArrowRight size={14} aria-hidden="true" /></button></div>
        {qs.isLoading ? <div className="vacio" role="status">Cargando…</div> : qs.isError ? <div className="aviso alerta">No se pudieron traer las solicitudes: {motivoError(qs.error)}</div>
          : !qs.data?.data.length ? <div className="vacio pat-vacio"><CheckCircle2 size={26} aria-hidden="true" /><b>Todo al día</b><span>{ajeno ? "No tiene solicitudes de recogida pendientes." : "No tienes solicitudes de recogida pendientes. Cuando la oficina te asigne una, sale aquí."}</span></div>
          : <div className="lista lista-recogidas">{qs.data.data.map(s => <FilaSolicitud key={s.guia} s={s} />)}</div>}
      </section>
      <section className="pat-tarjeta" aria-labelledby="pat-t-caja">
        <div className="pat-tarjeta-cab"><div><h2 id="pat-t-caja">Últimos movimientos de caja</h2><small>Lo más reciente de {ajeno ? "su" : "tu"} caja</small></div>
          <button type="button" className="btn chico" onClick={() => ir("caja")}>Ir a Mi caja<ArrowRight size={14} aria-hidden="true" /></button></div>
        {q.isLoading ? <div className="vacio" role="status">Cargando…</div> : !movs.length
          ? <div className="vacio pat-vacio"><Receipt size={26} aria-hidden="true" /><span>{ajeno ? VACIO_AJENO : "Todavía no has anotado pagos. Cuando un cliente te pague, anótalo aquí."}</span><button type="button" className="btn sec chico" onClick={abrirPago}>+ Anotar primer pago</button></div>
          : <Lista registros={movs} cargando={false} />}
      </section>
    </div>
  </div>;
}

/* ---- Solicitudes de recogida, paginadas en el servidor: 5 por página en el celular y 10 en el computador ---- */
function ListaSolicitudes({ ajeno }: { ajeno?: Ajeno }) {
  const limite = usePorPaginaRecogidasPat(), [pagina, setPagina] = useState(1);
  const q = useQuery({ queryKey: [...claveSolicitudes(ajeno), pagina, limite], queryFn: () => traerSolicitudes(pagina, limite, ajeno?.id), placeholderData: prev => prev, refetchInterval: 60_000 });
  const d = q.data;
  if (q.isLoading) return <div className="vacio" role="status">Cargando…</div>;
  if (q.isError) return <div className="aviso alerta">No se pudieron traer las solicitudes: {motivoError(q.error)}</div>;
  if (!d?.data.length) return <div className="vacio">{ajeno ? "No tiene solicitudes de recogida pendientes." : "No tienes solicitudes de recogida pendientes. Cuando la oficina te asigne una, sale aquí."}</div>;
  return <>
    <div className="lista lista-recogidas">{d.data.map(s => <FilaSolicitud key={s.guia} s={s} />)}</div>
    {/* Paginador compacto: el servidor corta la página y aquí solo se pide otra. */}
    <Paginador pagina={d.page} paginas={d.totalPages} total={d.total} porPagina={limite} cargando={q.isFetching} ir={p => setPagina(p)} />
  </>;
}

function FilaSolicitud({ s }: { s: SolicitudRecogida }) {
  const mapa = "https://www.google.com/maps/search/?api=1&query=" + encodeURIComponent(s.direccionRecogida);
  return (
    <div className="fila fila-recogida">
      <span className="info">
        <b className="min-w-0">{s.remitente}</b>
        <p>{s.direccionRecogida}</p>
        <p>{s.paquetes} {s.paquetes === 1 ? "paquete" : "paquetes"} · para {s.destinatarioNombre} · {hora(Date.parse(s.fecha))}</p>
      </span>
      <a className="btn chico sec" href={mapa} target="_blank" rel="noopener noreferrer" aria-label={"Cómo llegar a " + s.direccionRecogida}>Cómo llegar</a>
    </div>
  );
}

function Solicitudes({ ajeno }: { ajeno?: Ajeno }) {
  return <>
    <h1>Solicitudes</h1>
    <p className="sub">{ajeno ? `Recogidas pendientes de ${ajeno.nombre}` : "Los paquetes que la oficina te asignó para recoger."}{ajeno?.cambiar}</p>
    <ListaSolicitudes ajeno={ajeno} />
  </>;
}

/* ---- Mi caja: las cifras, el formulario y el historial de movimientos (pagos y entregas a administración) ----
   Celular: el formulario se abre en una ventana desde "Registrar pago" y el historial tiene buscador y filtros (hoja inferior).
   Computador: el formulario fijo y el historial de siempre. */
const TIPOS_MOV: [FiltrosCajaPatinador["tipo"] & string, string][] = [["todos", "Todos los movimientos"], ["ingresos", "Ingresos (pagos recibidos)"], ["salidas", "Salidas (entregas a administración)"]];
type FiltrosHoja = { tipo: NonNullable<FiltrosCajaPatinador["tipo"]>; dia: string };

function MiCaja({ ajeno }: { ajeno?: Ajeno }) {
  const porPagina = usePorPaginaPat(), computador = useComputadorPat(), [pagina, setPagina] = useState(1);
  // Búsqueda: se pide al servidor cuando deja de escribir. Tipo y día se preparan en la hoja y se aplican juntos.
  const [buscar, setBuscar] = useState(""), [buscarYa, setBuscarYa] = useState(""), temporizador = useRef<number | undefined>(undefined);
  const [filtros, setFiltros] = useState<FiltrosHoja>({ tipo: "todos", dia: "" });
  const [hoja, setHoja] = useState(false), [borrador, setBorrador] = useState<FiltrosHoja>(filtros);
  const cambiarBusqueda = (x: string) => { setBuscar(x); window.clearTimeout(temporizador.current); temporizador.current = window.setTimeout(() => { setBuscarYa(x.trim()); setPagina(1); }, 300); };
  const limpiarBusqueda = () => { window.clearTimeout(temporizador.current); setBuscar(""); setBuscarYa(""); setPagina(1); };
  useEffect(() => () => window.clearTimeout(temporizador.current), []);
  const activos = Number(filtros.tipo !== "todos") + Number(!!filtros.dia);
  const abrirHoja = () => { setBorrador(filtros); setHoja(true); };
  const aplicar = () => { setFiltros(borrador); setPagina(1); setHoja(false); };
  useEffect(() => {
    if (!hoja) return;
    const anterior = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const tecla = (e: KeyboardEvent) => { if (e.key === "Escape") setHoja(false); };
    document.addEventListener("keydown", tecla);
    return () => { document.body.style.overflow = anterior; document.removeEventListener("keydown", tecla); };
  }, [hoja]);

  const f: FiltrosCajaPatinador = { buscar: buscarYa, tipo: filtros.tipo, dia: filtros.dia };
  const q = useQuery({ queryKey: [...claveCaja(ajeno), pagina, porPagina, buscarYa, filtros.tipo, filtros.dia], queryFn: () => traerCaja(pagina, porPagina, ajeno?.id, f), placeholderData: prev => prev, refetchInterval: 60_000 });
  const d = q.data, r = d?.resumen, filtrando = !!buscarYa || activos > 0;
  const abrirPago = useAbrirPago(ajeno);
  return <>
    <h1>{ajeno ? "Caja del patinador" : "Mi caja"}</h1>
    {ajeno
      ? <p className="sub">{ajeno.nombre}{ajeno.cambiar}. Lo que anotes aquí queda en su caja, igual que si lo anotara él.</p>
      : <p className="sub">Anota cada pago que te hace un cliente en tu ruta. Todo se suma a tu caja, y baja cuando le entregas el dinero a administración.</p>}
    {q.isError && <div className="aviso alerta">No se pudo traer {ajeno ? "la" : "tu"} caja: {motivoError(q.error)}</div>}
    <div className="kpis kpis-patinador">
      <Kpi ico="plata" lbl={ajeno ? "En su caja" : "En mi caja"} val={r ? pesos(r.enCaja ?? r.total) : "…"} pie={<small>{r ? (r.entregado ? `Recibido ${pesos(r.total)} · entregado ${pesos(r.entregado)}` : `${r.registros} ${r.registros === 1 ? "pago" : "pagos"}`) : ""}</small>} />
      <Kpi ico="caja" lbl="Recibido hoy" val={r ? pesos(r.totalHoy) : "…"} pie={<small>{r ? `${r.registrosHoy} ${r.registrosHoy === 1 ? "pago" : "pagos"}` : ""}</small>} />
    </div>
    {computador
      ? <FormPago anotar={x => anotarYContar(x, ajeno)} invalidar={["patinador"]} deOtro={!!ajeno} />
      : <button type="button" className="btn pat-registrar" onClick={abrirPago}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true"><circle cx="12" cy="12" r="9" /><path d="M12 8v8M8 12h8" /></svg>Registrar pago</button>}
    <div className="cab-lista"><h2>Historial de movimientos</h2></div>
    <div className="tp-movil" role="search">
      <div className="tp-movil-buscar"><input type="search" value={buscar} placeholder="Buscar cliente o concepto…" autoComplete="off" aria-label="Buscar por cliente o concepto" onChange={e => cambiarBusqueda(e.target.value)} />{buscar && <button type="button" aria-label="Limpiar búsqueda" onClick={limpiarBusqueda}>×</button>}</div>
      <button type="button" className="tp-movil-abrir" onClick={abrirHoja} aria-haspopup="dialog" aria-label={`Filtros${activos ? `, ${activos} activos` : ""}`}><IconoFiltro /><span>Filtros</span>{activos > 0 && <b>{activos}</b>}</button>
    </div>
    {hoja && <div className="tp-capa" onMouseDown={e => { if (e.target === e.currentTarget) setHoja(false); }}>
      <div className="tp-hoja" role="dialog" aria-modal="true" aria-labelledby="pat-filtros-titulo">
        <header><h2 id="pat-filtros-titulo"><IconoFiltro /> Filtrar movimientos</h2><button type="button" className="cerrar" aria-label="Cerrar filtros" onClick={() => setHoja(false)}>×</button></header>
        <div className="tp-hoja-cuerpo">
          <div className="campo"><label htmlFor="pat-tipo">Tipo de movimiento</label><div className="tp-hoja-select"><select id="pat-tipo" value={borrador.tipo} onChange={e => setBorrador(b => ({ ...b, tipo: e.target.value as FiltrosHoja["tipo"] }))}>{TIPOS_MOV.map(([k, t]) => <option key={k} value={k}>{t}</option>)}</select><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6" /></svg></div></div>
          <div className="campo"><label htmlFor="pat-dia">Fecha del movimiento</label><FiltroDia compacto id="pat-dia" d={borrador.dia} poner={dia => setBorrador(b => ({ ...b, dia }))} /></div>
        </div>
        <footer><button type="button" className="btn sec" onClick={() => setBorrador({ tipo: "todos", dia: "" })}>Limpiar filtros</button><button type="button" className="btn" onClick={aplicar}>Aplicar filtros</button></footer>
      </div>
    </div>}
    <Lista registros={d?.registros} cargando={q.isLoading} vacio={filtrando ? "No hay movimientos con esos filtros." : ajeno ? VACIO_AJENO : undefined} />
    {d && <Paginador pagina={d.pagina} paginas={d.paginas} total={d.total} porPagina={d.porPagina} cargando={q.isFetching} ir={p => { setPagina(p); }} />}
  </>;
}

const VACIO_AJENO = "Todavía no hay pagos en su caja. Cuando un cliente le pague, anótalo arriba.";
const anotarYContar = (d: Parameters<Anotar>[0], ajeno?: Ajeno) => anotar({ ...d, mensajeroId: ajeno?.id }).then(({ registro, resumen }) =>
  `Anotado: ${pesos(registro.valor)} de ${registro.clienteNombre}, a favor en su cuenta. ` +
  (ajeno ? `${ajeno.nombre} ya tiene ${pesos(resumen.enCaja ?? resumen.total)} en su caja.` : `Ya tienes ${pesos(resumen.enCaja ?? resumen.total)} en tu caja.`));
