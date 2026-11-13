/* Las pantallas del patinador (Inicio, Mi caja con su historial y Solicitudes). Las usan su app (Patinador.tsx) y el modo Patinador de administración
   (DesdeOficina.tsx), que pasa `ajeno` con el patinador elegido: las cifras y lo anotado van a la caja de ese patinador. */
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import * as api from "../../api/servicios";
import type { CajaPatinador, PaginaSolicitudesRecogida, RegistroCajaPatinador, SolicitudRecogida } from "../../api/tipos";
import { DEMO } from "../demo";
import { motivoError } from "../datos";
import { Kpi, Paginador } from "../ui";
import { FormPago, Lista, type Anotar } from "../pagos";
import { hora, pesos, S } from "../motor";
import { registrosDemo, resumenDe, solicitudesRecogidaDemo } from "./demoCaja";
import { usePorPagina, usePorPaginaRecogidas } from "../../lib/pantalla";

const DEMO_PROPIO = "m-pat"; // la ficha de patinador@demo.co

/* ---- modo demo: la caja vive en memoria, como el resto de la demo (demoCaja.ts) ---- */
const cajaDemo = (pagina: number, porPagina: number, mensajeroId = DEMO_PROPIO): CajaPatinador => {
  const suyos = registrosDemo.filter(r => r.mensajeroId === mensajeroId);
  // Las entregas a administración (S.recaudos) también salen en su historial, como en el servidor.
  const entregas: RegistroCajaPatinador[] = Object.values(S.recaudos).filter(r => r.mensajeroId === mensajeroId).map(r => ({
    id: r.id, mensajeroId, clienteId: "", clienteNombre: r.porNombre ? "Entregado a " + r.porNombre : "Entregado a la oficina", concepto: r.nota, valor: Number(r.valor) || 0,
    fecha: new Date(r.fecha).toISOString(), medio: r.medio, tipo: "entrega"
  }));
  const todos = [...suyos, ...entregas].sort((a, b) => Date.parse(b.fecha) - Date.parse(a.fecha)), paginas = Math.max(1, Math.ceil(todos.length / porPagina)), p = Math.min(pagina, paginas);
  return { resumen: resumenDe(suyos, mensajeroId), registros: todos.slice((p - 1) * porPagina, p * porPagina), pagina: p, porPagina, total: todos.length, paginas };
};
const traerCaja = (pagina: number, porPagina: number, mensajeroId?: string) =>
  (DEMO ? Promise.resolve(cajaDemo(pagina, porPagina, mensajeroId)) : api.patinador.caja(pagina, porPagina, mensajeroId));
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

/* ---- Inicio: dos tarjetas, la caja con sus últimos 4 movimientos y las solicitudes de recogida pendientes ---- */
function Inicio({ ir, ajeno }: { ir: (t: TabPatinador) => void; ajeno?: Ajeno }) {
  const porPagina = usePorPagina();
  const q = useQuery({ queryKey: [...claveCaja(ajeno), 1, porPagina], queryFn: () => traerCaja(1, porPagina, ajeno?.id), refetchInterval: 60_000 });
  const r = q.data?.resumen;
  return <>
    <h1>{ajeno ? "Inicio del patinador" : "Inicio"}</h1>
    {ajeno && <p className="sub">{ajeno.nombre}{ajeno.cambiar}</p>}
    <div className="pat-tarjetas">
      <section className="pat-tarjeta" aria-labelledby="pat-t-caja">
        <div className="pat-tarjeta-cab">
          <div><h2 id="pat-t-caja">{ajeno ? "Su caja" : "Mi caja"}</h2><b className="pat-saldo">{r ? pesos(r.enCaja ?? r.total) : "…"}</b><small>{ajeno ? "Lo que tiene en la mano" : "Lo que tienes en la mano"}</small></div>
          <button type="button" className="btn" onClick={() => ir("caja")}>Ir a Mi caja<span aria-hidden="true"> →</span></button>
        </div>
        {q.isError && <div className="aviso alerta">No se pudo traer {ajeno ? "la" : "tu"} caja: {motivoError(q.error)}</div>}
        <h3>Últimos movimientos</h3>
        <Lista registros={q.data?.registros.slice(0, 4)} cargando={q.isLoading} vacio={ajeno ? VACIO_AJENO : undefined} />
      </section>
      <section className="pat-tarjeta" aria-labelledby="pat-t-sol">
        <div className="pat-tarjeta-cab"><div><h2 id="pat-t-sol">Solicitudes de recogida</h2><small>Pendientes por recoger</small></div></div>
        <ListaSolicitudes ajeno={ajeno} />
      </section>
    </div>
  </>;
}

/* ---- Solicitudes de recogida, paginadas en el servidor: 5 por página en el celular y 10 en el computador ---- */
function ListaSolicitudes({ ajeno }: { ajeno?: Ajeno }) {
  const limite = usePorPaginaRecogidas(), [pagina, setPagina] = useState(1);
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

/* ---- Mi caja: las cifras, el formulario y el historial de movimientos (pagos y entregas a administración) ---- */
function MiCaja({ ajeno }: { ajeno?: Ajeno }) {
  const porPagina = usePorPagina(), [pagina, setPagina] = useState(1);
  const q = useQuery({ queryKey: [...claveCaja(ajeno), pagina, porPagina], queryFn: () => traerCaja(pagina, porPagina, ajeno?.id), placeholderData: prev => prev, refetchInterval: 60_000 });
  const d = q.data, r = d?.resumen;
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
    <FormPago anotar={d => anotarYContar(d, ajeno)} invalidar={["patinador"]} deOtro={!!ajeno} />
    <div className="cab-lista"><h2>Historial de movimientos</h2></div>
    <Lista registros={d?.registros} cargando={q.isLoading} vacio={ajeno ? VACIO_AJENO : undefined} />
    {d && <Paginador pagina={d.pagina} paginas={d.paginas} total={d.total} porPagina={d.porPagina} cargando={q.isFetching} ir={p => { setPagina(p); }} />}
  </>;
}

const VACIO_AJENO = "Todavía no hay pagos en su caja. Cuando un cliente le pague, anótalo arriba.";
const anotarYContar = (d: Parameters<Anotar>[0], ajeno?: Ajeno) => anotar({ ...d, mensajeroId: ajeno?.id }).then(({ registro, resumen }) =>
  `Anotado: ${pesos(registro.valor)} de ${registro.clienteNombre}, a favor en su cuenta. ` +
  (ajeno ? `${ajeno.nombre} ya tiene ${pesos(resumen.enCaja ?? resumen.total)} en su caja.` : `Ya tienes ${pesos(resumen.enCaja ?? resumen.total)} en tu caja.`));
