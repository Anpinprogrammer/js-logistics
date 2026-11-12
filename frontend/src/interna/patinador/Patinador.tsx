/* App del patinador: anota el dinero que le pagan los clientes en su ruta y ve su caja. Es la única pantalla de este rol:
   no baja la oficina ni el mensajero, y no usa los datos en memoria (`S`). Todo lo suma el servidor. */
import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSesion, useUsuario } from "../../auth/Sesion";
import * as api from "../../api/servicios";
import { FalloApi } from "../../api/cliente";
import type { CajaPatinador, ClienteBreve, RegistroCajaPatinador } from "../../api/tipos";
import { DEMO, datosDemo } from "../demo";
import { buscarRemitentes } from "../acciones";
import { motivoError } from "../datos";
import { Icono, IconoSalir, Kpi, Paginador, ProveedorVentana, useVentana } from "../ui";
import { fechaLarga, hoy, hora, horaActual, pesos } from "../motor";
import { registrosDemo, resumenDe } from "./demoCaja";
import { useTema } from "../tema";
import { usePorPagina } from "../../lib/pantalla";
import { CLAVE_NAV_ADMIN, leerNavegacion, usePersistedTab } from "../../hooks/usePersistedTab";
import "../estilos.css";
import "../ajustes.css";

type Pestana = "inicio" | "historial";
const PESTANAS: [Pestana, string][] = [["inicio", "Mi caja"], ["historial", "Historial"]];
const MAX_CONCEPTO = 80;

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

/** Pesos en texto ("25.000", "$ 25000") → entero. Vacío o inválido = 0. */
const aPesos = (t: string) => Number(t.replace(/\D/g, "")) || 0;
const conMiles = (t: string) => { const n = aPesos(t); return n ? n.toLocaleString("es-CO") : ""; };

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
    <FormPago />
    <div className="cab-lista"><h2>Últimos pagos</h2>{q.data && q.data.total > 3 ? <button type="button" className="btn sec" onClick={irHistorial}>Ver todo</button> : null}</div>
    <Lista registros={q.data?.registros.slice(0, 3)} cargando={q.isLoading} />
  </>;
}

function FormPago() {
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
      v.avisar(`Anotado: ${pesos(registro.valor)} de ${registro.clienteNombre}. Ya tienes ${pesos(resumen.total)} en tu caja.`);
    },
    onError: e => v.avisar("No se pudo anotar: " + (e instanceof FalloApi ? e.message : motivoError(e)))
  });

  const enviar = (e: React.FormEvent) => {
    e.preventDefault();
    const n = aPesos(valor);
    if (!cliente) return v.avisar("Elige el cliente que te pagó");
    if (!concepto.trim()) return v.avisar("Escribe el concepto");
    if (n <= 0) return v.avisar("Escribe cuánto te pagó");
    guardar.mutate({ clienteId: cliente.id, clienteNombre: cliente.nombre, concepto: concepto.trim(), valor: n });
  };

  return (
    <form className="tarjeta form-pago" onSubmit={enviar} noValidate aria-label="Anotar un pago">
      <h2>Anotar un pago</h2>
      <div className="campo">
        <label htmlFor="pgCliente">¿Quién te pagó?</label>
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

function Lista({ registros, cargando }: { registros?: RegistroCajaPatinador[]; cargando: boolean }) {
  if (cargando) return <div className="vacio" role="status">Cargando…</div>;
  if (!registros?.length) return <div className="vacio">Todavía no has anotado pagos. Cuando un cliente te pague, anótalo arriba.</div>;
  return <div className="lista lista-patinador">{registros.map(r => (
    <div className="fila fila-pago" key={r.id}>
      <span className="info"><b className="min-w-0">{r.clienteNombre}</b><p>{r.concepto} · {hora(Date.parse(r.fecha))}</p></span>
      <span className="n fila-pago-valor">{pesos(r.valor)}</span>
    </div>
  ))}</div>;
}
