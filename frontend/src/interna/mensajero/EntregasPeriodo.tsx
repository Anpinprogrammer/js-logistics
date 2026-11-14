/* Mi caja → Entregas del período: lista paginada en el servidor (5 en celular, 10 en computador) con búsqueda por guía o por quien recibió
   y filtro por método. Las cifras de arriba son del período completo y no dependen de esta lista; el total de abajo es de lo filtrado. */
import { useEffect, useState } from "react";
import { ChevronDown, SlidersHorizontal, X } from "lucide-react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { entregasPeriodoDe } from "../acciones";
import { motivoError } from "../datos";
import { METODOS, gastoDe, metodoTxt, pesos, servicio } from "../motor";
import { useComputador, usePorPaginaEntregas } from "../../lib/pantalla";
import type { EntregaPeriodo, FiltroMetodoEntregas } from "../../api/tipos";

const OPCIONES: [FiltroMetodoEntregas, string][] = [
  ["todos", "Todos los métodos"], ["efectivo", METODOS.efectivo.t], ["transf_js", METODOS.transf_js.t], ["transf_cliente", METODOS.transf_cliente.t], ["devuelto", "Devoluciones"]
];
const CORTAS: Record<FiltroMetodoEntregas, string> = { todos: "Todos", efectivo: "Efectivo", transf_js: "A JS", transf_cliente: "Al cliente", devuelto: "Devueltas" };

export function EntregasPeriodo({ mid }: { mid: string }) {
  const escritorio = useComputador(), porPagina = usePorPaginaEntregas();
  const [pagina, setPagina] = useState(1), [texto, setTexto] = useState(""), [buscar, setBuscar] = useState(""), [metodo, setMetodo] = useState<FiltroMetodoEntregas>("todos");
  const [abierto, setAbierto] = useState(false), [borrador, setBorrador] = useState<FiltroMetodoEntregas>("todos");
  // Esperar 300 ms después de la última tecla para no pedirle al servidor una página por cada letra.
  useEffect(() => { const t = setTimeout(() => { setBuscar(texto.trim()); setPagina(1); }, 300); return () => clearTimeout(t); }, [texto]);
  useEffect(() => { setPagina(1); }, [porPagina]);
  const q = useQuery({
    queryKey: ["entregas-periodo", mid, pagina, porPagina, buscar, metodo],
    queryFn: () => entregasPeriodoDe(mid, pagina, porPagina, { buscar, metodo }), placeholderData: keepPreviousData
  });
  const d = q.data, filas = d?.entregas ?? [], hay = buscar !== "" || metodo !== "todos", cargando = q.isFetching;
  const limpiar = () => { setTexto(""); setBuscar(""); setMetodo("todos"); setBorrador("todos"); setPagina(1); };
  const desde = d && d.total ? (d.pagina - 1) * d.porPagina + 1 : 0, hasta = d ? Math.min(d.total, d.pagina * d.porPagina) : 0;
  const conGasto = (d?.totales.flete || 0) > 0 || filas.some(p => gastoDe(p));

  const buscador = <div className="tp-movil-buscar" role="search"><input type="search" value={texto} onChange={e => setTexto(e.target.value)} placeholder={escritorio ? "Buscar por guía o destinatario..." : "Guía o destinatario..."} aria-label="Buscar entregas por guía o destinatario" />
    {texto && <button type="button" aria-label="Borrar búsqueda" onClick={() => setTexto("")}><X size={14} aria-hidden="true" /></button>}</div>;
  const fila = (p: EntregaPeriodo) => <li key={p.guia}>
    <div><span className="guia">{p.guia}</span><b>{p.destinatario || "Sin destinatario"}</b><strong className={Number(p.valorCobrado) > 0 ? "" : "nulo"}>{pesos(p.valorCobrado)}</strong></div>
    <div><em className="te-metodo">{metodoTxt(p)}</em><span>Servicio: <b>{pesos(servicio(p))}</b>{gastoDe(p) ? " · Flete: " + pesos(gastoDe(p)) : ""}</span></div>
  </li>;

  return <section className="ep" aria-labelledby="ep-titulo">
    <div className="ep-cab"><h2 id="ep-titulo">Entregas del período</h2>{d && <span className="ep-cuenta" aria-live="polite">{d.total} {d.total === 1 ? "registro" : "registros"}</span>}</div>
    {escritorio ? <div className="hm-filtros ep-filtros">{buscador}
      <div className="seg seg-estado" role="group" aria-label="Método de pago">{OPCIONES.map(([k]) => <button key={k} type="button" aria-pressed={metodo === k} onClick={() => { setMetodo(k); setPagina(1); }}>{CORTAS[k]}</button>)}</div>
      {hay && <button type="button" className="btn sec chico" onClick={limpiar}>Limpiar</button>}</div>
      : <div className="hm-barra">{buscador}
        <button type="button" className="tp-movil-abrir" onClick={() => { setBorrador(metodo); setAbierto(true); }} aria-haspopup="dialog" aria-label={`Filtros${metodo !== "todos" ? ", 1 activo" : ""}`}>
          <SlidersHorizontal aria-hidden="true" /> Filtros{metodo !== "todos" && <b>1</b>}</button></div>}
    {q.isError && <div className="aviso alerta">No se pudieron traer las entregas: {motivoError(q.error)}</div>}
    <div className={"ep-cuerpo" + (cargando && d ? " cargando" : "")} aria-busy={cargando}>
      {!d ? (q.isError ? null : <Esqueleto filas={porPagina} escritorio={escritorio} />) : !filas.length ? (
        <div className="vacio">{hay ? <>Ninguna entrega coincide con la búsqueda. <button type="button" className="btn sec chico" onClick={limpiar}>Limpiar filtros</button></> : "No hay entregas en este período."}</div>
      ) : escritorio ? <div className="tabla-env te-tabla ep-tabla"><table><thead><tr><th>Guía</th><th>Recibió</th><th>Método</th><th className="n">Servicio</th>{conGasto && <th className="n">Flete</th>}<th className="n">Cobrado</th></tr></thead><tbody>
        {filas.map(p => <tr key={p.guia}><td className="guia">{p.guia}</td><td>{p.destinatario}</td><td>{metodoTxt(p)}</td><td className="n">{pesos(servicio(p))}</td>{conGasto && <td className="n">{gastoDe(p) ? pesos(gastoDe(p)) : "—"}</td>}<td className="n">{pesos(p.valorCobrado)}</td></tr>)}
        {d && <tr className="ep-total"><td colSpan={3}><b>{hay ? "Total de lo filtrado" : "Total"} ({d.total})</b></td><td className="n"><b>{pesos(d.totales.servicio)}</b></td>{conGasto && <td className="n"><b>{pesos(d.totales.flete)}</b></td>}<td className="n"><b>{pesos(d.totales.cobrado)}</b></td></tr>}
      </tbody></table></div>
        : <ul className="te-lista ep-lista">{filas.map(fila)}
          {d && <li className="te-total"><div><b>{hay ? "Total de lo filtrado" : "Total"} ({d.total})</b><strong>{pesos(d.totales.cobrado)}</strong></div><div><span>Servicio: <b>{pesos(d.totales.servicio)}</b>{conGasto ? " · Flete: " + pesos(d.totales.flete) : ""}</span></div></li>}</ul>}
    </div>
    {d && d.total > 0 && <nav className="ep-pie" aria-label="Páginas de las entregas">
      <p className="sub ep-rango" aria-live="polite">Mostrando <b>{desde}</b> a <b>{hasta}</b> de <b>{d.total}</b> {d.total === 1 ? "entrega" : "entregas"}</p>
      <div className="ep-nav"><button type="button" className="btn sec" disabled={d.pagina <= 1 || cargando} onClick={() => setPagina(d.pagina - 1)}>Anterior</button>
        <span className="sub">Página <b>{d.pagina}</b> de {d.paginas}</span>
        <button type="button" className="btn sec" disabled={d.pagina >= d.paginas || cargando} onClick={() => setPagina(d.pagina + 1)}>Siguiente</button></div>
    </nav>}
    {abierto && !escritorio && <div className="tp-capa ep-capa" onMouseDown={e => { if (e.target === e.currentTarget) setAbierto(false); }}><div className="tp-hoja" role="dialog" aria-modal="true" aria-labelledby="ep-filtros-titulo">
      <header><h2 id="ep-filtros-titulo"><SlidersHorizontal size={16} aria-hidden="true" /> Filtrar entregas</h2><button type="button" className="cerrar" aria-label="Cerrar filtros" onClick={() => setAbierto(false)}>×</button></header>
      <div className="tp-hoja-cuerpo"><div className="campo"><label htmlFor="ep-metodo">Método de pago</label><div className="tp-hoja-select"><select id="ep-metodo" value={borrador} onChange={e => setBorrador(e.target.value as FiltroMetodoEntregas)}>
        {OPCIONES.map(([k, t]) => <option key={k} value={k}>{t}</option>)}</select><ChevronDown aria-hidden="true" /></div></div></div>
      <footer><button type="button" className="btn sec" onClick={() => { setBorrador("todos"); limpiar(); setAbierto(false); }}>Limpiar</button><button type="button" className="btn" onClick={() => { setMetodo(borrador); setPagina(1); setAbierto(false); }}>Aplicar</button></footer></div></div>}
  </section>;
}

/** Cargando la primera página: filas grises del mismo tamaño que las reales, para que nada salte. */
function Esqueleto({ filas, escritorio }: { filas: number; escritorio: boolean }) {
  const n = Array.from({ length: filas }, (_, i) => i);
  return <div className="ep-esq" role="status" aria-label="Cargando entregas">{n.map(i => <div key={i} className={escritorio ? "ep-esq-fila" : "ep-esq-tarjeta"}><i /><i /><i /></div>)}</div>;
}
