/* Las pantallas del patinador (Mi caja e Historial). Las usan su app (Patinador.tsx) y el modo Patinador de administración
   (DesdeOficina.tsx), que pasa `ajeno` con el patinador elegido: las cifras y lo anotado van a la caja de ese patinador. */
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import * as api from "../../api/servicios";
import type { CajaPatinador, RegistroCajaPatinador } from "../../api/tipos";
import { DEMO } from "../demo";
import { motivoError } from "../datos";
import { Kpi, Paginador } from "../ui";
import { FormPago, Lista, type Anotar } from "../pagos";
import { pesos } from "../motor";
import { registrosDemo, resumenDe } from "./demoCaja";
import { usePorPagina } from "../../lib/pantalla";

const DEMO_PROPIO = "m-pat"; // la ficha de patinador@demo.co

/* ---- modo demo: la caja vive en memoria, como el resto de la demo (demoCaja.ts) ---- */
const cajaDemo = (pagina: number, porPagina: number, mensajeroId = DEMO_PROPIO): CajaPatinador => {
  const suyos = registrosDemo.filter(r => r.mensajeroId === mensajeroId);
  const todos = [...suyos].reverse(), paginas = Math.max(1, Math.ceil(todos.length / porPagina)), p = Math.min(pagina, paginas);
  return { resumen: resumenDe(suyos, mensajeroId), registros: todos.slice((p - 1) * porPagina, p * porPagina), pagina: p, porPagina, total: todos.length, paginas };
};
const traerCaja = (pagina: number, porPagina: number, mensajeroId?: string) =>
  (DEMO ? Promise.resolve(cajaDemo(pagina, porPagina, mensajeroId)) : api.patinador.caja(pagina, porPagina, mensajeroId));
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

/** Las dos pestañas del patinador. La usan su app y el modo Patinador de administración. */
export function VistaPatinador({ tab, irHistorial, ajeno }: { tab: "inicio" | "historial"; irHistorial: () => void; ajeno?: Ajeno }) {
  return tab === "inicio" ? <MiCaja irHistorial={irHistorial} ajeno={ajeno} /> : <Historial ajeno={ajeno} />;
}

function MiCaja({ irHistorial, ajeno }: { irHistorial: () => void; ajeno?: Ajeno }) {
  const porPagina = usePorPagina();
  const q = useQuery({ queryKey: [...claveCaja(ajeno), 1, porPagina], queryFn: () => traerCaja(1, porPagina, ajeno?.id), refetchInterval: 60_000 });
  const r = q.data?.resumen;
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
    <div className="cab-lista"><h2>Últimos pagos</h2>{q.data && q.data.total > 3 ? <button type="button" className="btn sec" onClick={irHistorial}>Ver todo</button> : null}</div>
    <Lista registros={q.data?.registros.slice(0, 3)} cargando={q.isLoading} vacio={ajeno ? VACIO_AJENO : undefined} />
  </>;
}

const VACIO_AJENO = "Todavía no hay pagos en su caja. Cuando un cliente le pague, anótalo arriba.";
const anotarYContar = (d: Parameters<Anotar>[0], ajeno?: Ajeno) => anotar({ ...d, mensajeroId: ajeno?.id }).then(({ registro, resumen }) =>
  `Anotado: ${pesos(registro.valor)} de ${registro.clienteNombre}, a favor en su cuenta. ` +
  (ajeno ? `${ajeno.nombre} ya tiene ${pesos(resumen.enCaja ?? resumen.total)} en su caja.` : `Ya tienes ${pesos(resumen.enCaja ?? resumen.total)} en tu caja.`));

function Historial({ ajeno }: { ajeno?: Ajeno }) {
  const porPagina = usePorPagina(), [pagina, setPagina] = useState(1);
  // Al cambiar de patinador se vuelve a la primera página.
  const [de, setDe] = useState(ajeno?.id);
  if (de !== ajeno?.id) { setDe(ajeno?.id); setPagina(1); }
  const q = useQuery({ queryKey: [...claveCaja(ajeno), pagina, porPagina], queryFn: () => traerCaja(pagina, porPagina, ajeno?.id), placeholderData: prev => prev });
  const d = q.data, donde = ajeno ? "en la caja de " + ajeno.nombre : "en tu caja";
  return <>
    <h1>Historial</h1>
    <p className="sub">{d ? `${d.resumen.registros} ${d.resumen.registros === 1 ? "pago" : "pagos"} ${donde} · ${pesos(d.resumen.total)} recibidos` : ajeno ? "Todos los pagos de " + ajeno.nombre + "." : "Todos los pagos que has anotado."}{ajeno?.cambiar}</p>
    {q.isError && <div className="aviso alerta">No se pudo traer el historial: {motivoError(q.error)}</div>}
    <Lista registros={d?.registros} cargando={q.isLoading} vacio={ajeno ? VACIO_AJENO : undefined} />
    {d && <Paginador pagina={d.pagina} paginas={d.paginas} total={d.total} porPagina={d.porPagina} cargando={q.isFetching} ir={p => { setPagina(p); scrollTo(0, 0); }} />}
  </>;
}
