/* Oficina → Más: Resultados, Personal (con accesos), Historial, Papelera y Respaldo, igual al prototipo. */
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  S, yo, hoy, hora, pesos, diaDe, moverDia, fechaLarga, cerrado, servicio, totales, sueldosDia, saldoCliente, nombreCliente, listaOrdenada, tipoDe, esRepartidor, vinculosDe,
  SUBMAS, TIPOS, ROLES, type TipoPersonal,
} from "../motor";
import { Cab, useVentana } from "../ui";
import { E, guardarLocal } from "../estado";
import { cambiarAcceso, cambiarClaveDe, crearAcceso, guardarPersona, quitarAcceso, quitarPersona } from "../acciones";
import { motivoError } from "../datos";
import { DEMO } from "../demo";
import { useEscritorio } from "../../lib/pantalla";
import * as api from "../../api/servicios";
import type { Cambio, EnPapelera, Rol } from "../../api/tipos";

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
function Personal() {
  const v = useVentana();
  const ms = listaOrdenada(S.mensajeros, "nombre").sort((a, b) => Object.keys(TIPOS).indexOf(tipoDe(a)) - Object.keys(TIPOS).indexOf(tipoDe(b)));
  const [f, setF] = useState({ nombre: "", tel: "", tipo: "mensajero" as TipoPersonal, tarifa: "" });
  const fallo = (e: unknown) => v.avisar("No se pudo guardar: " + motivoError(e));
  const agregar = async () => { const n = f.nombre.trim(); if (!n) return v.avisar("Escribe el nombre");
    try { await guardarPersona(null, { nombre: n, telefono: f.tel.trim(), tipo: f.tipo, tarifa: Number(f.tarifa) || 0 }); v.avisar(n + " agregado"); setF({ nombre: "", tel: "", tipo: "mensajero", tarifa: "" }); } catch (e) { fallo(e); } };
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
    <div className="linea2"><div className="campo"><label htmlFor="mNom">Nombre</label><input id="mNom" value={f.nombre} onChange={e => setF({ ...f, nombre: e.target.value })} /></div><div className="campo"><label htmlFor="mTel">Teléfono</label><input id="mTel" inputMode="tel" value={f.tel} onChange={e => setF({ ...f, tel: e.target.value })} /></div></div>
    <div className="linea2"><div className="campo"><label htmlFor="mTipoP">Tipo</label><select id="mTipoP" value={f.tipo} onChange={e => setF({ ...f, tipo: e.target.value as TipoPersonal })}>{Object.entries(TIPOS).map(([k, t]) => <option key={k} value={k}>{t}</option>)}</select></div>
      <div className="campo"><label htmlFor="mTar">Pago por día (patinadores y oficina)</label><input id="mTar" type="number" inputMode="numeric" step="1000" min="0" placeholder="70000" value={f.tarifa} onChange={e => setF({ ...f, tarifa: e.target.value })} /></div></div>
    <button className="btn" id="mAdd" onClick={agregar}>Agregar</button>
    <h2>{ms.length} {ms.length === 1 ? "registrado" : "registrados"}</h2>
    {ms.length ? <div className="tabla-env"><table><thead><tr><th>Nombre</th><th>Teléfono</th><th>Tipo</th><th className="n">Pago por día</th><th>Cuenta</th><th></th></tr></thead><tbody>
      {ms.map(m => { const vs = vinculosDe(m.id); return <tr key={m.id}><td><b>{m.nombre}</b></td><td>{m.telefono || ""}</td>
        <td><select aria-label={"Tipo de " + m.nombre} value={tipoDe(m)} onChange={async e => { try { await guardarPersona(m.id, { tipo: e.target.value as TipoPersonal }); v.avisar("Tipo actualizado"); } catch (er) { fallo(er); } }}>{Object.entries(TIPOS).map(([k, t]) => <option key={k} value={k}>{t}</option>)}</select></td>
        <td className="n">{["patinador", "oficina"].includes(tipoDe(m)) ? <input type="number" step="1000" min="0" defaultValue={Number(m.tarifa) || ""} style={{ width: 110 }} aria-label={"Pago por día de " + m.nombre} onChange={async e => { try { await guardarPersona(m.id, { tarifa: Number(e.target.value) || 0 }); v.avisar("Pago por día actualizado"); } catch (er) { fallo(er); } }} /> : "—"}</td>
        <td>{!esRepartidor(m) ? "—" : vs.length ? <><span className="etq ent">Vinculado{vs.length > 1 ? " ×" + vs.length : ""}</span> <button className="btn sec chico" onClick={() => liberar(m.id)}>Liberar</button></> : <span className="sub">Sin vincular</span>}</td>
        <td><button className="btn peligro chico" onClick={() => quitar(m.id)}>Quitar</button></td></tr>; })}
    </tbody></table></div> : <div className="vacio">Agrega a tu personal para empezar.</div>}
    {yo.esAdmin && <Accesos />}
  </>;
}

const ROLES_EQUIPO = Object.entries(ROLES).filter(([k]) => k !== "cliente");
const ROLES_AYUDA = "Mensajero: solo sus pedidos, su caja y su sueldo. Asistente: trabaja en Oficina (pedidos, clientes, saldos y recibos); no ve caja, sueldos ni personal. Cliente: solo ve sus pedidos, sus pruebas de entrega y su saldo, sin editar nada. Administración: todo.";
function Accesos() {
  const v = useVentana(), us = listaOrdenada(S.usuarios, "nombre"), reps = listaOrdenada(S.mensajeros, "nombre").filter(esRepartidor);
  const [f, setF] = useState({ nombre: "", email: "", clave: "", rol: "mensajero" as Rol, men: "", cli: "" }), [creando, setCreando] = useState(false);
  const cliente = f.rol === "cliente";
  const crear = async () => {
    const nombre = f.nombre.trim(), email = f.email.trim().toLowerCase(), clienteId = cliente ? f.cli : "", mensajeroId = cliente ? "" : f.men;
    if (!nombre || !email) return v.avisar("Escribe el nombre y el correo"); if (f.clave.length < 6) return v.avisar("La contraseña debe tener al menos 6 caracteres");
    if (cliente && !clienteId) return v.avisar("Elige a qué cliente corresponde este acceso");
    if (mensajeroId && vinculosDe(mensajeroId).length) return v.avisar("Ese nombre ya está vinculado. Libéralo primero en la tabla de arriba.");
    setCreando(true);
    try { await crearAcceso({ email, clave: f.clave, nombre, rol: f.rol, mensajeroId, clienteId }); v.avisar("Acceso creado. Entrega a " + nombre + " su correo y contraseña."); setF({ nombre: "", email: "", clave: "", rol: "mensajero", men: "", cli: "" }); }
    catch (e) { v.avisar("No se pudo crear el acceso: " + motivoError(e)); }
    setCreando(false);
  };
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
    <div className="linea2"><div className="campo"><label htmlFor="acNom">Nombre</label><input id="acNom" value={f.nombre} onChange={e => setF({ ...f, nombre: e.target.value })} /></div><div className="campo"><label htmlFor="acEmail">Correo</label><input id="acEmail" type="email" autoComplete="off" value={f.email} onChange={e => setF({ ...f, email: e.target.value })} /></div></div>
    <div className="linea2"><div className="campo"><label htmlFor="acClave">Contraseña inicial (mínimo 6)</label><input id="acClave" type="text" autoComplete="off" minLength={6} value={f.clave} onChange={e => setF({ ...f, clave: e.target.value })} /></div>
      <div className="campo"><label htmlFor="acRol">Rol</label><select id="acRol" value={f.rol} onChange={e => setF({ ...f, rol: e.target.value as Rol })}>{Object.entries(ROLES).map(([k, t]) => <option key={k} value={k}>{t}</option>)}</select></div>
      <div className={"campo " + (cliente ? "oculto" : "")} id="acMenC"><label htmlFor="acMen">Nombre en Personal</label><select id="acMen" value={f.men} onChange={e => setF({ ...f, men: e.target.value, nombre: f.nombre || S.mensajeros[e.target.value]?.nombre || "" })}><option value="">— Ninguno —</option>{reps.map(m => <option key={m.id} value={m.id}>{m.nombre}</option>)}</select></div>
      <div className={"campo " + (cliente ? "" : "oculto")} id="acCliC"><label htmlFor="acCli">Cliente</label><select id="acCli" value={f.cli} onChange={e => setF({ ...f, cli: e.target.value, nombre: f.nombre || S.clientes[e.target.value]?.nombre || "" })}><option value="">Elige…</option>{listaOrdenada(S.clientes, "nombre").map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}</select></div></div>
    <button className="btn" id="acCrear" disabled={creando} onClick={crear}>Crear acceso</button>
    {us.length ? <div className="tabla-env" style={{ marginTop: 14 }}><table><thead><tr><th>Nombre</th><th>Correo</th><th>Rol</th><th>Personal</th><th></th></tr></thead><tbody>
      {us.map(u => <tr key={u.uid}><td><b>{u.nombre || ""}</b>{u.uid === yo.uid ? <> <span className="etq ent">Tú</span></> : null}</td><td>{u.email || ""}</td>
        <td>{u.uid === yo.uid || u.rol === "cliente" ? ROLES[u.rol] || u.rol || "" : <select aria-label={"Rol de " + (u.nombre || "")} value={u.rol} onChange={e => cambiarRol(u.uid, e.target.value as Rol)}>{ROLES_EQUIPO.map(([k, t]) => <option key={k} value={k}>{t}</option>)}</select>}</td>
        <td>{u.rol === "cliente" ? "Cliente: " + (S.clientes[u.clienteId]?.nombre || "(no existe)") : <select aria-label={"Nombre en Personal de " + (u.nombre || "")} value={S.vinculos[u.uid]?.mensajeroId || ""} onChange={e => vincular(u.uid, e.target.value)}><option value="">— Ninguno —</option>{reps.map(m => <option key={m.id} value={m.id}>{m.nombre}</option>)}</select>}</td>
        <td><button className="btn sec chico" onClick={() => v.abrir(<NuevaClave uid={u.uid} />)}>Cambiar contraseña</button>{u.uid !== yo.uid ? <> <button className="btn peligro chico" onClick={() => quitar(u.uid)}>Quitar acceso</button></> : null}</td></tr>)}
    </tbody></table></div> : null}
  </>;
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

function Historial() {
  const [dias, setDias] = useState(7), [buscar, setBuscar] = useState("");
  const desde = moverDia(hoy(), -(dias - 1));
  const q = useQuery({ queryKey: ["historial", desde], queryFn: () => (DEMO ? Promise.resolve(historialDemo(desde)) : api.historial.listar(desde)) });
  const b = buscar.toLowerCase(), lista = (q.data || []).filter(e => !b || (e.resumen + " " + e.quien).toLowerCase().includes(b)).slice(0, 600);
  return <>
    <h1>Historial</h1><p className="sub">Quién hizo qué y cuándo: pedidos, entregas, devoluciones, caja, clientes, sueldos y personal.</p>
    <div className="linea2" style={{ alignItems: "end" }}><div className="campo" style={{ maxWidth: 200 }}><label htmlFor="hDias">Período</label><select id="hDias" value={dias} onChange={e => setDias(Number(e.target.value))}>{[[1, "Hoy"], [7, "Últimos 7 días"], [30, "Últimos 30 días"], [90, "Últimos 90 días"]].map(([k, t]) => <option key={k} value={k}>{t}</option>)}</select></div>
      <div className="campo"><label htmlFor="hBus">Buscar</label><input id="hBus" type="search" value={buscar} placeholder="Guía, persona, cliente…" onChange={e => setBuscar(e.target.value)} /></div>
      <div className="campo" style={{ flex: "none", minWidth: 0 }}><button className="btn sec" id="hRec" onClick={() => q.refetch()}>Actualizar</button></div></div>
    {q.isLoading ? <div className="vacio">Cargando…</div> : q.isError ? <div className="vacio">No se pudo cargar el historial: {motivoError(q.error)}</div>
      : lista.length ? <div className="tabla-env"><table><thead><tr><th>Fecha</th><th>Quién</th><th>Qué hizo</th></tr></thead><tbody>
        {lista.map(e => <tr key={e.id}><td>{hora(new Date(e.fecha).getTime())}</td><td>{e.quien || "Administración"}</td><td style={{ whiteSpace: "normal", minWidth: 260 }}>{e.resumen}</td></tr>)}
      </tbody></table></div> : <div className="vacio">Sin registros en este período.</div>}
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
