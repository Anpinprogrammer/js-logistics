/* Las pantallas del patinador (Mi caja e Historial). Las usan su app (Patinador.tsx) y el modo Patinador de administración
   (DesdeOficina.tsx), que pasa `ajeno` con el patinador elegido: las cifras y lo anotado van a la caja de ese patinador. */
import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import * as api from "../../api/servicios";
import { FalloApi } from "../../api/cliente";
import type { CajaPatinador, ClienteBreve, RegistroCajaPatinador } from "../../api/tipos";
import { DEMO } from "../demo";
import { buscarRemitentes } from "../acciones";
import { motivoError } from "../datos";
import { Kpi, Paginador, useVentana } from "../ui";
import { hora, pesos } from "../motor";
import { registrosDemo, resumenDe } from "./demoCaja";
import { usePorPagina } from "../../lib/pantalla";

const MAX_CONCEPTO = 80;
const DEMO_PROPIO = "m-pat"; // la ficha de patinador@demo.co

/* ---- modo demo: la caja vive en memoria, como el resto de la demo (demoCaja.ts) ---- */
const cajaDemo = (pagina: number, porPagina: number, mensajeroId = DEMO_PROPIO): CajaPatinador => {
  const suyos = registrosDemo.filter(r => r.mensajeroId === mensajeroId);
  const todos = [...suyos].reverse(), paginas = Math.max(1, Math.ceil(todos.length / porPagina)), p = Math.min(pagina, paginas);
  return { resumen: resumenDe(suyos), registros: todos.slice((p - 1) * porPagina, p * porPagina), pagina: p, porPagina, total: todos.length, paginas };
};
const traerCaja = (pagina: number, porPagina: number, mensajeroId?: string) =>
  (DEMO ? Promise.resolve(cajaDemo(pagina, porPagina, mensajeroId)) : api.patinador.caja(pagina, porPagina, mensajeroId));
const anotar = async (d: { mensajeroId?: string; clienteId: string; clienteNombre: string; concepto: string; valor: number }) => {
  if (!DEMO) return api.patinador.registrar({ mensajeroId: d.mensajeroId, clienteId: d.clienteId, concepto: d.concepto, valor: d.valor });
  const mensajeroId = d.mensajeroId || DEMO_PROPIO;
  const registro: RegistroCajaPatinador = { id: "demo-" + Date.now(), mensajeroId, clienteId: d.clienteId, clienteNombre: d.clienteNombre, concepto: d.concepto, valor: d.valor, fecha: new Date().toISOString() };
  registrosDemo.push(registro);
  return { registro, resumen: resumenDe(registrosDemo.filter(r => r.mensajeroId === mensajeroId)) };
};

/** Pesos en texto ("25.000", "$ 25000") → entero. Vacío o inválido = 0. */
const aPesos = (t: string) => Number(t.replace(/\D/g, "")) || 0;
const conMiles = (t: string) => { const n = aPesos(t); return n ? n.toLocaleString("es-CO") : ""; };

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
      : <p className="sub">Anota cada pago que te hace un cliente en tu ruta. Todo se suma a tu caja.</p>}
    {q.isError && <div className="aviso alerta">No se pudo traer {ajeno ? "la" : "tu"} caja: {motivoError(q.error)}</div>}
    <div className="kpis kpis-patinador">
      <Kpi ico="plata" lbl={ajeno ? "Total en su caja" : "Total en mi caja"} val={r ? pesos(r.total) : "…"} pie={<small>{r ? `${r.registros} ${r.registros === 1 ? "pago" : "pagos"}` : ""}</small>} />
      <Kpi ico="caja" lbl="Hoy" val={r ? pesos(r.totalHoy) : "…"} pie={<small>{r ? `${r.registrosHoy} ${r.registrosHoy === 1 ? "pago" : "pagos"}` : ""}</small>} />
    </div>
    <FormPago ajeno={ajeno} />
    <div className="cab-lista"><h2>Últimos pagos</h2>{q.data && q.data.total > 3 ? <button type="button" className="btn sec" onClick={irHistorial}>Ver todo</button> : null}</div>
    <Lista registros={q.data?.registros.slice(0, 3)} cargando={q.isLoading} ajeno={!!ajeno} />
  </>;
}

function FormPago({ ajeno }: { ajeno?: Ajeno }) {
  const v = useVentana(), qc = useQueryClient();
  const [cliente, setCliente] = useState<ClienteBreve | null>(null);
  const [busca, setBusca] = useState(""), [abierto, setAbierto] = useState(false), [opciones, setOpciones] = useState<ClienteBreve[]>([]);
  const [concepto, setConcepto] = useState(""), [valor, setValor] = useState("");
  const comboRef = useRef<HTMLDivElement>(null);

  // Busca en el servidor (desde 2 letras) esperando a que deje de escribir.
  useEffect(() => {
    if (cliente || busca.trim().length < 2) { setOpciones([]); return; }
    let vigente = true;
    const t = setTimeout(() => { buscarRemitentes(busca).then(r => { if (vigente) setOpciones(r); }).catch(() => { if (vigente) setOpciones([]); }); }, 250);
    return () => { vigente = false; clearTimeout(t); };
  }, [busca, cliente]);
  useEffect(() => {
    const fuera = (e: PointerEvent) => { if (comboRef.current && !comboRef.current.contains(e.target as Node)) setAbierto(false); };
    document.addEventListener("pointerdown", fuera);
    return () => document.removeEventListener("pointerdown", fuera);
  }, []);

  const guardar = useMutation({
    mutationFn: anotar,
    onSuccess: ({ registro, resumen }) => {
      qc.invalidateQueries({ queryKey: ["patinador"] });
      setCliente(null); setBusca(""); setConcepto(""); setValor("");
      v.avisar(`Anotado: ${pesos(registro.valor)} de ${registro.clienteNombre}, a favor en su cuenta. ` +
        (ajeno ? `${ajeno.nombre} ya tiene ${pesos(resumen.total)} en su caja.` : `Ya tienes ${pesos(resumen.total)} en tu caja.`));
    },
    onError: e => v.avisar("No se pudo anotar: " + (e instanceof FalloApi ? e.message : motivoError(e)))
  });

  const enviar = (e: React.FormEvent) => {
    e.preventDefault();
    const n = aPesos(valor);
    if (!cliente) return v.avisar(ajeno ? "Elige el cliente que le pagó" : "Elige el cliente que te pagó");
    if (!concepto.trim()) return v.avisar("Escribe el concepto");
    if (n <= 0) return v.avisar(ajeno ? "Escribe cuánto le pagó" : "Escribe cuánto te pagó");
    guardar.mutate({ mensajeroId: ajeno?.id, clienteId: cliente.id, clienteNombre: cliente.nombre, concepto: concepto.trim(), valor: n });
  };

  return (
    <form className="tarjeta form-pago" onSubmit={enviar} noValidate aria-label="Anotar un pago">
      <h2>Anotar un pago</h2>
      <div className="campo">
        <label htmlFor="pgCliente">{ajeno ? "¿Quién le pagó?" : "¿Quién te pagó?"}</label>
        <div className="combo-cliente" ref={comboRef}>
          {cliente
            ? <div className="combo-chip"><span><b>{cliente.nombre}</b></span><button type="button" onClick={() => { setCliente(null); setAbierto(true); }}>Cambiar</button></div>
            : <>
                <div className="combo-buscar">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="M20 20l-3.5-3.5" /></svg>
                  <input id="pgCliente" type="text" autoComplete="off" placeholder="Busca al cliente por nombre…" value={busca}
                    onFocus={() => setAbierto(true)} onChange={e => { setBusca(e.target.value); setAbierto(true); }} />
                </div>
                {abierto && busca.trim().length >= 2 ? <div className="combo-lista" role="listbox">
                  {opciones.map(c => <button type="button" key={c.id} role="option" aria-selected={false} className="combo-opcion" onClick={() => { setCliente(c); setBusca(c.nombre); setAbierto(false); }}>{c.nombre}</button>)}
                  {!opciones.length ? <span className="combo-vacio">No hay clientes con ese nombre.</span> : null}
                </div> : null}
              </>}
        </div>
      </div>
      <div className="campo">
        <label htmlFor="pgConcepto">Concepto</label>
        <input id="pgConcepto" type="text" maxLength={MAX_CONCEPTO} placeholder="Ej. Domicilios de la semana" value={concepto} onChange={e => setConcepto(e.target.value)} />
      </div>
      <div className="campo">
        <label htmlFor="pgValor">Valor recibido</label>
        <input id="pgValor" type="text" inputMode="numeric" autoComplete="off" placeholder="$ 0" value={valor ? "$ " + conMiles(valor) : ""} onChange={e => setValor(e.target.value)} />
      </div>
      <button type="submit" className="btn btn-pago" disabled={guardar.isPending}>{guardar.isPending ? "Guardando…" : "Anotar pago"}</button>
    </form>
  );
}

function Historial({ ajeno }: { ajeno?: Ajeno }) {
  const porPagina = usePorPagina(), [pagina, setPagina] = useState(1);
  // Al cambiar de patinador se vuelve a la primera página.
  const [de, setDe] = useState(ajeno?.id);
  if (de !== ajeno?.id) { setDe(ajeno?.id); setPagina(1); }
  const q = useQuery({ queryKey: [...claveCaja(ajeno), pagina, porPagina], queryFn: () => traerCaja(pagina, porPagina, ajeno?.id), placeholderData: prev => prev });
  const d = q.data, donde = ajeno ? "en la caja de " + ajeno.nombre : "en tu caja";
  return <>
    <h1>Historial</h1>
    <p className="sub">{d ? `${d.resumen.registros} ${d.resumen.registros === 1 ? "pago" : "pagos"} ${donde} · ${pesos(d.resumen.total)}` : ajeno ? "Todos los pagos de " + ajeno.nombre + "." : "Todos los pagos que has anotado."}{ajeno?.cambiar}</p>
    {q.isError && <div className="aviso alerta">No se pudo traer el historial: {motivoError(q.error)}</div>}
    <Lista registros={d?.registros} cargando={q.isLoading} ajeno={!!ajeno} />
    {d && <Paginador pagina={d.pagina} paginas={d.paginas} total={d.total} porPagina={d.porPagina} cargando={q.isFetching} ir={p => { setPagina(p); scrollTo(0, 0); }} />}
  </>;
}

function Lista({ registros, cargando, ajeno }: { registros?: RegistroCajaPatinador[]; cargando: boolean; ajeno?: boolean }) {
  if (cargando) return <div className="vacio" role="status">Cargando…</div>;
  if (!registros?.length) return <div className="vacio">{ajeno ? "Todavía no hay pagos en su caja. Cuando un cliente le pague, anótalo arriba." : "Todavía no has anotado pagos. Cuando un cliente te pague, anótalo arriba."}</div>;
  return <div className="lista lista-patinador">{registros.map(r => (
    <div className="fila fila-pago" key={r.id}>
      <span className="info"><b className="min-w-0">{r.clienteNombre}</b><p>{r.concepto} · {hora(Date.parse(r.fecha))}</p></span>
      <span className="n fila-pago-valor">{pesos(r.valor)}</span>
    </div>
  ))}</div>;
}
