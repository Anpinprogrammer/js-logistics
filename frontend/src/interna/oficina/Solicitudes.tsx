/* Oficina → Solicitudes: las solicitudes de envío que llegan de la página web, con filtros por estado.
   La campanita de la barra sigue mostrando solo las que faltan por atender; aquí está el historial completo. */
import { useRef } from "react";
import { E } from "../estado";
import { Paginador } from "../ui";
import { mensajeDe } from "../../api/cliente";
import { usePorPagina } from "../../lib/pantalla";
import type { GrupoSolicitud } from "../../api/tipos";
import { TarjetaSolicitud, useSolicitudesPagina } from "../Solicitudes";

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
  const porPagina = usePorPagina();
  const arriba = useRef<HTMLDivElement>(null);
  const f = E.filtroSol;
  const q = useSolicitudesPagina(f, E.paginaSol, porPagina);
  const pag = q.data;
  const poner = (g: GrupoSolicitud) => { E.filtroSol = g; E.paginaSol = 1; pintar(); };
  const irA = (n: number) => { E.paginaSol = n; pintar(); arriba.current?.scrollIntoView({ block: "start", behavior: "smooth" }); };
  return <>
    <header className="cab-pedidos">
      <div className="cab-pedidos-txt"><h1>Solicitudes</h1><p className="sub">Pedidos de recogida de la página web y del portal de clientes.</p></div>
    </header>
    <div className="seg seg-estado seg-solicitudes" role="group" aria-label="Filtrar solicitudes">
      {FILTROS.map(([k, t, c]) => <button key={k} aria-pressed={f === k} onClick={() => poner(k)}>{t}{pag ? <> <span className={k === "pendientes" && pag.grupos[c] ? "num" : "num neu"}>{pag.grupos[c]}</span></> : null}</button>)}
    </div>
    {f === "por-confirmar" && <p className="sub">Ya tienen el valor del domicilio: estamos esperando que el cliente responda si está de acuerdo.</p>}
    <div ref={arriba} style={{ scrollMarginTop: 90 }} />
    {q.isError ? <div className="aviso alerta">No se pudo traer la lista: {mensajeDe(q.error)} <button className="btn chico" onClick={() => q.refetch()}>Intentar otra vez</button></div>
      : !pag ? <div className="vacio" role="status">Cargando solicitudes…</div>
      : pag.solicitudes.length ? <>
        <div className="solicitudes solicitudes-pagina" aria-busy={q.isFetching} style={q.isPlaceholderData ? { opacity: .6 } : undefined}>
          {pag.solicitudes.map(s => <TarjetaSolicitud key={s.id} s={s} />)}
        </div>
        <Paginador pagina={pag.pagina} paginas={pag.paginas} total={pag.total} porPagina={pag.porPagina} ir={irA} cargando={q.isPlaceholderData} /></>
      : <div className="vacio">{VACIO[f]}</div>}
  </>;
}
