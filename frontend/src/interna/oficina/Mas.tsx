/* Oficina → Más: Resultados, Personal (con accesos), Historial, Papelera y Respaldo, igual al prototipo. */
import { useEffect, useRef, useState } from "react";
import { keepPreviousData, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  S, yo, hoy, hora, pesos, diaDe, moverDia, fechaLarga, cerrado, servicio, totales, sueldosDia, saldoCliente, nombreCliente, listaOrdenada, sinTildes, tipoDe, esRepartidor, vinculosDe,
  SUBMAS, TIPOS, ROLES, telWhatsApp, type Persona, type TipoPersonal, type UsuarioS,
} from "../motor";
import { Cab, IconoCargando, IconoCorreo, IconoCorreoMasivo, IconoEditar, IconoEnviar, IconoLiberar, IconoLlave, IconoQuitarUsuario, IconoWhatsApp, Paginador, useVentana } from "../ui";
import { E, guardarLocal } from "../estado";
import { cambiarAcceso, cambiarClaveDe, crearAcceso, guardarPersona, quitarAcceso, quitarPersona, type AccesoWhatsApp } from "../acciones";
import { aPersona, aUsuario, motivoError, useDatos } from "../datos";
import { DEMO } from "../demo";
import { useEscritorio, usePorPaginaAccesos, usePorPaginaHistorial, usePorPaginaPersonal } from "../../lib/pantalla";
import * as api from "../../api/servicios";
import type { Cambio, EnPapelera, PaginaHistorial, PaginaPersonal, Rol } from "../../api/tipos";
import { FormCliente } from "./Clientes";

export default function Mas({ pintar }: { pintar: () => void }) {
  // En el escritorio cada sub-pestaña es un acceso directo del menú lateral; en el celular siguen aquí.
  const escritorio = useEscritorio();
  return <>
    {!escritorio && <div className="filtros" style={{ marginBottom: 16 }}>{SUBMAS.map(([k, t]) => <button key={k} aria-pressed={E.subMas === k} onClick={() => { E.subMas = k; pintar(); }}>{t}</button>)}</div>}
    {E.subMas === "personal" ? <Personal /> : E.subMas === "historial" ? <Historial /> : E.subMas === "papelera" ? <Papelera /> : E.subMas === "respaldo" ? <Respaldo /> : <Resultados pintar={pintar} />}
  </>;
}

/* ---------- Resultados ---------- */
function rangoPanel(): [string, string, string] {
  const h = hoy();
  if (E.rangoPanel === "hoy") return [h, h, "Hoy"];
  if (E.rangoPanel === "7") return [moverDia(h, -6), h, "Últimos 7 días"];
  if (E.rangoPanel === "mesant") { const [y, m] = h.split("-").map(Number), py = m === 1 ? y - 1 : y, pm = m === 1 ? 12 : m - 1, ini = `${py}-${String(pm).padStart(2, "0")}-01`; return [ini, moverDia(h.slice(0, 8) + "01", -1), "Mes pasado"]; }
  return [h.slice(0, 8) + "01", h, "Este mes"];
}
function Resultados({ pintar }: { pintar: () => void }) {
  const [a, b, tit] = rangoPanel();
  const ps = Object.values(S.pedidos).filter(p => cerrado(p) && diaDe(p.entregado || 0) >= a && diaDe(p.entregado || 0) <= b);
  const ent = ps.filter(p => p.estado === "entregado"), dev = ps.filter(p => p.estado === "devuelto");
  const dom = ps.reduce((x, p) => x + servicio(p), 0), t = totales(ent);
  const dias: string[] = []; for (let d = a; d <= b; d = moverDia(d, 1)) dias.push(d);
  const javier = dias.reduce((x, d) => x + sueldosDia(d).javier, 0);
  const enRuta = Object.values(S.pedidos).filter(p => p.estado === "pendiente").length;
  const porM: Record<string, { ent: number; dev: number; dom: number; dias: Set<string> }> = {}, porC: Record<string, { ent: number; dev: number; dom: number }> = {}, porS = [0, 0, 0, 0, 0, 0, 0];
  ps.forEach(p => {
    const m = (porM[p.mensajeroId] = porM[p.mensajeroId] || { ent: 0, dev: 0, dom: 0, dias: new Set() }); if (p.estado === "devuelto") m.dev++; else m.ent++; m.dom += servicio(p); m.dias.add(diaDe(p.entregado || 0));
    if (p.clienteId) { const c = (porC[p.clienteId] = porC[p.clienteId] || { ent: 0, dev: 0, dom: 0 }); if (p.estado === "devuelto") c.dev++; else c.ent++; c.dom += servicio(p); }
    if (p.estado === "entregado") porS[(new Date(diaDe(p.entregado || 0) + "T12:00:00-05:00").getUTCDay() + 6) % 7]++;
  });
  const maxS = Math.max(1, ...porS), nomS = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];
  const cli = Object.entries(porC).sort((x, y) => y[1].dom - x[1].dom).slice(0, 15);
  const pct = (n: number) => (ps.length ? Math.round((n * 100) / ps.length) + "%" : "0%");
  return <>
    <h1>Resultados</h1><p className="sub">{tit}: {fechaLarga(a)}{a !== b ? " al " + fechaLarga(b) : ""}</p>
    <div className="filtros">{[["hoy", "Hoy"], ["7", "7 días"], ["mes", "Este mes"], ["mesant", "Mes pasado"]].map(([k, tx]) => <button key={k} aria-pressed={E.rangoPanel === k} onClick={() => { E.rangoPanel = k; pintar(); }}>{tx}</button>)}</div>
    <div className="cifras">
      <div className="cifra fuerte"><span>Entregas</span><b>{ent.length}</b><span>{enRuta} en ruta ahora</span></div>
      <div className="cifra"><span>Devoluciones</span><b>{dev.length}</b><span>{pct(dev.length)} de los pedidos cerrados</span></div>
      <div className="cifra"><span>Domicilios facturados</span><b>{pesos(dom)}</b></div>
      <div className="cifra"><span>Sueldo de Javier (dueño)</span><b className={javier < 0 ? "neg" : ""}>{pesos(javier)}</b></div>
      <div className="cifra"><span>Efectivo cobrado</span><b>{pesos(t.efectivo)}</b></div>
      <div className="cifra"><span>Transferencias a JS</span><b>{pesos(t.transfJs)}</b></div>
    </div>
    <h2>Por mensajero</h2>
    {Object.keys(porM).length ? <div className="tabla-env"><table><thead><tr><th>Mensajero</th><th className="n">Entregas</th><th className="n">Devol.</th><th className="n">Días</th><th className="n">Entregas por día</th><th className="n">Domicilios</th></tr></thead><tbody>
      {Object.entries(porM).sort((x, y) => y[1].ent - x[1].ent).map(([id, m]) => <tr key={id}><td><b>{S.mensajeros[id]?.nombre || "(quitado)"}</b></td><td className="n">{m.ent}</td><td className="n">{m.dev || "—"}</td><td className="n">{m.dias.size}</td><td className="n">{(m.ent / Math.max(1, m.dias.size)).toFixed(1)}</td><td className="n">{pesos(m.dom)}</td></tr>)}
    </tbody></table></div> : <div className="vacio">Sin entregas en este período.</div>}
    <h2>Clientes que más facturan</h2>
    {cli.length ? <div className="tabla-env"><table><thead><tr><th>Cliente</th><th className="n">Entregas</th><th className="n">Devol.</th><th className="n">Domicilios</th><th className="n">Saldo hoy</th></tr></thead><tbody>
      {cli.map(([id, c]) => { const sd = saldoCliente(id); return <tr key={id}><td><b>{nombreCliente(id) || "(eliminado)"}</b></td><td className="n">{c.ent}</td><td className="n">{c.dev || "—"}</td><td className="n">{pesos(c.dom)}</td><td className={"n " + (sd < 0 ? "neg" : sd > 0 ? "pos" : "")}>{pesos(sd)}</td></tr>; })}
    </tbody></table></div> : <div className="vacio">Sin entregas con remitente en este período.</div>}
    <h2>Entregas por día de la semana</h2>
    <div className="barras">{porS.map((n, i) => <div key={i}><span>{nomS[i]}</span><i style={{ width: Math.round((n * 100) / maxS) + "%" }} /><span>{n}</span></div>)}</div>
  </>;
}

/* ---------- Personal y accesos ---------- */
type PersonalSubTab = "personal" | "acceso";

/** Ventana flotante de los formularios de Personal; cierra con la X, Cancelar, Escape o clic afuera. */
function Modal({ titulo, sub, alCerrar, children, compacto, ancha }: { titulo: string; sub?: React.ReactNode; alCerrar: () => void; children: React.ReactNode; compacto?: boolean; ancha?: boolean }) {
  useEffect(() => {
    const alTeclear = (e: KeyboardEvent) => { if (e.key === "Escape") alCerrar(); };
    document.addEventListener("keydown", alTeclear);
    return () => document.removeEventListener("keydown", alTeclear);
  }, [alCerrar]);
  return <div className="modal-fondo" onClick={(e: React.MouseEvent<HTMLDivElement>) => { if (e.target === e.currentTarget) alCerrar(); }}>
    <div className={"modal-caja" + (compacto ? " modal-caja-personal" : "") + (ancha ? " modal-caja-ancha" : "")} role="dialog" aria-modal="true" aria-label={titulo}>
      <button type="button" className="modal-cerrar" aria-label="Cerrar" onClick={alCerrar}>×</button>
      <h2>{titulo}</h2>
      {sub ? <div className="modal-sub">{sub}</div> : null}
      {children}
    </div>
  </div>;
}

type PaginaPersonalUI = { filas: Persona[]; pagina: number; porPagina: number; total: number; paginas: number };
/** Personal en memoria (modo demo) con los mismos filtros y paginación del servidor. */
function paginaPersonalDemo(f: { buscar: string; tipo: string }, pagina: number, porPagina: number): PaginaPersonalUI {
  const q = sinTildes(f.buscar.trim());
  const lista = listaOrdenada(S.mensajeros, "nombre")
    .sort((a, b) => Object.keys(TIPOS).indexOf(tipoDe(a)) - Object.keys(TIPOS).indexOf(tipoDe(b)))
    .filter(m => !f.tipo || tipoDe(m) === f.tipo)
    .filter(m => !q || sinTildes(m.nombre + " " + (m.telefono || "")).includes(q));
  const paginas = Math.max(1, Math.ceil(lista.length / porPagina));
  const actual = Math.min(Math.max(1, pagina), paginas);
  return { filas: lista.slice((actual - 1) * porPagina, actual * porPagina), pagina: actual, porPagina, total: lista.length, paginas };
}

function Personal() {
  const v = useVentana();
  const [tab, setTab] = useState<PersonalSubTab>("personal");
  const [modalPersonal, setModalPersonal] = useState(false);
  const [editando, setEditando] = useState<Persona | null>(null);
  const [modalAcceso, setModalAcceso] = useState(false);
  const [texto, setTexto] = useState(""), [buscar, setBuscar] = useState("");
  const [tipoFiltro, setTipoFiltro] = useState<"" | TipoPersonal>("");
  const [pagina, setPagina] = useState(E.paginaPersonal);
  const porPagina = usePorPaginaPersonal(), { version } = useDatos();
  const tBuscar = useRef<number>(0), arribaPer = useRef<HTMLDivElement>(null);
  const ms = listaOrdenada(S.mensajeros, "nombre").sort((a, b) => Object.keys(TIPOS).indexOf(tipoDe(a)) - Object.keys(TIPOS).indexOf(tipoDe(b)));
  const alBuscar = (x: string) => { setTexto(x); clearTimeout(tBuscar.current); tBuscar.current = window.setTimeout(() => { setBuscar(x); E.paginaPersonal = 1; setPagina(1); }, 300); };
  const alTipo = (t: "" | TipoPersonal) => { setTipoFiltro(t); E.paginaPersonal = 1; setPagina(1); };
  const hayFiltros = !!(buscar.trim() || tipoFiltro);
  const qPer = useQuery({
    queryKey: ["personal", "pagina", buscar, tipoFiltro, pagina, porPagina, version],
    enabled: tab === "personal",
    placeholderData: keepPreviousData,
    queryFn: (): Promise<PaginaPersonalUI> => DEMO
      ? Promise.resolve(paginaPersonalDemo({ buscar, tipo: tipoFiltro }, pagina, porPagina))
      : api.mensajeros.pagina({ buscar: buscar.trim() || undefined, tipo: tipoFiltro || undefined }, pagina, porPagina).then((r: PaginaPersonal) => ({ ...r, filas: (r.mensajeros ?? []).map(aPersona) }))
  });
  const pag = qPer.data, lista = Array.isArray(pag?.filas) ? pag.filas : [];
  const ir = (n: number) => { E.paginaPersonal = n; setPagina(n); arribaPer.current?.scrollIntoView({ block: "start", behavior: "smooth" }); };
  const fallo = (e: unknown) => v.avisar("No se pudo guardar: " + motivoError(e));
  const liberar = async (id: string) => {
    if (!await v.confirmar("Liberar a " + S.mensajeros[id].nombre, "Se desvincula de la cuenta actual. La próxima persona que elija este nombre quedará vinculada.", "Liberar")) return;
    try { for (const x of vinculosDe(id)) await cambiarAcceso(x.uid, { mensajeroId: null }); v.avisar("Nombre liberado"); } catch (e) { v.avisar("No se pudo liberar: " + motivoError(e)); }
  };
  const quitar = async (id: string) => {
    if (!await v.confirmar("Quitar a " + S.mensajeros[id].nombre, "Ya no aparecerá en la lista de personal. Sus pedidos, pagos y movimientos anteriores se conservan.", "Quitar")) return;
    try { await quitarPersona(id); if (E.miMensajero === id) { E.miMensajero = ""; guardarLocal("js_mensajero", ""); } v.avisar("Persona quitada"); } catch (e) { v.avisar("No se pudo quitar: " + motivoError(e)); }
  };
  return <>
    <h1>Personal</h1><p className="sub">Mensajeros y el dueño entregan pedidos desde la app. Patinadores y la empresa (JS) solo aparecen en Sueldos. Cuando un mensajero elige su nombre por primera vez, queda vinculado a su cuenta; “Liberar” le permite elegir de nuevo (por ejemplo, si cambió de celular o de cuenta).</p>
    <div className="cab-personal">
      <div className="seg subtabs" role="tablist" aria-label="Secciones de Personal">
        <button type="button" role="tab" id="tabPer-personal" aria-selected={tab === "personal"} aria-controls="panelPer-personal" onClick={() => setTab("personal")}>Personal JS</button>
        <button type="button" role="tab" id="tabPer-acceso" aria-selected={tab === "acceso"} aria-controls="panelPer-acceso" onClick={() => setTab("acceso")}>Acceso</button>
      </div>
      {tab === "personal"
        ? <button type="button" className="btn agregar" onClick={() => setModalPersonal(true)}>+ Agregar personal</button>
        : yo.esAdmin ? <button type="button" className="btn agregar" onClick={() => setModalAcceso(true)}>+ Dar acceso</button> : null}
    </div>

    {tab === "personal" ? <div role="tabpanel" id="panelPer-personal" aria-labelledby="tabPer-personal">
      <div className="lista-toolbar">
        <label className="lista-buscar">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="M20 20l-3.5-3.5" /></svg>
          <input type="search" placeholder="Buscar por nombre o teléfono…" aria-label="Buscar por nombre o teléfono" value={texto} onChange={e => alBuscar(e.target.value)} />
        </label>
        <select className="lista-filtro" aria-label="Filtrar por tipo" value={tipoFiltro} onChange={e => alTipo(e.target.value as "" | TipoPersonal)}>
          <option value="">Todos los tipos</option>
          {Object.entries(TIPOS).map(([k, t]) => <option key={k} value={k}>{t}</option>)}
        </select>
      </div>
      <h2>{pag?.total ?? 0} {(pag?.total ?? 0) === 1 ? "registrado" : "registrados"}{hayFiltros ? ` de ${ms.length}` : ""}</h2>
      <div ref={arribaPer} style={{ scrollMarginTop: 90 }} />
      {qPer.isError ? <div className="aviso alerta">No se pudo traer el personal: {motivoError(qPer.error)} <button className="btn chico" onClick={() => qPer.refetch()}>Intentar otra vez</button></div>
        : !pag ? <div className="vacio">Cargando personal…</div>
        : lista.length ? <>
        <div className="tabla-env con-acciones tabla-marco" aria-busy={qPer.isFetching} style={qPer.isPlaceholderData ? { opacity: .6 } : undefined}><table className="tabla-personal"><thead><tr><th className="per-nombre">Nombre</th><th className="per-tel">Teléfono</th><th className="per-tipo">Tipo</th><th className="per-pago">Pago por día</th><th className="per-cuenta">Estado / Cuenta</th><th className="per-acciones">Acciones</th></tr></thead><tbody>
        {lista.map(m => { const vs = vinculosDe(m.id); return <tr key={m.id}><td className="per-nombre"><b>{m.nombre}</b></td><td className="per-tel">{m.telefono || ""}</td>
          <td className="per-tipo"><select aria-label={"Tipo de " + m.nombre} value={tipoDe(m)} onChange={async e => { try { await guardarPersona(m.id, { tipo: e.target.value as TipoPersonal }); v.avisar("Tipo actualizado"); } catch (er) { fallo(er); } }}>{Object.entries(TIPOS).map(([k, t]) => <option key={k} value={k}>{t}</option>)}</select></td>
          <td className="per-pago">{["patinador", "oficina"].includes(tipoDe(m)) ? <input type="number" step="1000" min="0" defaultValue={Number(m.tarifa) || ""} style={{ width: 110 }} aria-label={"Pago por día de " + m.nombre} onChange={async e => { try { await guardarPersona(m.id, { tarifa: Number(e.target.value) || 0 }); v.avisar("Pago por día actualizado"); } catch (er) { fallo(er); } }} /> : "—"}</td>
          <td className="per-cuenta">{!esRepartidor(m) ? "—" : vs.length ? <span className="etq ent">Vinculado{vs.length > 1 ? " ×" + vs.length : ""}</span> : <span className="sub">Sin vincular</span>}</td>
          <td className="per-acciones"><div className="acciones-celda">
            <span className="accion-icono editar">
              <button type="button" onClick={() => setEditando(m)} aria-label="Editar personal"><IconoEditar /></button>
              <span className="accion-tip" role="tooltip"><i /><span>Editar personal</span></span>
            </span>
            {esRepartidor(m) && vs.length ? <span className="accion-icono ambar">
              <button type="button" onClick={() => liberar(m.id)} aria-label="Liberar cuenta"><IconoLiberar /></button>
              <span className="accion-tip" role="tooltip"><i /><span>Liberar cuenta</span></span>
            </span> : null}
            <span className="accion-icono peligro">
              <button type="button" onClick={() => quitar(m.id)} aria-label="Quitar de personal"><IconoQuitarUsuario /></button>
              <span className="accion-tip" role="tooltip"><i /><span>Quitar de personal</span></span>
            </span>
          </div></td></tr>; })}
      </tbody></table></div>
        <Paginador pagina={pag.pagina} paginas={pag.paginas} total={pag.total} porPagina={pag.porPagina} ir={ir} cargando={qPer.isPlaceholderData} />
        </> : <div className="vacio">{hayFiltros ? "No hay personal con esos filtros." : "Agrega a tu personal para empezar."}</div>}
      {modalPersonal ? <ModalPersonal alCerrar={() => setModalPersonal(false)} /> : null}
      {editando ? <ModalPersonal persona={editando} alCerrar={() => setEditando(null)} /> : null}
    </div> : <div role="tabpanel" id="panelPer-acceso" aria-labelledby="tabPer-acceso">
      {yo.esAdmin ? <Accesos modalAbierto={modalAcceso} alCerrar={() => setModalAcceso(false)} /> : <div className="vacio">Los accesos los maneja administración.</div>}
    </div>}
  </>;
}

/** Agregar o editar una persona del personal (patinador, oficina, mensajero…). */
function ModalPersonal({ alCerrar, persona, nombreInicial, tipoInicial, alGuardar }: { alCerrar: () => void; persona?: Persona; nombreInicial?: string; tipoInicial?: TipoPersonal; alGuardar?: (id: string) => void }) {
  const v = useVentana();
  const [f, setF] = useState({ nombre: persona?.nombre || nombreInicial || "", tel: persona?.telefono || "", tipo: (persona ? tipoDe(persona) : tipoInicial || "mensajero") as TipoPersonal, tarifa: persona ? String(Number(persona.tarifa) || 0) : "70000" });
  const [guardando, setGuardando] = useState(false);
  const guardar = async (e: React.FormEvent) => {
    e.preventDefault();
    const n = f.nombre.trim();
    if (!n) return v.avisar("Escribe el nombre");
    setGuardando(true);
    try {
      const id = await guardarPersona(persona ? persona.id : null, { nombre: n, telefono: f.tel.trim(), tipo: f.tipo, tarifa: Number(f.tarifa) || 0 });
      v.avisar(persona ? "Cambios guardados" : n + " agregado");
      if (alGuardar) alGuardar(id); else alCerrar();
    }
    catch (er) { setGuardando(false); v.avisar("No se pudo guardar: " + motivoError(er)); }
  };
  return <Modal titulo={persona ? "Editar personal" : "Agregar personal"} sub={persona ? "Cambia el nombre, el teléfono, el tipo o el pago por día. Los cambios se aplican de inmediato." : "Los mensajeros y el dueño entregan pedidos desde la app; patinadores y la empresa (JS) solo aparecen en Sueldos."} alCerrar={alCerrar} compacto>
    <form onSubmit={guardar}>
      <div className="form-col">
        <div className="campo"><label htmlFor="mNom">Nombre</label><input id="mNom" autoFocus value={f.nombre} onChange={e => setF({ ...f, nombre: e.target.value })} /></div>
        <div className="campo"><label htmlFor="mTel">Teléfono</label><input id="mTel" inputMode="tel" value={f.tel} onChange={e => setF({ ...f, tel: e.target.value })} /></div>
        <div className="campo"><label htmlFor="mTipoP">Tipo</label><select id="mTipoP" value={f.tipo} onChange={e => setF({ ...f, tipo: e.target.value as TipoPersonal })}>{Object.entries(TIPOS).map(([k, t]) => <option key={k} value={k}>{t}</option>)}</select></div>
        <div className="campo"><label htmlFor="mTar">Pago por día (patinadores y oficina)</label><input id="mTar" type="number" inputMode="numeric" step="1000" min="0" placeholder="70000" value={f.tarifa} onChange={e => setF({ ...f, tarifa: e.target.value })} /></div>
      </div>
      <div className="modal-acciones"><button type="button" className="btn sec" onClick={alCerrar}>Cancelar</button><button type="submit" className="btn" disabled={guardando}>{persona ? "Guardar cambios" : "Agregar"}</button></div>
    </form>
  </Modal>;
}

const ROLES_EQUIPO = Object.entries(ROLES).filter(([k]) => k !== "cliente");
const ROLES_AYUDA = "Mensajero: solo sus pedidos, su caja y su sueldo. Asistente: trabaja en Oficina (pedidos, clientes, saldos y recibos); no ve caja, sueldos ni personal. Cliente: solo ve sus pedidos, sus pruebas de entrega y su saldo, sin editar nada. Administración: todo.";
const ROLES_CALLOUT = <div className="modal-ayuda">
  <p><b>Mensajero:</b> solo sus pedidos, su caja y su sueldo.</p>
  <p><b>Asistente:</b> trabaja en Oficina (pedidos, clientes, saldos y recibos); no ve caja, sueldos ni personal.</p>
  <p><b>Cliente:</b> solo ve sus pedidos, sus pruebas de entrega y su saldo, sin editar nada.</p>
  <p><b>Administración:</b> todo.</p>
</div>;

/** Una página de accesos en memoria (modo demo). */
type PaginaAccesosUI = { usuarios: UsuarioS[]; pagina: number; porPagina: number; total: number; paginas: number };
function paginaAccesosDemo(f: { buscar: string; rol: string }, pagina: number, porPagina: number): PaginaAccesosUI {
  const q = sinTildes(f.buscar.trim());
  const lista = listaOrdenada(S.usuarios, "nombre")
    .filter(u => !f.rol || u.rol === f.rol)
    .filter(u => !q || sinTildes(u.nombre + " " + u.email).includes(q));
  const paginas = Math.max(1, Math.ceil(lista.length / porPagina));
  const actual = Math.min(Math.max(1, pagina), paginas);
  return { usuarios: lista.slice((actual - 1) * porPagina, actual * porPagina), pagina: actual, porPagina, total: lista.length, paginas };
}

function Accesos({ modalAbierto, alCerrar }: { modalAbierto: boolean; alCerrar: () => void }) {
  const v = useVentana(), reps = listaOrdenada(S.mensajeros, "nombre").filter(esRepartidor);
  // El servidor busca, filtra, cuenta y corta; en demo se imita con los datos en memoria.
  const porPagina = usePorPaginaAccesos(), { version } = useDatos();
  const [pagina, setPagina] = useState(E.paginaAcceso);
  const [texto, setTexto] = useState(""), [buscar, setBuscar] = useState("");
  const [rol, setRol] = useState<"" | Rol>("");
  const tBuscar = useRef<number>(0), arriba = useRef<HTMLDivElement>(null);
  const alBuscar = (x: string) => { setTexto(x); clearTimeout(tBuscar.current); tBuscar.current = window.setTimeout(() => { setBuscar(x); E.paginaAcceso = 1; setPagina(1); }, 300); };
  const alRol = (r: "" | Rol) => { setRol(r); E.paginaAcceso = 1; setPagina(1); };
  const qAcc = useQuery({
    queryKey: ["accesos", buscar, rol, pagina, porPagina, version],
    placeholderData: keepPreviousData,
    queryFn: (): Promise<PaginaAccesosUI> => DEMO
      ? Promise.resolve(paginaAccesosDemo({ buscar, rol }, pagina, porPagina))
      : api.usuarios.pagina({ buscar: buscar.trim() || undefined, rol: rol || undefined }, pagina, porPagina).then(r => ({ ...r, usuarios: r.usuarios.map(aUsuario) }))
  });
  const pag = qAcc.data, us = pag?.usuarios ?? [];
  const [enviando, setEnviando] = useState<string | null>(null);
  // Selección del modal de restablecimiento masivo (no toca la tabla principal).
  const [modalMasivo, setModalMasivo] = useState(false);
  const [selMasivo, setSelMasivo] = useState<string[]>([]);
  const [busMasivo, setBusMasivo] = useState("");
  const [enviandoLote, setEnviandoLote] = useState(false);
  const qMasivo = sinTildes(busMasivo.trim());
  const usuariosMasivo = listaOrdenada(S.usuarios, "nombre").filter(u => !qMasivo
    || sinTildes((u.nombre || "") + " " + (u.email || "") + " " + (S.mensajeros[u.mensajeroId]?.telefono || "")).includes(qMasivo));
  const todosMasivo = usuariosMasivo.length > 0 && usuariosMasivo.every(u => selMasivo.includes(u.email));
  const alternarTodosMasivo = () => setSelMasivo(s => todosMasivo ? s.filter(e => !usuariosMasivo.some(u => u.email === e)) : [...new Set([...s, ...usuariosMasivo.map(u => u.email)])]);
  const alternarMasivo = (email: string) => setSelMasivo(s => s.includes(email) ? s.filter(e => e !== email) : [...s, email]);
  const abrirMasivo = () => { setBusMasivo(""); setSelMasivo([]); setModalMasivo(true); };
  const ir = (n: number) => { E.paginaAcceso = n; setPagina(n); arriba.current?.scrollIntoView({ block: "start", behavior: "smooth" }); };
  const enviarLote = async () => {
    if (!selMasivo.length) return;
    const n = selMasivo.length;
    setEnviandoLote(true);
    try {
      if (DEMO) await new Promise(r => setTimeout(r, 700));
      else await api.usuarios.enviarResetMasivo(selMasivo);
      v.avisar(`Iniciando envío masivo a ${n} usuarios en segundo plano.`);
      setModalMasivo(false); setSelMasivo([]); setBusMasivo("");
    } catch (e) { v.avisar("No se pudo encolar el envío: " + motivoError(e)); }
    finally { setEnviandoLote(false); }
  };
  const enviarReset = async (u: UsuarioS) => {
    setEnviando(u.uid);
    try {
      if (DEMO) await new Promise(r => setTimeout(r, 600)); // en demo se imita lo que tarda el correo
      else await api.usuarios.enviarReset({ usuarioId: u.uid });
      v.avisar("Correo de restablecimiento enviado a " + u.email);
    } catch (e) { v.avisar("No se pudo enviar el correo: " + motivoError(e)); }
    finally { setEnviando(null); }
  };
  const desde = pag?.total ? (pag.pagina - 1) * pag.porPagina + 1 : 0, hasta = pag ? Math.min(pag.total, pag.pagina * pag.porPagina) : 0;
  const cambiarRol = async (uid: string, nuevo: Rol) => {
    const u = S.usuarios[uid];
    if (!await v.confirmar("Cambiar el rol de " + (u?.nombre || u?.email || ""), "Pasará a " + ROLES[nuevo] + ". El cambio se aplica la próxima vez que abra la app.", "Cambiar rol")) return;
    try { await cambiarAcceso(uid, { rol: nuevo }); v.avisar("Rol actualizado"); } catch (e) { v.avisar("No se pudo cambiar el rol: " + motivoError(e)); }
  };
  const vincular = async (uid: string, mid: string) => {
    if (mid && vinculosDe(mid).some(x => x.uid !== uid)) return v.avisar("Ese nombre ya está vinculado a otra cuenta. Cámbialo allá primero.");
    try { await cambiarAcceso(uid, { mensajeroId: mid || null }); v.avisar(mid ? "Vinculado. Se aplica la próxima vez que abra la app." : "Vínculo quitado"); } catch (e) { v.avisar("No se pudo cambiar el vínculo: " + motivoError(e)); }
  };
  const quitar = async (uid: string) => {
    const u = S.usuarios[uid];
    if (!await v.confirmar("Quitar acceso a " + (u?.nombre || u?.email || ""), "Esa cuenta ya no podrá entrar a la app. Sus pedidos y registros anteriores se conservan.", "Quitar acceso")) return;
    try { await quitarAcceso(uid); v.avisar("Acceso quitado"); } catch (e) { v.avisar("No se pudo quitar el acceso: " + motivoError(e)); }
  };
  return <>
    <h2>Accesos a la app</h2>
    <p className="sub">Cada persona entra con su correo y contraseña. Si eliges su nombre de Personal, queda vinculada de una vez. {ROLES_AYUDA}</p>
    <div ref={arriba} style={{ scrollMarginTop: 90 }} />
    <div className="lista-toolbar">
      <label className="lista-buscar">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="M20 20l-3.5-3.5" /></svg>
        <input type="search" placeholder="Buscar por nombre o correo…" aria-label="Buscar por nombre o correo" value={texto} onChange={e => alBuscar(e.target.value)} />
      </label>
      <div className="lista-derecha">
        <select className="lista-filtro" aria-label="Filtrar por rol" value={rol} onChange={e => alRol(e.target.value as "" | Rol)}>
          <option value="">Todos los roles</option>
          <option value="mensajero">Mensajero</option>
          <option value="asistente">Asistente</option>
          <option value="cliente">Cliente</option>
          <option value="admin">Administración</option>
        </select>
        <button type="button" className="btn masivo" onClick={abrirMasivo}><IconoCorreoMasivo /> Restablecimiento masivo</button>
      </div>
    </div>
    {qAcc.isError ? <div className="aviso alerta">No se pudieron traer los accesos: {motivoError(qAcc.error)} <button className="btn chico" onClick={() => qAcc.refetch()}>Intentar otra vez</button></div>
      : !pag ? <div className="vacio">Cargando accesos…</div>
      : us.length ? <>
        <div className="tabla-env con-acciones tabla-marco" style={{ marginTop: 14 }} aria-busy={qAcc.isFetching}><table className="tabla-accesos"><thead><tr><th>Nombre</th><th>Correo</th><th>Rol</th><th>Personal</th><th className="acciones">Acciones</th></tr></thead><tbody>
          {us.map(u => <tr key={u.uid}><td><b>{u.nombre || ""}</b>{u.uid === yo.uid ? <> <span className="etq ent">Tú</span></> : null}{u.status === "pending_activation" ? <> <span className="etq pend">Pendiente</span></> : null}</td><td>{u.email || ""}</td>
            <td>{u.uid === yo.uid || u.rol === "cliente" ? ROLES[u.rol] || u.rol || "" : <select aria-label={"Rol de " + (u.nombre || "")} value={u.rol} onChange={e => cambiarRol(u.uid, e.target.value as Rol)}>{ROLES_EQUIPO.map(([k, t]) => <option key={k} value={k}>{t}</option>)}</select>}</td>
            <td>{u.rol === "cliente" ? "Cliente: " + (S.clientes[u.clienteId]?.nombre || "(no existe)") : <select aria-label={"Nombre en Personal de " + (u.nombre || "")} value={S.vinculos[u.uid]?.mensajeroId || ""} onChange={e => vincular(u.uid, e.target.value)}><option value="">— Ninguno —</option>{reps.map(m => <option key={m.id} value={m.id}>{m.nombre}</option>)}</select>}</td>
            <td className="acciones"><div className="acciones-celda">
              <span className="accion-icono correo">
                <button type="button" onClick={() => enviarReset(u)} disabled={enviando === u.uid} aria-label="Enviar correo de restablecimiento">
                  {enviando === u.uid ? <span className="girando"><IconoCargando /></span> : <IconoCorreo />}
                </button>
                <span className="accion-tip" role="tooltip"><i /><span>Enviar correo de restablecimiento</span></span>
              </span>
              <span className="accion-icono">
                <button type="button" onClick={() => v.abrir(<NuevaClave uid={u.uid} />)} aria-label="Cambiar contraseña"><IconoLlave /></button>
                <span className="accion-tip" role="tooltip"><i /><span>Cambiar contraseña</span></span>
              </span>
              {u.uid !== yo.uid ? <span className="accion-icono peligro">
                <button type="button" onClick={() => quitar(u.uid)} aria-label="Quitar acceso"><IconoQuitarUsuario /></button>
                <span className="accion-tip" role="tooltip"><i /><span>Quitar acceso</span></span>
              </span> : null}
            </div></td></tr>)}
        </tbody></table></div>
        <nav className="accesos-pie" aria-label="Paginación de accesos">
          <span>Mostrando <b>{desde}</b> a <b>{hasta}</b> de <b>{pag.total}</b> {pag.total === 1 ? "acceso" : "accesos"}</span>
          <span className="accesos-pag">
            <button type="button" disabled={pag.pagina <= 1 || qAcc.isPlaceholderData} onClick={() => ir(pag.pagina - 1)}>Anterior</button>
            <span>Página <b>{pag.pagina}</b> de {pag.paginas}</span>
            <button type="button" disabled={pag.pagina >= pag.paginas || qAcc.isPlaceholderData} onClick={() => ir(pag.pagina + 1)}>Siguiente</button>
          </span>
        </nav>
      </> : <div className="vacio">{buscar.trim() || rol ? "No hay accesos con esos filtros." : "Todavía no hay accesos."}</div>}
    {modalAbierto ? <ModalAcceso alCerrar={alCerrar} /> : null}
    {modalMasivo ? <Modal titulo="Envío masivo de restablecimiento" sub="Selecciona los usuarios a los que deseas enviar el correo de recuperación." alCerrar={() => setModalMasivo(false)} ancha>
      <label className="lista-buscar masivo-buscar">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="M20 20l-3.5-3.5" /></svg>
        <input type="search" placeholder="Buscar por nombre, correo o teléfono…" aria-label="Buscar usuario para el envío masivo" value={busMasivo} onChange={e => setBusMasivo(e.target.value)} />
      </label>
      <div className="masivo-master">
        <label><input type="checkbox" className="acceso-check" checked={todosMasivo} onChange={alternarTodosMasivo} /> Seleccionar todos los visibles</label>
        <span>{selMasivo.length} seleccionado{selMasivo.length === 1 ? "" : "s"}</span>
      </div>
      <div className="masivo-lista">
        {usuariosMasivo.length ? usuariosMasivo.map(u => <label key={u.uid} className="masivo-item">
          <span className="masivo-info">
            <input type="checkbox" className="acceso-check" checked={selMasivo.includes(u.email)} onChange={() => alternarMasivo(u.email)} />
            <span><b>{u.nombre || u.email}</b><small>{u.email}</small></span>
          </span>
          <span className="masivo-rol">{ROLES[u.rol] || u.rol}</span>
        </label>) : <div className="vacio">No hay usuarios con esa búsqueda.</div>}
      </div>
      <div className="modal-acciones masivo-pie">
        <button type="button" className="btn sec" onClick={() => setModalMasivo(false)}>Cancelar</button>
        <button type="button" className="btn masivo-enviar" disabled={!selMasivo.length || enviandoLote} onClick={enviarLote}>
          {enviandoLote ? <span className="girando"><IconoCargando /></span> : <IconoEnviar />} Enviar correos ({selMasivo.length})
        </button>
      </div>
    </Modal> : null}
  </>;
}

/** Dar acceso a la app en 3 pasos: rol, persona/cliente y correo (el nombre sale de la ficha). */
function ModalAcceso({ alCerrar }: { alCerrar: () => void }) {
  const v = useVentana();
  const personal = listaOrdenada(S.mensajeros, "nombre"), cs = listaOrdenada(S.clientes, "nombre");
  const [f, setF] = useState({ email: "", rol: "mensajero" as Rol, men: "", cli: "" });
  const [busEnt, setBusEnt] = useState(""), [comboAbierto, setComboAbierto] = useState(false);
  const comboRef = useRef<HTMLDivElement>(null);
  const [creandoPersonal, setCreandoPersonal] = useState(false), [guardando, setGuardando] = useState(false);
  const [creado, setCreado] = useState<{ user: AccesoWhatsApp; correo?: { enviado: boolean; motivo?: string } } | null>(null);
  useEffect(() => {
    const fuera = (e: MouseEvent) => { if (comboRef.current && !comboRef.current.contains(e.target as Node)) setComboAbierto(false); };
    document.addEventListener("mousedown", fuera);
    return () => document.removeEventListener("mousedown", fuera);
  }, []);
  const cliente = f.rol === "cliente";
  const usuarios = Object.values(S.usuarios);
  const entidades = cliente
    ? cs.map(c => ({ id: c.id, nombre: c.nombre, telefono: c.telefono || "", email: usuarios.find(u => u.clienteId === c.id)?.email || "" }))
    : personal.map(m => ({ id: m.id, nombre: m.nombre, telefono: m.telefono || "", email: usuarios.find(u => u.mensajeroId === m.id)?.email || "" }));
  const linkedId = cliente ? f.cli : f.men;
  const linked = entidades.find(e => e.id === linkedId) || null;
  const q = sinTildes(busEnt.trim());
  const filtradas = entidades.filter(e => !q || sinTildes(e.nombre + " " + e.telefono + " " + e.email).includes(q));
  const seleccionar = (e: { id: string; nombre: string; email: string }) => {
    setF(x => ({ ...x, email: e.email, ...(cliente ? { cli: e.id } : { men: e.id }) }));
    setBusEnt(e.nombre); setComboAbierto(false);
  };
  const limpiar = () => { setF({ ...f, men: "", cli: "", email: "" }); setBusEnt(""); setComboAbierto(true); };
  const cambiarRol = (rol: Rol) => { setF({ ...f, rol, men: "", cli: "", email: "" }); setBusEnt(""); setComboAbierto(false); };
  const crearEntidad = () => {
    setComboAbierto(false);
    if (cliente) {
      v.abrir(<FormCliente nombre={busEnt.trim()} alGuardar={cid => {
        const c = S.clientes[cid];
        if (c) seleccionar({ id: c.id, nombre: c.nombre, email: usuarios.find(u => u.clienteId === c.id)?.email || "" });
        v.cerrar();
      }} />, "centrada");
    } else setCreandoPersonal(true);
  };
  const guardar = async (e: React.FormEvent) => {
    e.preventDefault();
    const email = f.email.trim().toLowerCase(), mensajeroId = cliente ? "" : linkedId;
    if (!linkedId) return v.avisar(cliente ? "Elige o crea el cliente" : "Elige o crea la persona en Personal");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return v.avisar("Escribe un correo válido");
    if (mensajeroId && vinculosDe(mensajeroId).length) return v.avisar("Ese nombre ya está vinculado. Libéralo primero en la tabla de Personal.");
    setGuardando(true);
    try { setCreado(await crearAcceso({ email, rol: f.rol, entityId: linkedId })); }
    catch (er) { setGuardando(false); v.avisar("No se pudo crear el acceso: " + motivoError(er)); }
  };
  return <>
  <Modal titulo="Dar acceso" sub={ROLES_CALLOUT} alCerrar={alCerrar} compacto>
    <form onSubmit={guardar} noValidate>
      <div className="aviso acceso-nota"><b>Invitación automática.</b> La cuenta queda pendiente de activación: se enviará un correo con un enlace para que la persona cree su contraseña. No escribas una contraseña aquí.</div>
      <div className="form-col">
        <div className="campo"><label htmlFor="acRol">Rol de acceso</label><select id="acRol" value={f.rol} onChange={e => cambiarRol(e.target.value as Rol)}>{(["mensajero", "asistente", "cliente", "admin"] as Rol[]).map(k => <option key={k} value={k}>{ROLES[k]}</option>)}</select></div>
        <div className="campo">
          <label htmlFor="acEnt">{cliente ? "Vincular con cliente" : "Vincular con Personal JS"}</label>
          <div className="combo-cliente" ref={comboRef}>
            {linked
              ? <div className="combo-chip"><span><b>{linked.nombre}</b><small>{linked.telefono || linked.email || ""}</small></span><button type="button" onClick={limpiar}>Cambiar</button></div>
              : <>
                  <div className="combo-buscar">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="M20 20l-3.5-3.5" /></svg>
                    <input id="acEnt" type="text" autoComplete="off" placeholder={cliente ? "Buscar cliente por nombre o teléfono…" : "Buscar en Personal por nombre o teléfono…"} value={busEnt}
                      onFocus={() => setComboAbierto(true)} onChange={e => { setBusEnt(e.target.value); setComboAbierto(true); }} />
                  </div>
                  {comboAbierto ? <div className="combo-lista" role="listbox">
                    <button type="button" className="combo-opcion crear" onClick={crearEntidad}>
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>
                      Crear {cliente ? "cliente" : "personal"} {q ? `"${busEnt.trim()}"` : "nuevo"}
                    </button>
                    {filtradas.map(e => <button type="button" key={e.id} role="option" aria-selected={false} className="combo-opcion" onClick={() => seleccionar(e)}>{e.nombre}{e.telefono || e.email ? <small>{e.telefono || e.email}</small> : null}</button>)}
                    {!filtradas.length && q ? <span className="combo-vacio">No se encontraron resultados coincidentes.</span> : null}
                    {!filtradas.length && !q ? <span className="combo-vacio">Escribe para buscar.</span> : null}
                  </div> : null}
                </>}
          </div>
        </div>
        <div className="campo"><label htmlFor="acEmail">Correo electrónico (invitación)</label><input id="acEmail" type="email" autoComplete="off" value={f.email} onChange={e => setF({ ...f, email: e.target.value })} placeholder="persona@correo.com" /></div>
      </div>
      <div className="modal-acciones acceso-pie"><button type="submit" className="btn acceso-crear" disabled={!linkedId || !f.email.trim() || guardando}>Crear acceso y enviar invitación</button><button type="button" className="btn sec" onClick={alCerrar}>Cancelar</button></div>
    </form>
  </Modal>
  {creandoPersonal ? <ModalPersonal nombreInicial={busEnt.trim()} tipoInicial={f.rol === "mensajero" ? "mensajero" : f.rol === "asistente" ? "oficina" : "dueno"} alCerrar={() => setCreandoPersonal(false)} alGuardar={mid => { const m = S.mensajeros[mid]; if (m) seleccionar({ id: mid, nombre: m.nombre, email: "" }); setCreandoPersonal(false); }} /> : null}
  {creado ? <ModalWhatsApp datos={creado} alCerrar={alCerrar} /> : null}
  </>;
}

/** Tras crear el acceso: ofrece mandar el enlace de activación por WhatsApp. */
function ModalWhatsApp({ datos, alCerrar }: { datos: { user: AccesoWhatsApp; correo?: { enviado: boolean } }; alCerrar: () => void }) {
  const v = useVentana(), u = datos.user;
  const wa = telWhatsApp(u.telefono), valido = wa.replace(/\D/g, "").length >= 11;
  const mensaje = `Hola *${u.nombre}*, ¡bienvenido/a a JS Logistics! 🚚\n\nSe ha creado tu cuenta de acceso en nuestra plataforma. Por favor, ingresa al siguiente enlace para activar tu cuenta y crear tu contraseña:\n\n🔗 ${u.activationUrl}\n\nSi tienes alguna duda, responde a este mensaje.`;
  const enviar = () => { window.open(`https://wa.me/${wa}?text=${encodeURIComponent(mensaje)}`, "_blank"); alCerrar(); };
  const copiar = async () => {
    try { await navigator.clipboard.writeText(u.activationUrl); v.avisar("Enlace de activación copiado."); }
    catch { v.avisar("No se pudo copiar. Selecciona el enlace y cópialo a mano."); }
  };
  return <div className="modal-fondo wa-fondo" onClick={e => { if (e.target === e.currentTarget) alCerrar(); }}>
    <div className="modal-caja wa-caja" role="dialog" aria-modal="true" aria-label="Enviar activación por WhatsApp">
      <button type="button" className="modal-cerrar" aria-label="Cerrar" onClick={alCerrar}>×</button>
      <div className="wa-icono"><IconoWhatsApp /></div>
      <h2>¡Acceso creado con éxito!</h2>
      <p className="wa-texto">{datos.correo?.enviado === false
        ? <>No se pudo enviar el correo a <b>{u.email}</b>. Puedes enviar el enlace por WhatsApp o copiarlo.</>
        : <>Se envió el correo de invitación a <b>{u.email}</b>.</>} ¿Deseas enviar también el enlace directo de activación por WhatsApp a <b>{u.nombre}</b>{u.telefono ? <> (<b>{u.telefono}</b>)</> : null}?</p>
      {!valido ? <div className="aviso alerta wa-aviso">No hay un número de celular válido registrado. Copia el enlace y envíalo por el medio que prefieras.</div> : null}
      <button type="button" className="btn wa-enviar" disabled={!valido} onClick={enviar}><IconoWhatsApp /> Enviar activación por WhatsApp</button>
      <button type="button" className="btn wa-copiar" onClick={copiar}>Copiar enlace de activación</button>
      <button type="button" className="btn wa-omitir" onClick={alCerrar}>Solo enviar por correo</button>
    </div>
  </div>;
}

/** Administración le pone una contraseña nueva a la cuenta (el servidor no manda correos). */
function NuevaClave({ uid }: { uid: string }) {
  const v = useVentana(), u = S.usuarios[uid], [clave, setClave] = useState("");
  const guardar = async () => { if (clave.length < 6) return v.avisar("La contraseña debe tener al menos 6 caracteres");
    try { await cambiarClaveDe(uid, clave); v.cerrar(); v.avisar("Contraseña cambiada. Entrégasela a " + (u?.nombre || u?.email || "la persona") + "."); } catch (e) { v.avisar("No se pudo cambiar: " + motivoError(e)); } };
  return <>
    <Cab sub={<span className="sub">{u?.email || ""}</span>}><h2>Cambiar contraseña de {u?.nombre || u?.email || ""}</h2></Cab>
    <div className="campo"><label htmlFor="ncClave">Contraseña nueva (mínimo 6)</label><input id="ncClave" type="text" autoComplete="off" autoFocus value={clave} onChange={e => setClave(e.target.value)} /></div>
    <button className="btn" style={{ width: "100%" }} onClick={guardar}>Guardar contraseña</button>
  </>;
}

/* ---------- Historial ---------- */
/** En modo de prueba no hay servidor: se arma con los pedidos inventados. */
const historialDemo = (desde: string): Cambio[] => Object.values(S.pedidos).flatMap(p => [
  { id: p.guia + "c", fecha: new Date(p.creado).toISOString(), quien: S.mensajeros[p.mensajeroId]?.nombre || "", op: "crear", col: "pedidos", docId: p.guia, resumen: "Registró la salida de la guía " + p.guia },
  ...(p.entregado ? [{ id: p.guia + "e", fecha: new Date(p.entregado).toISOString(), quien: S.mensajeros[p.mensajeroId]?.nombre || "", op: "editar", col: "pedidos", docId: p.guia, resumen: (p.estado === "devuelto" ? "Marcó como no entregada la guía " : "Entregó la guía ") + p.guia + (p.destinatario ? " a " + p.destinatario : "") }] : []),
]).filter(e => diaDe(new Date(e.fecha).getTime()) >= desde).sort((a, b) => b.fecha.localeCompare(a.fecha));

/** Historial en memoria para el modo demo, con la misma paginación del servidor. */
function paginaHistorialDemo(desde: string, buscar: string, pagina: number, porPagina: number): PaginaHistorial {
  const q = sinTildes(buscar.trim());
  const lista = historialDemo(desde).filter(e => !q || sinTildes(e.resumen + " " + e.quien).includes(q));
  const paginas = Math.max(1, Math.ceil(lista.length / porPagina));
  const actual = Math.min(Math.max(1, pagina), paginas);
  return { cambios: lista.slice((actual - 1) * porPagina, actual * porPagina), pagina: actual, porPagina, total: lista.length, paginas };
}

function Historial() {
  const [dias, setDias] = useState(7), [texto, setTexto] = useState(""), [buscar, setBuscar] = useState("");
  const [pagina, setPagina] = useState(E.paginaHist);
  const porPagina = usePorPaginaHistorial(), { version } = useDatos();
  const tBuscar = useRef<number>(0), arriba = useRef<HTMLDivElement>(null);
  const desde = moverDia(hoy(), -(dias - 1));
  const ir = (n: number) => { E.paginaHist = n; setPagina(n); arriba.current?.scrollIntoView({ block: "start", behavior: "smooth" }); };
  const cambiarDias = (d: number) => { setDias(d); E.paginaHist = 1; setPagina(1); };
  const alBuscar = (x: string) => { setTexto(x); clearTimeout(tBuscar.current); tBuscar.current = window.setTimeout(() => { setBuscar(x); E.paginaHist = 1; setPagina(1); }, 300); };
  const q = useQuery({
    queryKey: ["historial", desde, buscar, pagina, porPagina, version],
    placeholderData: keepPreviousData,
    queryFn: (): Promise<PaginaHistorial> => DEMO
      ? Promise.resolve(paginaHistorialDemo(desde, buscar, pagina, porPagina))
      : api.historial.pagina(desde, buscar, pagina, porPagina)
  });
  const pag = q.data, lista = pag?.cambios ?? [];
  return <>
    <h1>Historial</h1><p className="sub">Quién hizo qué y cuándo: pedidos, entregas, devoluciones, caja, clientes, sueldos y personal.</p>
    <div className="linea2" style={{ alignItems: "end" }}><div className="campo" style={{ maxWidth: 200 }}><label htmlFor="hDias">Período</label><select id="hDias" value={dias} onChange={e => cambiarDias(Number(e.target.value))}>{[[1, "Hoy"], [7, "Últimos 7 días"], [30, "Últimos 30 días"], [90, "Últimos 90 días"]].map(([k, t]) => <option key={k} value={k}>{t}</option>)}</select></div>
      <div className="campo"><label htmlFor="hBus">Buscar</label><input id="hBus" type="search" value={texto} placeholder="Guía, persona, cliente…" onChange={e => alBuscar(e.target.value)} /></div>
      <div className="campo" style={{ flex: "none", minWidth: 0 }}><button className="btn sec" id="hRec" onClick={() => q.refetch()}>Actualizar</button></div></div>
    <div ref={arriba} style={{ scrollMarginTop: 90 }} />
    {q.isError ? <div className="vacio">No se pudo cargar el historial: {motivoError(q.error)}</div>
      : !pag ? <div className="vacio">Cargando…</div>
      : lista.length ? <>
        <div className="tabla-env" aria-busy={q.isFetching} style={q.isPlaceholderData ? { opacity: .6 } : undefined}><table><thead><tr><th>Fecha</th><th>Quién</th><th>Qué hizo</th></tr></thead><tbody>
          {lista.map(e => <tr key={e.id}><td>{hora(new Date(e.fecha).getTime())}</td><td>{e.quien || "Administración"}</td><td style={{ whiteSpace: "normal", minWidth: 260 }}>{e.resumen}</td></tr>)}
        </tbody></table></div>
        <Paginador pagina={pag.pagina} paginas={pag.paginas} total={pag.total} porPagina={pag.porPagina} ir={ir} cargando={q.isPlaceholderData} />
      </> : <div className="vacio">Sin registros en este período.</div>}
  </>;
}

/* ---------- Papelera ---------- */
const COL_NOM: Record<string, string> = { pedidos: "pedido", clientes: "cliente", movimientos: "movimiento de cliente", recaudos: "entrega de dinero", liquidaciones: "liquidación", cajamovs: "movimiento de caja", caja_movimientos: "movimiento de caja", mensajeros: "personal", jornadas: "día de sueldo", vinculos: "vínculo de cuenta" };
function Papelera() {
  const v = useVentana(), qc = useQueryClient();
  const q = useQuery({ queryKey: ["papelera"], queryFn: () => (DEMO ? Promise.resolve([] as EnPapelera[]) : api.historial.papelera()) });
  const datos = q.data || [];
  const recargar = () => qc.invalidateQueries({ queryKey: ["papelera"] });
  const restaurar = async (x: EnPapelera) => { try { await api.historial.restaurar(x.id); v.avisar("Restaurado"); recargar(); } catch (e) { v.avisar("No se pudo restaurar: " + motivoError(e)); } };
  const borrar = async (x: EnPapelera) => {
    if (!await v.confirmar("Borrar del todo", x.resumen + ". Ya no se podrá recuperar.", "Borrar")) return;
    try { await api.historial.eliminarDefinitivo(x.id); v.avisar("Borrado"); recargar(); } catch (e) { v.avisar("No se pudo borrar: " + motivoError(e)); }
  };
  const vaciar = async () => {
    if (!await v.confirmar("Vaciar la papelera", `Se borran del todo ${datos.length} ${datos.length === 1 ? "elemento" : "elementos"}. Ya no se podrán recuperar.`, "Vaciar")) return;
    try { for (const x of datos) await api.historial.eliminarDefinitivo(x.id); v.avisar("Papelera vacía"); } catch (e) { v.avisar("No se pudo vaciar del todo: " + motivoError(e)); }
    recargar();
  };
  return <>
    <h1>Papelera</h1><p className="sub">Lo que se elimina en la app llega aquí. Puedes restaurarlo tal como estaba, con sus fotos.</p>
    <div className="acciones" style={{ marginBottom: 12 }}><button className="btn sec chico" id="papRec" onClick={() => q.refetch()}>Actualizar</button>{datos.length ? <button className="btn peligro chico" id="papVaciar" onClick={vaciar}>Vaciar papelera</button> : null}</div>
    {q.isLoading ? <div className="vacio">Cargando…</div> : q.isError ? <div className="vacio">No se pudo cargar la papelera: {motivoError(q.error)}</div>
      : datos.length ? <div className="tabla-env"><table><thead><tr><th>Eliminado</th><th>Tipo</th><th>Qué era</th><th></th></tr></thead><tbody>
        {datos.map(x => <tr key={x.id}><td>{hora(new Date(x.fecha).getTime())}</td><td>{COL_NOM[x.col] || x.col}</td><td style={{ whiteSpace: "normal", minWidth: 220 }}>{x.resumen}</td>
          <td><div className="acciones" style={{ margin: 0, flexWrap: "nowrap" }}><button className="btn ok chico" onClick={() => restaurar(x)}>Restaurar</button><button className="btn peligro chico" onClick={() => borrar(x)}>Borrar del todo</button></div></td></tr>)}
      </tbody></table></div> : <div className="vacio">La papelera está vacía.</div>}
  </>;
}

/* ---------- Respaldo ---------- */
/* La copia en Excel y la medición de espacio eran de Firebase. En el sistema nuevo la base está en Supabase, que hace sus propias copias. */
function Respaldo() {
  return <>
    <h1>Respaldo y espacio</h1>
    <h2>Copia de seguridad</h2>
    <p className="sub">La base de datos ahora está en Supabase, que guarda copias automáticas todos los días. La descarga de la copia completa en Excel llega en una próxima versión.</p>
    <div className="aviso">Mientras tanto, si necesitas una copia, pídesela a quien administra el sistema.</div>
    <h2>Espacio de las fotos</h2>
    <p className="sub">Las fotos y firmas se guardan aparte de los datos (Supabase Storage), así que ya no llenan la base de datos. El borrado automático de fotos viejas está diseñado y llega en una próxima versión.</p>
  </>;
}
