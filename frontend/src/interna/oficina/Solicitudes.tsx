/* Oficina → Solicitudes: las solicitudes de envío que llegan de la página web, con filtros por estado.
   La campanita de la barra sigue mostrando solo las que faltan por atender; aquí está el historial completo. */
import { useRef } from "react";
import { E } from "../estado";
import { IconoInfo, Paginador, useVentana } from "../ui";
import { mensajeDe } from "../../api/cliente";
import { usePorPagina } from "../../lib/pantalla";
import type { GrupoSolicitud, Solicitud } from "../../api/tipos";
import { hora, pesos } from "../motor";
import { ETQ, TarjetaSolicitud, useSolicitudesPagina } from "../Solicitudes";

const FILTROS: [GrupoSolicitud, string, "todas" | "pendientes" | "porConfirmar" | "aceptadas" | "rechazadas"][] = [
  ["todas", "Todas", "todas"], ["pendientes", "Pendientes", "pendientes"], ["por-confirmar", "Por confirmar", "porConfirmar"],
  ["aceptadas", "Aceptadas", "aceptadas"], ["rechazadas", "Rechazadas", "rechazadas"],
];
const VACIO: Record<GrupoSolicitud, string> = {
  todas: "Todavía no ha llegado ninguna solicitud.",
  pendientes: "No hay solicitudes nuevas por revisar.",
  "por-confirmar": "No hay solicitudes esperando la respuesta del cliente.",
  aceptadas: "Aún no hay solicitudes aceptadas.",
  rechazadas: "No hay solicitudes rechazadas.",
};

export default function Solicitudes({ pintar }: { pintar: () => void }) {
  const ventana = useVentana();
  const porPagina = usePorPagina();
  const arriba = useRef<HTMLDivElement>(null);
  const f = E.filtroSol;
  const q = useSolicitudesPagina(f, E.paginaSol, porPagina);
  const pag = q.data;
  const poner = (g: GrupoSolicitud) => { E.filtroSol = g; E.paginaSol = 1; pintar(); };
  const irA = (n: number) => { E.paginaSol = n; pintar(); arriba.current?.scrollIntoView({ block: "start", behavior: "smooth" }); };
  const detalle = (s: Solicitud) => ventana.abrir(<DetalleSolicitud s={s} cerrar={ventana.cerrar} />, "solicitud");
  return <>
    <header className="cab-pedidos cab-solicitudes">
      <div className="cab-pedidos-txt"><h1>Solicitudes</h1><p className="sub">Pedidos de recogida de la página web y del portal de clientes.</p></div>
    </header>
    <div className="seg-solicitudes-marco">
      <div className="seg seg-estado seg-solicitudes" role="group" aria-label="Filtrar solicitudes">
        {FILTROS.map(([k, t, c]) => <button key={k} type="button" aria-pressed={f === k} onClick={e => {
          e.currentTarget.scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" });
          poner(k);
        }}>{t}{pag ? <> <span className={k === "pendientes" && pag.grupos[c] ? "num" : "num neu"}>{pag.grupos[c]}</span></> : null}</button>)}
      </div>
      <span className="seg-solicitudes-degrade" aria-hidden="true" />
    </div>
    {f === "por-confirmar" && <p className="sub">Ya tienen el valor del domicilio: estamos esperando que el cliente responda si está de acuerdo.</p>}
    <div ref={arriba} style={{ scrollMarginTop: 90 }} />
    {q.isError ? <div className="aviso alerta">No se pudo traer la lista: {mensajeDe(q.error)} <button className="btn chico" onClick={() => q.refetch()}>Intentar otra vez</button></div>
      : !pag ? <div className="vacio" role="status">Cargando solicitudes…</div>
      : pag.solicitudes.length ? <>
        <div className="solicitudes-lista" aria-busy={q.isFetching} style={q.isPlaceholderData ? { opacity: .6 } : undefined}>
          {pag.solicitudes.map(s => <FilaSolicitud key={s.id} s={s} abrir={() => detalle(s)} />)}
        </div>
        <Paginador pagina={pag.pagina} paginas={pag.paginas} total={pag.total} porPagina={pag.porPagina} ir={irA} cargando={q.isPlaceholderData} /></>
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
