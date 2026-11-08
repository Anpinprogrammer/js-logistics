/* Piezas comunes de la app interna, con el mismo HTML y las mismas clases del prototipo (app/js/app.js). */
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { useDatos } from "./datos";
import { pedidos as apiPedidos } from "../api/servicios";
import { DEMO } from "./demo";
import type { Archivo } from "../api/tipos";
import { pesos, hoy, moverDia, hora, gastoDe, servicio, nombreCliente, metodoTxt, S, type Pedido } from "./motor";

/* ---------- iconos ---------- */
const svg = (hijos: ReactNode, extra?: { width?: number; height?: number }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...extra}>{hijos}</svg>
);
const camion = <><path d="M2 6h11v10H2zM13 9.5h4l4 3.5v3h-8" /><circle cx="6.5" cy="17.5" r="2" /><circle cx="17" cy="17.5" r="2" /></>;
const camara = <><path d="M4 8h3l2-3h6l2 3h3a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1z" /><circle cx="12" cy="13.5" r="3.5" /></>;
const caja = <><path d="M3 7a2 2 0 0 1 2-2h13v2" /><rect x="3" y="7" width="18" height="13" rx="2" /><path d="M16 13.5h2" /></>;
const ok = <><circle cx="12" cy="12" r="9" /><path d="M8 12.5l2.5 2.5L16 9.5" /></>;
const sueldos = <><rect x="2.5" y="6" width="19" height="12" rx="2" /><circle cx="12" cy="12" r="2.5" /><path d="M6 9.5v5M18 9.5v5" /></>;
const TRAZOS: Record<string, ReactNode> = {
  inicio: <><rect x="3" y="3" width="7" height="9" rx="1.5" /><rect x="14" y="3" width="7" height="5" rx="1.5" /><rect x="14" y="12" width="7" height="9" rx="1.5" /><rect x="3" y="16" width="7" height="5" rx="1.5" /></>,
  pedidos: <><path d="M21 8l-9-5-9 5v8l9 5 9-5V8z" /><path d="M3 8l9 5 9-5M12 13v8" /></>,
  clientes: <><circle cx="9" cy="8" r="3.5" /><path d="M2.5 20c.6-3.5 3.3-5.5 6.5-5.5s5.9 2 6.5 5.5" /><path d="M16 4.6a3.5 3.5 0 0 1 0 6.8M18 14.8c2 .7 3.2 2.5 3.5 5.2" /></>,
  recibos: <><path d="M6 2.5h12v19l-3-2-3 2-3-2-3 2z" /><path d="M9 8h6M9 12h6M9 16h3" /></>,
  caja, cuenta: caja,
  cuentas: <><path d="M3 10l9-6 9 6" /><path d="M5 10v8M9.5 10v8M14.5 10v8M19 10v8M3 21h18" /></>,
  sueldos, sueldo: sueldos,
  mas: <><path d="M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12" /><circle cx="16" cy="6" r="2" /><circle cx="10" cy="12" r="2" /><circle cx="18" cy="18" r="2" /></>,
  menu: <><circle cx="5" cy="12" r="1.3" fill="currentColor" /><circle cx="12" cy="12" r="1.3" fill="currentColor" /><circle cx="19" cy="12" r="1.3" fill="currentColor" /></>,
  nuevo: camara, pend: camion, ruta: camion, ok, entregados: ok,
  dev: <><path d="M9 14L4 9l5-5" /><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11" /></>,
  plata: <><circle cx="12" cy="12" r="9" /><path d="M14.5 9.2c-.5-.8-1.4-1.2-2.5-1.2-1.5 0-2.6.8-2.6 2s1.1 1.7 2.6 2 2.6.8 2.6 2-1.1 2-2.6 2c-1.1 0-2.1-.5-2.6-1.3M12 6.5V8M12 16v1.5" /></>,
};
export const Icono = ({ n }: { n: string }) => svg(TRAZOS[n] ?? TRAZOS.mas);
export const IconoCamara = ({ chico }: { chico?: boolean }) => svg(camara, chico ? { width: 22, height: 22 } : undefined);
export const IconoSalir = () => svg(<path d="M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3M10 17l5-5-5-5M15 12H4" />);

/* ---------- diálogo, avisos y confirmación (una sola ventana, como el prototipo) ---------- */
interface Ventana { abrir: (contenido: ReactNode) => void; cerrar: () => void; avisar: (msg: string) => void; confirmar: (titulo: string, msg: string, boton: string) => Promise<boolean>; ampliar: (src: string) => void }
const CtxV = createContext<Ventana | null>(null);
export const useVentana = () => { const v = useContext(CtxV); if (!v) throw new Error("useVentana fuera de ProveedorVentana"); return v; };

export function ProveedorVentana({ children }: { children: ReactNode }) {
  const dlg = useRef<HTMLDialogElement>(null), cont = useRef<HTMLDivElement>(null);
  const [contenido, setContenido] = useState<ReactNode>(null);
  const [clave, setClave] = useState(0);
  const [toasts, setToasts] = useState<{ id: number; msg: string }[]>([]);
  const [visor, setVisor] = useState("");
  const resolver = useRef<((x: boolean) => void) | null>(null);

  const cerrar = useCallback(() => { dlg.current?.close(); }, []);
  const abrir = useCallback((c: ReactNode) => {
    if (resolver.current) { resolver.current(false); resolver.current = null; }
    setContenido(c); setClave(k => k + 1);
    const d = dlg.current; if (d && !d.open) d.showModal();
    if (cont.current) cont.current.scrollTop = 0;
  }, []);
  const avisar = useCallback((msg: string) => {
    const id = Date.now() + Math.random();
    setToasts(t => [...t, { id, msg }]);
    setTimeout(() => setToasts(t => t.filter(x => x.id !== id)), 2600);
  }, []);
  const confirmar = useCallback((titulo: string, msg: string, boton: string) => new Promise<boolean>(ok => {
    abrir(<>
      <header><h2>{titulo}</h2><button className="cerrar" data-cerrar aria-label="Cerrar">×</button></header>
      <p>{msg}</p>
      <div className="acciones"><button className="btn peligro" data-si>{boton}</button><button className="btn sec" data-cerrar>Cancelar</button></div>
    </>);
    resolver.current = ok;
  }), [abrir]);

  // Botones con data-cerrar cierran la ventana; data-si responde "sí" a la confirmación.
  const alClic = (e: React.MouseEvent) => {
    const t = e.target as HTMLElement;
    if (t.closest("[data-si]") && resolver.current) { const r = resolver.current; resolver.current = null; cerrar(); r(true); return; }
    if (t.closest("[data-cerrar]")) { cerrar(); return; }
    const im = t.closest<HTMLImageElement>("img[data-ampliar], .fotos img");
    if (im?.src) setVisor(im.src);
  };
  useEffect(() => {
    const d = dlg.current; if (!d) return;
    const alCerrar = () => { if (resolver.current) { resolver.current(false); resolver.current = null; } setContenido(null); setVisor(""); };
    d.addEventListener("close", alCerrar);
    return () => d.removeEventListener("close", alCerrar);
  }, []);

  return (
    <CtxV.Provider value={{ abrir, cerrar, avisar, confirmar, ampliar: setVisor }}>
      {children}
      <dialog id="dlg" ref={dlg} onClick={e => { if (e.target === dlg.current) cerrar(); else alClic(e); }}>
        <div className="dlg" id="dlgCont" ref={cont} key={clave}>{contenido}</div>
        {visor && <Visor src={visor} cerrar={() => setVisor("")} />}
      </dialog>
      {visor && !dlg.current?.open && <Visor src={visor} cerrar={() => setVisor("")} />}
      {toasts.map(t => <div key={t.id} className="toast" role="status">{t.msg}</div>)}
    </CtxV.Provider>
  );
}
const Visor = ({ src, cerrar }: { src: string; cerrar: () => void }) => (
  <div className="visor" onClick={e => { e.stopPropagation(); cerrar(); }}><img src={src} alt="" /><button className="cerrar" aria-label="Cerrar">×</button></div>
);

/** Encabezado de la ventana: título, subtítulo y la ×. */
export const Cab = ({ children, sub }: { children: ReactNode; sub?: ReactNode }) => (
  <header>{sub !== undefined ? <div>{children}{sub}</div> : children}<button className="cerrar" data-cerrar aria-label="Cerrar">×</button></header>
);

/* ---------- etiquetas y filas ---------- */
const pl = (n: number, uno: string, varios = uno + "s") => (n === 1 ? uno : varios);
export { pl };
export const EtqEstado = ({ p }: { p: Pedido }) => p.estado === "entregado" ? <span className="etq ent">Entregado</span>
  : p.estado === "devuelto" ? <span className="etq dev">Devuelto</span>
  : <><span className="etq pend">Por entregar</span>{p.intentos.length ? <>{" "}<span className="etq sin">{p.intentos.length} {pl(p.intentos.length, "intento")}</span></> : null}</>;
export const EtqCambio = ({ p }: { p: Pedido }) => p.cambio ? <>{" "}{p.cambioRecibido ? <span className="etq ent">Cambio recibido</span> : <span className="etq sin">Cambio por entregar</span>}</> : null;
export const EtqDash = ({ p }: { p: Pedido }) => p.estado === "pendiente" ? <span className="etq ruta">En ruta</span> : <EtqEstado p={p} />;
export const Mini = ({ p }: { p: Pedido }) => p.mini ? <img src={p.mini} alt="" /> : <span className="sinfoto" />;

export function FilaPedido({ p, onClick }: { p: Pedido; onClick: () => void }) {
  return (
    <button className="fila" onClick={onClick}><Mini p={p} />
      <span className="info"><span className="guia">{p.guia}</span> <EtqEstado p={p} /><EtqCambio p={p} />{Number(p.difCobro) ? <>{" "}<span className="etq sin">Diferencia {pesos(p.difCobro)}</span></> : null}
        <p>{p.clienteId ? nombreCliente(p.clienteId) : <span className="etq sin">Sin remitente</span>} · {S.mensajeros[p.mensajeroId]?.nombre || ""} · {hora(p.creado)}</p></span>
      <span className="n" style={{ textAlign: "right", fontWeight: 700 }}>{p.estado === "entregado" ? pesos(p.valorCobrado) : ""}</span></button>
  );
}

/** Filtro por día: ‹ fecha › y "Ver todos"/"Hoy". "" = todos los días. */
export function FiltroDia({ d, poner }: { d: string; poner: (d: string) => void }) {
  return (
    <div className="filtro-dia"><button className="btn sec chico" aria-label="Día anterior" onClick={() => poner(moverDia(d, -1))}>‹</button>
      <input type="date" id="diaPed" value={d} max={hoy()} aria-label="Filtrar por día" onChange={e => poner(e.target.value)} />
      <button className="btn sec chico" aria-label="Día siguiente" disabled={!d || d >= hoy()} onClick={() => poner(moverDia(d, 1))}>›</button>
      {d ? <button className="btn sec chico" onClick={() => poner("")}>Ver todos</button> : <button className="btn sec chico" onClick={() => poner(hoy())}>Hoy</button>}</div>
  );
}

export function TablaEntregas({ ps, conCliente }: { ps: Pedido[]; conCliente: boolean }) {
  if (!ps.length) return <div className="vacio">No hay entregas.</div>;
  const conGasto = ps.some(p => gastoDe(p)), suma = (f: (p: Pedido) => number) => ps.reduce((a, p) => a + f(p), 0);
  const orden = ps.slice().sort((a, b) => (a.entregado || 0) - (b.entregado || 0));
  return (
    <div className="tabla-env"><table><thead><tr><th>Guía</th>{conCliente && <th>Remitente</th>}<th>Recibió</th><th>Método</th><th className="n">Servicio</th>{conGasto && <th className="n">Flete</th>}<th className="n">Cobrado</th></tr></thead><tbody>
      {orden.map(p => <tr key={p.guia}><td className="guia">{p.guia}</td>{conCliente && <td>{nombreCliente(p.clienteId) || "—"}</td>}<td>{p.destinatario}</td><td>{metodoTxt(p)}</td><td className="n">{pesos(servicio(p))}</td>{conGasto && <td className="n">{gastoDe(p) ? pesos(gastoDe(p)) : "—"}</td>}<td className="n">{pesos(p.valorCobrado)}</td></tr>)}
      <tr><td colSpan={conCliente ? 4 : 3}><b>Total</b></td><td className="n"><b>{pesos(suma(servicio))}</b></td>{conGasto && <td className="n"><b>{pesos(suma(gastoDe))}</b></td>}<td className="n"><b>{pesos(suma(p => Number(p.valorCobrado) || 0))}</b></td></tr>
    </tbody></table></div>
  );
}

/* ---------- gráficas del panel ---------- */
export function Kpi({ ico, lbl, val, pie, onClick, cls }: { ico: string; lbl: string; val: ReactNode; pie?: ReactNode; onClick?: () => void; cls?: string }) {
  const dentro = <><span className="lbl"><Icono n={ico} />{lbl}</span><b>{val}</b>{pie}</>;
  return onClick ? <button className={"kpi " + (cls || "")} onClick={onClick}>{dentro}</button> : <div className={"kpi " + (cls || "")}>{dentro}</div>;
}

export function Dona({ segs, centro, sub }: { segs: { t: string; n: number; c: string }[]; centro: ReactNode; sub: string }) {
  const tot = segs.reduce((a, x) => a + x.n, 0), r = 15.915, gap = segs.filter(x => x.n).length > 1 ? 1.2 : 0;
  let acum = 0;
  return (
    <div className="dona"><div className="dona-svg"><svg viewBox="0 0 42 42" role="img" aria-label={segs.map(x => x.t + ": " + x.n).join(", ")}>
      <circle cx="21" cy="21" r={r} fill="none" stroke="var(--hueco)" strokeWidth="6" />
      {segs.filter(x => x.n).map(x => { const p = (x.n * 100) / tot, l = Math.max(0.5, p - gap), o = -acum; acum += p;
        return <circle key={x.t} cx="21" cy="21" r={r} fill="none" stroke={x.c} strokeWidth="6" strokeDasharray={`${l} ${100 - l}`} strokeDashoffset={o} data-tip=""><title>{x.t}: {x.n}</title></circle>; })}
    </svg><div className="dona-centro"><b>{centro}</b><span>{sub}</span></div></div>
      <ul className="leyenda">{segs.map(x => <li key={x.t}><i style={{ background: x.c }} />{x.t}<b>{x.n}</b></li>)}</ul></div>
  );
}

export function Columnas({ datos, nombre }: { datos: { l: string; n: number; tip: string; hoy: boolean }[]; nombre: string }) {
  const max = Math.max(4, Math.ceil(Math.max(...datos.map(d => d.n)) / 4) * 4), cada = Math.ceil(datos.length / 8);
  return <>
    <div className="colbar" role="img" aria-label={`${nombre}: ${datos.map(d => d.tip).join(", ")}`}><span className="colbar-max">{max}</span>
      {datos.map((d, i) => <div key={i} className={"cb" + (d.hoy ? " hoy" : "")} tabIndex={0} data-tip={d.tip}><i style={{ height: (d.n * 100) / max + "%" }} /></div>)}</div>
    <div className="colbar-ejes" aria-hidden="true">{datos.map((d, i) => <span key={i}>{(datos.length - 1 - i) % cada === 0 ? d.l : ""}</span>)}</div>
  </>;
}

/* ---------- fotos de una guía ---------- */
export const fotosCache = new Map<string, Archivo[]>();
/** Fotos y firma de la guía como en el prototipo: Salida, Entrega (o Evidencia), Firma y las entregas anteriores. */
export function FotosGuia({ p, id, firma = "Firma", conPrevias, soloSalida }: { p: Pedido; id: string; firma?: string; conPrevias?: boolean; soloSalida?: boolean }) {
  const [lista, setLista] = useState<Archivo[] | null | "error">(fotosCache.get(p.guia) ?? null);
  useEffect(() => {
    if (DEMO) { setLista([]); return; }
    let vivo = true;
    apiPedidos.archivos(p.guia).then(a => { fotosCache.set(p.guia, a); if (vivo) setLista(a); }).catch(() => vivo && setLista("error"));
    return () => { vivo = false; };
  }, [p.guia, p.estado]);
  if (lista === null) return <div className="fotos" id={id}><span className="sub">Cargando fotos…</span></div>;
  if (lista === "error") return <div className="fotos" id={id}><span className="sub">No se pudieron cargar las fotos.</span></div>;
  const de = (t: Archivo["tipo"]) => lista.filter(a => a.tipo === t);
  const items: [string, string][] = [
    ...de("salida").map(a => ["Salida", a.url] as [string, string]),
    ...(!soloSalida && p.estado !== "pendiente" ? [...de("entrega").map(a => [p.estado === "devuelto" ? "Evidencia" : "Entrega", a.url] as [string, string]), ...de("firma").map(a => [firma, a.url] as [string, string])] : []),
    ...(conPrevias ? de("previa").map(a => ["Entrega anterior · " + hora(new Date(a.creado).getTime()), a.url] as [string, string]) : []),
  ];
  return <div className="fotos" id={id}>{items.length ? items.map(([t, s]) => <figure key={s}><img src={s} alt={t} /><figcaption>{t}</figcaption></figure>) : <span className="sub">Sin fotos.</span>}</div>;
}

/** Re-pinta la pantalla cuando cambian los datos. */
export const useVersion = () => useDatos().version;

/** Paginador de listas: la página la corta el servidor; aquí solo se muestra y se pide otra. */
export function Paginador({ pagina, paginas, total, porPagina, ir, cargando }: { pagina: number; paginas: number; total: number; porPagina: number; ir: (p: number) => void; cargando?: boolean }) {
  if (paginas <= 1) return null;
  const desde = (pagina - 1) * porPagina + 1, hasta = Math.min(total, pagina * porPagina);
  return (
    <nav className="paginador" aria-label="Páginas de la lista">
      <button className="btn sec" disabled={pagina <= 1 || cargando} onClick={() => ir(pagina - 1)} aria-label="Página anterior">‹ Anterior</button>
      <span className="sub" aria-live="polite">Página <b>{pagina}</b> de {paginas}<span className="pag-rango"> · {desde}–{hasta} de {total}</span></span>
      <button className="btn sec" disabled={pagina >= paginas || cargando} onClick={() => ir(pagina + 1)} aria-label="Página siguiente">Siguiente ›</button>
    </nav>
  );
}
