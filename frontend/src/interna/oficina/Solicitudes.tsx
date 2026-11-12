/* Oficina → Solicitudes: las solicitudes de envío que llegan de la página web, con filtros por estado.
   La campanita de la barra sigue mostrando solo las que faltan por atender; aquí está el historial completo. */
import { useEffect, useRef, useState } from "react";
import { E } from "../estado";
import { FiltroDia, IconoFiltro, IconoInfo, Paginador, useVentana } from "../ui";
import { mensajeDe } from "../../api/cliente";
import type { EstadoFiltroSolicitudes, OrigenFiltroSolicitudes, Solicitud } from "../../api/tipos";
import { hora, pesos } from "../motor";
import { ETQ, TarjetaSolicitud, useSolicitudesFiltradas } from "../Solicitudes";

const FILTROS: [EstadoFiltroSolicitudes, string][] = [
  ["todas", "Todas"], ["pendientes", "Pendientes"], ["por_confirmar", "Por confirmar"],
  ["aceptadas", "Aceptadas"], ["rechazadas", "Rechazadas"],
];
const VACIO: Record<EstadoFiltroSolicitudes, string> = {
  todas: "Todavía no ha llegado ninguna solicitud.",
  pendientes: "No hay solicitudes nuevas por revisar.",
  por_confirmar: "No hay solicitudes esperando la respuesta del cliente.",
  aceptadas: "Aún no hay solicitudes aceptadas.",
  rechazadas: "No hay solicitudes rechazadas.",
};

export default function Solicitudes({ pintar }: { pintar: () => void }) {
  const ventana = useVentana();
  const arriba = useRef<HTMLDivElement>(null);
  const [busqueda, setBusqueda] = useState(E.buscarSol);
  const [filtrosAbiertos, setFiltrosAbiertos] = useState(false);
  const [borrador, setBorrador] = useState({ estado: E.filtroSol, origen: E.origenSol, dia: E.diaSol });
  const pintarActual = useRef(pintar);
  pintarActual.current = pintar;
  useEffect(() => {
    if (busqueda === E.buscarSol) return;
    const id = window.setTimeout(() => { E.buscarSol = busqueda; E.paginaSol = 1; pintarActual.current(); }, 400);
    return () => clearTimeout(id);
  }, [busqueda]);
  useEffect(() => {
    if (!filtrosAbiertos) return;
    const anterior = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const tecla = (e: KeyboardEvent) => { if (e.key === "Escape") setFiltrosAbiertos(false); };
    const pantalla = window.matchMedia("(min-width: 768px)");
    const cambio = () => { if (pantalla.matches) setFiltrosAbiertos(false); };
    document.addEventListener("keydown", tecla);
    pantalla.addEventListener("change", cambio);
    return () => { document.body.style.overflow = anterior; document.removeEventListener("keydown", tecla); pantalla.removeEventListener("change", cambio); };
  }, [filtrosAbiertos]);
  const f = E.filtroSol, limite = 15;
  const q = useSolicitudesFiltradas({ page: E.paginaSol, limit: limite, status: f, search: E.buscarSol, source: E.origenSol, date: E.diaSol });
  const pag = q.data;
  const poner = (cambios: Partial<Pick<typeof E, "filtroSol" | "origenSol" | "diaSol">>) => { Object.assign(E, cambios, { paginaSol: 1 }); pintar(); };
  const abrirFiltros = () => { setBorrador({ estado: E.filtroSol, origen: E.origenSol, dia: E.diaSol }); setFiltrosAbiertos(true); };
  const aplicarFiltros = () => { poner({ filtroSol: borrador.estado, origenSol: borrador.origen, diaSol: borrador.dia }); setFiltrosAbiertos(false); };
  const limpiarFiltros = () => {
    setBorrador({ estado: "todas", origen: "todos", dia: "" });
    setBusqueda("");
    Object.assign(E, { filtroSol: "todas", origenSol: "todos", diaSol: "", buscarSol: "", paginaSol: 1 });
    pintar();
    setFiltrosAbiertos(false);
  };
  const irA = (n: number) => { E.paginaSol = n; pintar(); arriba.current?.scrollIntoView({ block: "start", behavior: "smooth" }); };
  const detalle = (s: Solicitud) => ventana.abrir(<DetalleSolicitud s={s} cerrar={ventana.cerrar} />, "solicitud");
  const filtrosActivos = Number(f !== "todas") + Number(E.origenSol !== "todos") + Number(!!E.diaSol);
  const cargando = q.isPending || (q.isFetching && q.isPlaceholderData);
  return <>
    <header className="cab-pedidos cab-solicitudes">
      <div className="cab-pedidos-txt"><h1>Solicitudes</h1><p className="sub">Pedidos de recogida de la página web y del portal de clientes.</p></div>
    </header>
    <div className="sol-filtros-movil">
      <input type="search" value={busqueda} onChange={e => setBusqueda(e.target.value)} placeholder="Buscar solicitud…" aria-label="Buscar cliente, destinatario, dirección o guía" />
      <button type="button" onClick={abrirFiltros} aria-label={`Filtros${filtrosActivos ? `, ${filtrosActivos} activos` : ""}`}><IconoFiltro /> Filtros{filtrosActivos > 0 && <b>{filtrosActivos}</b>}</button>
    </div>
    <div className="sol-filtros-escritorio">
      <div className="sol-filtros-fila">
        <input type="search" value={busqueda} onChange={e => setBusqueda(e.target.value)} placeholder="Buscar cliente, destinatario, dirección o guía…" aria-label="Buscar cliente, destinatario, dirección o guía" />
        <select aria-label="Filtrar por origen" value={E.origenSol} onChange={e => poner({ origenSol: e.target.value as OrigenFiltroSolicitudes })}><option value="todos">Todos los orígenes</option><option value="portal">Portal de clientes</option><option value="web">Página web</option></select>
        <div className="sol-filtros-fecha"><FiltroDia compacto id="diaSol" d={E.diaSol} poner={d => poner({ diaSol: d })} /></div>
      </div>
    </div>
    <div className="seg-solicitudes-marco sol-filtros-escritorio">
      <div className="seg seg-estado seg-solicitudes" role="group" aria-label="Filtrar solicitudes">
        {FILTROS.map(([k, t]) => <button key={k} type="button" aria-pressed={f === k} onClick={e => {
          e.currentTarget.scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" });
          poner({ filtroSol: k });
        }}>{t}{pag ? <> <span className={k === "pendientes" && pag.counts[k] ? "num" : "num neu"}>{pag.counts[k]}</span></> : null}</button>)}
      </div>
      <span className="seg-solicitudes-degrade" aria-hidden="true" />
    </div>
    {filtrosAbiertos && <div className="tp-capa" onMouseDown={e => { if (e.target === e.currentTarget) setFiltrosAbiertos(false); }}><div className="tp-hoja" role="dialog" aria-modal="true" aria-labelledby="sol-filtros-titulo"><header><h2 id="sol-filtros-titulo"><IconoFiltro /> Filtrar solicitudes</h2><button type="button" className="cerrar" aria-label="Cerrar filtros" onClick={() => setFiltrosAbiertos(false)}>×</button></header><div className="tp-hoja-cuerpo">
      <div className="campo"><label htmlFor="sol-estado">Estado</label><div className="tp-hoja-select"><select id="sol-estado" value={borrador.estado} onChange={e => setBorrador(b => ({ ...b, estado: e.target.value as EstadoFiltroSolicitudes }))}>{FILTROS.map(([k, t]) => <option key={k} value={k}>{t}{pag ? ` (${pag.counts[k]})` : ""}</option>)}</select><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="m6 9 6 6 6-6" /></svg></div></div>
      <div className="campo"><label htmlFor="sol-origen">Canal de origen</label><div className="tp-hoja-select"><select id="sol-origen" value={borrador.origen} onChange={e => setBorrador(b => ({ ...b, origen: e.target.value as OrigenFiltroSolicitudes }))}><option value="todos">Todos los orígenes</option><option value="portal">Portal de clientes</option><option value="web">Página web</option></select><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="m6 9 6 6 6-6" /></svg></div></div>
      <div className="campo"><label htmlFor="sol-dia">Fecha</label><FiltroDia compacto id="sol-dia" d={borrador.dia} poner={d => setBorrador(b => ({ ...b, dia: d }))} /></div>
    </div><footer><button type="button" className="btn sec" onClick={limpiarFiltros}>Limpiar filtros</button><button type="button" className="btn" onClick={aplicarFiltros}>Aplicar filtros</button></footer></div></div>}
    {f === "por_confirmar" && <p className="sub">Ya tienen el valor del domicilio: estamos esperando que el cliente responda si está de acuerdo.</p>}
    <div ref={arriba} style={{ scrollMarginTop: 90 }} />
    {q.isError ? <div className="aviso alerta">No se pudo traer la lista: {mensajeDe(q.error)} <button className="btn chico" onClick={() => q.refetch()}>Intentar otra vez</button></div>
      : cargando ? <div className="solicitudes-lista" role="status" aria-label="Cargando solicitudes">{Array.from({ length: 5 }, (_, i) => <div className="sol-fila sol-esqueleto" key={i} aria-hidden="true"><span /><span /><span /></div>)}</div>
      : pag?.data.length ? <>
        <div className="solicitudes-lista" aria-busy={q.isFetching}>
          {pag.data.map(s => <FilaSolicitud key={s.id} s={s} abrir={() => detalle(s)} />)}
        </div>
        <Paginador pagina={pag.pagination.page} paginas={pag.pagination.totalPages} total={pag.pagination.totalItems} porPagina={pag.pagination.limit} ir={irA} cargando={q.isFetching} /></>
      : <div className="vacio">{VACIO[f]}</div>}
  </>;
}

function FilaSolicitud({ s, abrir }: { s: Solicitud; abrir: () => void }) {
  const [clase, estado] = ETQ[s.estado] ?? ["gris", s.estado];
  const estadoCorto = s.estado === "cotizada" ? "Por confirmar" : s.estado === "confirmada" ? "De acuerdo" : estado;
  const valor = s.valor != null ? pesos(s.valor) : "Por definir";
  const fecha = hora(new Date(s.creado).getTime());
  return <button type="button" className="sol-fila" onClick={abrir} aria-label={`Ver detalle de ${s.nombre}: ${estado}`}>
    <span className="sol-fila-escritorio">
      <span className="sol-fila-cliente"><b>{s.nombre}</b><span><em className={s.origen === "portal" ? "portal" : ""}>{s.origen === "portal" ? "Portal" : "Web"}</em><small>{fecha}</small></span></span>
      <span className="sol-fila-ruta"><span><small>{s.direccionRecogida}</small><i aria-hidden="true">→</i><b>{s.destinatarioNombre} · {s.direccionEntrega}</b></span><small>{s.paquetes} paquete{s.paquetes === 1 ? "" : "s"}{s.pesoKg ? ` · ${s.pesoKg} kg` : ""}{s.mensajeroNombre ? ` · ${s.mensajeroNombre}${s.guia ? ` (${s.guia})` : ""}` : ""}</small></span>
      <span className="sol-fila-final"><span className="sol-fila-valor"><b>{valor}</b><small>Domicilio</small></span><span className={"etq " + clase}>{estadoCorto}</span><span className="sol-fila-detalle">Detalle <span aria-hidden="true">›</span></span></span>
    </span>
    <span className="sol-fila-movil"><span className="sol-fila-resumen"><span><b>{s.nombre}</b><span className={"etq " + clase}>{estadoCorto}</span></span><small>{s.destinatarioNombre} · {s.guia || fecha}</small></span><span className="sol-fila-valor"><b>{valor}</b><small>{s.paquetes} paquete{s.paquetes === 1 ? "" : "s"}</small></span><span className="sol-fila-info"><IconoInfo /></span></span>
  </button>;
}

function DetalleSolicitud({ s, cerrar }: { s: Solicitud; cerrar: () => void }) {
  const [clase, estado] = ETQ[s.estado] ?? ["gris", s.estado];
  return <div className="sol-detalle">
    <header className="sol-detalle-cab"><div><h2>{s.nombre} <span className={"etq " + clase}>{estado}</span></h2><p>{hora(new Date(s.creado).getTime())} · {s.origen === "portal" ? "Cliente del portal" : "Solicitud web"}</p></div><button className="cerrar" type="button" data-cerrar aria-label="Cerrar detalle">×</button></header>
    <div className="sol-detalle-cuerpo"><TarjetaSolicitud s={s} enDetalle alCompletar={cerrar} /></div>
  </div>;
}
