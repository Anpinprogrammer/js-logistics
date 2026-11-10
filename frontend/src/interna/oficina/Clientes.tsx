/* Oficina → Clientes, la cuenta de un cliente, el formulario y el envío de saldos por WhatsApp, igual al prototipo. */
import { useRef, useState } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import {
  S, yo, hoy, hora, pesos, diaDe, listaOrdenada, saldoCliente, filasCuenta, sinTildes, normNom, normTel, parecidos, gruposRepetidos, telWhatsApp, linkSaldo, textoSaldo,
  nombreCliente, servicio, gastoDe, cargoEnvio, cambiaLoContado, yaContado, mueveCaja, esPago, fechaCaja, fechaDia, diaMinCaja, fechaLarga,
  MOVS, MOVS_OFICINA, MEDIOS, type Medio, type TipoMov,
} from "../motor";
import { Cab, FiltroDia, IconoWhatsApp, Paginador, pl, useVentana } from "../ui";
import { E, guardarLocal } from "../estado";
import { actualizarPedido, borrarDe, guardarCliente, guardarMovimiento, unirClientes } from "../acciones";
import { motivoError, useDatos } from "../datos";
import { DEMO } from "../demo";
import { clientes as apiClientes } from "../../api/servicios";
import { usePorPagina } from "../../lib/pantalla";
import type { ClienteConSaldo, PaginaClientes } from "../../api/tipos";
import { avisoContado } from "./Pedidos";

type Ventana = ReturnType<typeof useVentana>;
/** La caja ya se contó ese día: no se registran movimientos de días anteriores al arqueo. */
export const diaAntesDelArqueo = (v: Ventana, dia: string) => { const m = diaMinCaja(); if (m && dia < m) { v.avisar("La caja ya se contó el " + fechaLarga(m) + ": no se pueden registrar movimientos de días anteriores."); return true; } return false; };

/** La misma página que arma el servidor, calculada con los datos en memoria (modo demo). */
function paginaClientesDemo(filtro: string, dia: string, buscar: string, pagina: number, porPagina: number): PaginaClientes {
  const cs: ClienteConSaldo[] = listaOrdenada(S.clientes, "nombre").map(c => ({
    ...c,
    saldo: saldoCliente(c.id),
    ...(dia ? { delDia: filasCuenta(c.id).filter(r => diaDe(r.fecha) === dia).reduce((a, r) => a + r.v, 0) } : {})
  }));
  const k = (c: ClienteConSaldo) => (dia ? c.delDia ?? 0 : c.saldo);
  const cobrar = cs.filter(c => k(c) < 0), pagar = cs.filter(c => k(c) > 0);
  const q = sinTildes(buscar.trim()), qt = buscar.replace(/\D/g, "");
  const pasa = (c: ClienteConSaldo) => {
    const bus = sinTildes(c.nombre) + " " + normTel(c.telefono);
    return !q || bus.includes(q) || (qt.length >= 3 && bus.includes(qt));
  };
  const base = filtro === "cobrar" ? cobrar : filtro === "pagar" ? pagar : dia ? cs.filter(c => c.delDia) : cs;
  const filtrados = base.filter(pasa);
  const total = filtrados.length, paginas = Math.max(1, Math.ceil(total / porPagina)), actual = Math.min(Math.max(1, pagina), paginas);
  return {
    clientes: filtrados.slice((actual - 1) * porPagina, actual * porPagina),
    pagina: actual, porPagina, total, paginas, totalClientes: cs.length,
    porCobrar: { total: cobrar.reduce((a, c) => a - k(c), 0), clientes: cobrar.length },
    porPagar: { total: pagar.reduce((a, c) => a + k(c), 0), clientes: pagar.length },
    repetidos: yo.esAdmin ? gruposRepetidos().length : undefined
  };
}

export default function Clientes({ pintar }: { pintar: () => void }) {
  const v = useVentana();
  const { version } = useDatos();
  const porPagina = usePorPagina();
  const [buscar, setBuscar] = useState(E.buscarCli);
  const tBuscar = useRef<number>(0);
  const arriba = useRef<HTMLDivElement>(null);
  const dia = E.diaCliF;

  // La página, el filtro, el día y la búsqueda los resuelve el servidor; en demo se imitan en memoria.
  const q = useQuery({
    queryKey: ["clientes", "pagina", E.filtroCli, dia, E.buscarCli, E.paginaCli, porPagina, version],
    placeholderData: keepPreviousData,
    queryFn: () => DEMO
      ? Promise.resolve(paginaClientesDemo(E.filtroCli, dia, E.buscarCli, E.paginaCli, porPagina))
      : apiClientes.pagina({ filtro: E.filtroCli, dia, buscar: E.buscarCli }, E.paginaCli, porPagina)
  });
  const pag = q.data, filas = pag?.clientes ?? [], reps = pag?.repetidos ?? 0;
  const poner = (cambio: Partial<typeof E>) => { Object.assign(E, cambio); pintar(); };
  const irA = (n: number) => { E.paginaCli = n; pintar(); arriba.current?.scrollIntoView({ block: "start", behavior: "smooth" }); };

  return <>
    <h1>Clientes</h1><p className="sub">Saldo de cada cliente = lo cobrado menos el valor del servicio.</p>
    <div className="cifras" style={{ marginBottom: 12 }}>
      <div className="cifra"><span>{dia ? "Ese día te quedaron debiendo" : "Cuentas por cobrar (te deben)"}</span><b className="neg">{pesos(pag?.porCobrar.total ?? 0)}</b><span>{pag?.porCobrar.clientes ?? 0} {pl(pag?.porCobrar.clientes ?? 0, "cliente")}</span></div>
      <div className="cifra"><span>{dia ? "Ese día les quedaste debiendo" : "Cuentas por pagar (les debes)"}</span><b className="pos">{pesos(pag?.porPagar.total ?? 0)}</b><span>{pag?.porPagar.clientes ?? 0} {pl(pag?.porPagar.clientes ?? 0, "cliente")}</span></div>
    </div>
    <div className="controles">
      <div className="barra-acciones">
        <button className="btn ok" id="waMasivo" onClick={() => v.abrir(<EnvioMasivo tipo0={E.filtroCli === "pagar" ? "pagar" : "cobrar"} />)}><IconoWhatsApp />Enviar saldos por WhatsApp</button>
        <button className="btn" id="nuevoCli" onClick={() => v.abrir(<FormCliente />)}>Registrar cliente</button>
      </div>
      <div className="toolbar">
        <div className="campo" role="search"><input id="buscarCli" type="search" placeholder="Buscar por nombre o número" value={buscar} autoComplete="off" aria-label="Buscar cliente por nombre o número"
          onChange={e => {
            const x = e.target.value;
            setBuscar(x);
            clearTimeout(tBuscar.current);
            tBuscar.current = window.setTimeout(() => poner({ buscarCli: x, paginaCli: 1 }), 300);
          }} /></div>
        <div className="toolbar-filtros">
          <div className="seg" role="group" aria-label="Filtrar por estado de la cuenta">{[["todos", "Todos"], ["cobrar", "Por cobrar"], ["pagar", "Por pagar"]].map(([x, t]) => <button key={x} aria-pressed={E.filtroCli === x} onClick={() => poner({ filtroCli: x, paginaCli: 1 })}>{t}</button>)}</div>
          <FiltroDia compacto d={dia} poner={x => poner({ diaCliF: x, paginaCli: 1 })} />
        </div>
      </div>
    </div>
    {dia && <p className="sub">Clientes con movimiento ese día: lo que les quedó de ese día y, al lado, su saldo total de hoy.</p>}
    {reps > 0 ? <div className="aviso">{reps === 1 ? "Hay 1 cliente que parece repetido" : "Hay " + reps + " clientes que parecen repetidos"} (mismo nombre o mismo número). <button className="btn sec chico" id="cliRep" onClick={() => v.abrir(<Repetidos />)}>Revisar y unir</button></div> : null}
    <div ref={arriba} style={{ scrollMarginTop: 90 }} />
    {q.isError ? <div className="aviso alerta">No se pudo traer la lista de clientes: {motivoError(q.error)} <button className="btn chico" onClick={() => q.refetch()}>Intentar otra vez</button></div>
      : !pag ? <div className="vacio">Cargando clientes…</div>
      : filas.length ? <>
        <div className="tabla-env" aria-busy={q.isFetching} style={q.isPlaceholderData ? { opacity: .6 } : undefined}><table><thead><tr><th>Cliente</th><th>Número</th><th>Cuenta</th>{dia && <th className="n">Ese día</th>}<th className="n">Saldo</th><th></th></tr></thead><tbody>
          {filas.map(c => <tr key={c.id}><td><b>{c.nombre}</b>{Number(c.tarifa) ? <><br /><span className="sub" style={{ fontSize: ".8rem" }}>Domicilio {pesos(c.tarifa)}</span></> : null}</td><td>{c.telefono || ""}</td>
            <td>{c.saldo < 0 ? <span className="etq sin">Por cobrar</span> : c.saldo > 0 ? <span className="etq ent">Por pagar</span> : <span className="sub">Paz y salvo</span>}</td>
            {dia && <td className={"n " + ((c.delDia ?? 0) < 0 ? "neg" : "pos")}>{(c.delDia ?? 0) < 0 ? "Debe " : "A favor "}{pesos(Math.abs(c.delDia ?? 0))}</td>}
            <td className={"n " + (c.saldo < 0 ? "neg" : c.saldo > 0 ? "pos" : "")}>{pesos(Math.abs(c.saldo))}</td><td><button className="btn sec chico" onClick={() => v.abrir(<AbrirCuenta cid={c.id} />)}>Ver cuenta</button></td></tr>)}
        </tbody></table></div>
        <Paginador pagina={pag.pagina} paginas={pag.paginas} total={pag.total} porPagina={pag.porPagina} ir={irA} cargando={q.isPlaceholderData} />
      </>
      : <div className="vacio">{!buscar.trim() && E.filtroCli === "todos" && !dia && pag.totalClientes === 0
        ? "Registra tus clientes (los remitentes) para llevar su saldo."
        : buscar.trim() ? "Ningún cliente con ese nombre o número en esta lista." : "No hay clientes en esta lista."}</div>}
  </>;
}

/** Nuevo cliente o editar uno. Avisa si ya hay otro con el mismo nombre o número. */
export function FormCliente({ id, alGuardar, nombre: nombre0 }: { id?: string; alGuardar?: (cid: string) => void; nombre?: string }) {
  const v = useVentana(), c = id ? S.clientes[id] : undefined;
  const [nombre, setNombre] = useState(c?.nombre || nombre0 || ""), [tel, setTel] = useState(c?.telefono || ""), [tarifa, setTarifa] = useState(String(Number(c?.tarifa) || ""));
  const [aunAsi, setAunAsi] = useState(false), [dups, setDups] = useState<ReturnType<typeof parecidos>>([]);
  const cambio = () => { setAunAsi(false); setDups([]); };
  const exacto = dups.some(x => x.igual);
  const guardar = async () => {
    const n = nombre.trim(), t = tel.trim();
    if (!n) return v.avisar("Escribe el nombre"); if (!t) return v.avisar("Escribe el número");
    const cambiado = !id || normNom(n) !== normNom(c?.nombre || "") || normTel(t) !== normTel(c?.telefono || ""), ds = cambiado ? parecidos(n, t, id) : [];
    if (ds.length && (!aunAsi || ds.some(x => x.igual))) { setDups(ds); if (!ds.some(x => x.igual)) setAunAsi(true); return; }
    try {
      const cid = await guardarCliente(id || null, { nombre: n, telefono: t, tarifa: Number(tarifa) || 0, confirmarRepetido: aunAsi || undefined });
      v.avisar("Cliente " + n + " guardado");
      if (alGuardar) alGuardar(cid); else v.cerrar();
    } catch (e) { v.avisar("No se pudo guardar: " + motivoError(e)); }
  };
  return <>
    <Cab><h2>{id ? "Editar cliente" : "Nuevo cliente"}</h2></Cab>
    <div className="campo"><label htmlFor="cNom">Nombre</label><input id="cNom" autoComplete="off" value={nombre} autoFocus onChange={e => { setNombre(e.target.value); cambio(); }} /></div>
    <div className="campo"><label htmlFor="cTel">Número de celular</label><input id="cTel" type="tel" inputMode="tel" autoComplete="off" value={tel} onChange={e => { setTel(e.target.value); cambio(); }} /></div>
    <div className="campo"><label htmlFor="cTar">Valor del domicilio de este cliente (opcional)</label><input id="cTar" type="number" inputMode="numeric" min="0" step="100" value={tarifa} onChange={e => setTarifa(e.target.value)} placeholder="Se llena solo al asignarle una guía" /></div>
    {dups.length ? <div className="aviso alerta" id="cDup"><b>{exacto ? "Este cliente ya existe" : "Hay un cliente parecido"}:</b>
      {dups.map(x => <div key={x.c.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, marginTop: 6 }}><span>{x.c.nombre} · {x.c.telefono || ""}<br /><span className="sub" style={{ fontSize: ".8rem" }}>{x.igual ? "mismo nombre y número" : x.mismoNom ? "mismo nombre" : "mismo número"}</span></span>
        <button className="btn sec chico" onClick={() => (alGuardar ? alGuardar(x.c.id) : v.abrir(<AbrirCuenta cid={x.c.id} />))}>Usar este</button></div>)}
      <p className="sub" style={{ margin: "6px 0 0" }}>{exacto ? "No se puede crear otro con el mismo nombre y número." : "Si de verdad es otro cliente, toca otra vez “Guardar de todos modos”."}</p></div> : null}
    <button className="btn" id="cGuardar" style={{ width: "100%" }} onClick={guardar}>{aunAsi ? "Guardar de todos modos" : "Guardar cliente"}</button>
  </>;
}

/** Cuenta de un cliente: saldo, WhatsApp, registrar pago o ajuste y sus movimientos (abrirCuenta del prototipo). */
export function AbrirCuenta({ cid }: { cid: string }) {
  useDatos();
  const v = useVentana(), c = S.clientes[cid];
  const s0 = c ? saldoCliente(cid) : 0;
  const tipos = (Object.keys(MOVS) as TipoMov[]).filter(k => yo.esAdmin || MOVS_OFICINA.includes(k));
  const [tipo, setTipo] = useState<TipoMov>(yo.esAdmin ? (s0 < 0 ? "pago_de_cliente" : "pago_a_cliente") : s0 > 0 ? "pago_a_cliente" : tipos[0]);
  const [dia, setDia] = useState(hoy()), [val, setVal] = useState(!yo.esAdmin && s0 === 0 ? "" : String(Math.abs(s0) || "")), [medio, setMedio] = useState<Medio>("efectivo"), [nota, setNota] = useState("");
  if (!c) return null;
  const rows = filasCuenta(cid), pendientes = Object.values(S.pedidos).filter(p => p.clienteId === cid && p.estado === "pendiente").length, s = saldoCliente(cid);
  const marcarEnviado = () => { try { const k = "js_wa_saldos_" + hoy(), e = new Set(JSON.parse(localStorage.getItem(k) || "[]")); e.add(cid); guardarLocal(k, JSON.stringify([...e])); } catch { /* sin almacenamiento */ } };
  const registrar = async () => {
    const valor = Number(val); if (!(valor > 0)) return v.avisar("Escribe un valor mayor a cero");
    const caja = mueveCaja({ tipo }); if (yo.esAdmin && caja && diaAntesDelArqueo(v, dia)) return;
    const fecha = !yo.esAdmin && esPago({ tipo }) ? Date.now() : caja ? fechaCaja(dia) : fechaDia(dia); // el pago que registra el asistente queda con la hora del momento
    try { await guardarMovimiento(null, { clienteId: cid, tipo, valor, medio, nota: nota.trim(), fecha }); v.avisar("Movimiento registrado"); v.abrir(<AbrirCuenta cid={cid} />); }
    catch (e) { v.avisar("No se pudo guardar: " + motivoError(e)); }
  };
  const domi = async (g: string) => {
    const ped = S.pedidos[g]; if (!ped) return;
    if (ped.domiPagado) {
      if (cambiaLoContado(ped, { ...ped, domiPagado: false, domiPagoMedio: "" })) return avisoContado(v);
      if (!await v.confirmar("Desmarcar el pago de " + g, "El pago del domicilio se quita de la caja y vuelve a sumarse al saldo del cliente.", "Desmarcar")) return v.abrir(<AbrirCuenta cid={cid} />);
      try { await actualizarPedido(g, { domiPagado: false, domiPagoMedio: "" }); v.avisar("Guía " + g + " actualizada"); } catch (e) { v.avisar("No se pudo guardar: " + motivoError(e)); }
      return v.abrir(<AbrirCuenta cid={cid} />);
    }
    v.abrir(<PagoDomicilio guia={g} despues={() => v.abrir(<AbrirCuenta cid={cid} />)} />);
  };
  const quitarMov = async (mid: string) => {
    const m = S.movimientos[mid]; if (!m) return;
    if (mueveCaja(m) && yaContado(m.fecha)) return avisoContado(v);
    if (!await v.confirmar("Quitar movimiento", `${MOVS[m.tipo]?.corto || "Movimiento"} · ${pesos(m.valor)}. Se quita de la cuenta del cliente${mueveCaja(m) ? " y de la caja" : ""}.`, "Quitar")) return v.abrir(<AbrirCuenta cid={cid} />);
    try { await borrarDe("movimientos", mid); v.avisar("Movimiento quitado"); } catch (e) { v.avisar("No se pudo quitar: " + motivoError(e)); }
    v.abrir(<AbrirCuenta cid={cid} />);
  };
  return <>
    <Cab sub={<span className="sub">{c.telefono || ""}{pendientes ? ` · ${pendientes} en ruta` : ""}</span>}><h2>{c.nombre}</h2></Cab>
    <div className={"saldo-grande " + (s < 0 ? "neg" : s > 0 ? "pos" : "")}>{pesos(Math.abs(s))}</div>
    <p className="sub">{s > 0 ? "Cuenta por pagar: JS le debe este valor al cliente." : s < 0 ? "Cuenta por cobrar: el cliente le debe este valor a JS." : "Cuenta a paz y salvo."}</p>
    {s ? (telWhatsApp(c.telefono) ? <div className="acciones" style={{ margin: "0 0 6px" }}><a className="btn ok" id="cWa" href={linkSaldo(cid)} target="_blank" rel="noopener" onClick={marcarEnviado}>Enviar {s < 0 ? "cobro" : "saldo a favor"} por WhatsApp</a>
      <button className="btn sec" id="cWaCopiar" type="button" onClick={async () => { try { await navigator.clipboard.writeText(textoSaldo(cid)); v.avisar("Mensaje copiado. Pégalo en WhatsApp."); } catch { v.avisar("No se pudo copiar en este navegador"); } }}>Copiar mensaje</button></div>
      : <div className="aviso">Agrega el celular del cliente para enviarle el saldo por WhatsApp.</div>) : null}
    <h2>{yo.esAdmin ? "Registrar pago o ajuste" : "Registrar pago, compra o ganancia"}</h2>
    <div className="campo"><label htmlFor="mTipo">Tipo</label><select id="mTipo" value={tipo} onChange={e => setTipo(e.target.value as TipoMov)}>{tipos.map(x => <option key={x} value={x}>{MOVS[x].t}</option>)}</select></div>
    <div className="linea2"><div className="campo"><label htmlFor="mFecha">Día</label><input id="mFecha" type="date" value={dia} onChange={e => setDia(e.target.value)} /></div>
      <div className="campo"><label htmlFor="mVal">Valor</label><input id="mVal" type="number" inputMode="numeric" min="0" step="100" value={val} onChange={e => setVal(e.target.value)} /></div></div>
    <div className="linea2"><div className="campo"><label htmlFor="mMedio">Medio (para pagos)</label><select id="mMedio" value={medio} onChange={e => setMedio(e.target.value as Medio)}>{Object.entries(MEDIOS).map(([x, t]) => <option key={x} value={x}>{t}</option>)}</select></div>
      <div className="campo"><label htmlFor="mNota">Nota (opcional)</label><input id="mNota" placeholder="Ej: compra, transferencia Nequi" value={nota} onChange={e => setNota(e.target.value)} /></div></div>
    <div className="acciones"><button className="btn ok" id="mReg" onClick={registrar}>Registrar</button><button className="btn sec" id="cEdit" onClick={() => v.abrir(<FormCliente id={cid} />)}>Editar cliente</button></div>
    <h2>Movimientos</h2>
    {rows.length ? <div className="tabla-env"><table><thead><tr><th>Fecha</th><th>Detalle</th><th className="n">Valor</th><th></th></tr></thead><tbody>
      {rows.map((r, i) => <tr key={(r.pid || r.mid || "") + i}><td>{hora(r.fecha)}</td><td>{r.det}</td><td className={"n " + (r.v < 0 ? "neg" : "pos")}>{pesos(r.v)}</td>
        <td>{r.mid ? (yo.esAdmin ? <button className="btn peligro chico" onClick={() => quitarMov(r.mid!)}>Quitar</button> : null) : r.pid && (r.v < 0 || r.dp) ? <button className="btn sec chico" onClick={() => domi(r.pid!)}>{r.dp ? "Desmarcar pago" : "Ya pagó domicilio"}</button> : null}</td></tr>)}
    </tbody></table></div> : <div className="vacio">Sin movimientos.</div>}
  </>;
}

/** Registrar que el cliente pagó el domicilio de una guía: cómo y cuánto; entra a la caja. */
function PagoDomicilio({ guia, despues }: { guia: string; despues: () => void }) {
  const v = useVentana(), p = S.pedidos[guia];
  const [medio, setMedio] = useState(""), [val, setVal] = useState(String(p ? cargoEnvio(p) || "" : "")), [guardando, setGuardando] = useState(false);
  if (!p) return null;
  const guardar = async () => {
    const valor = Number(val) || 0; if (!medio) return v.avisar("Elige cómo pagó"); if (!(valor > 0)) return v.avisar("Escribe el valor que pagó");
    setGuardando(true);
    try { await actualizarPedido(guia, { domiPagado: true, domiPagoMedio: medio as Medio, domiPagoValor: valor }); v.avisar("Pago de " + pesos(valor) + " registrado"); despues(); }
    catch (e) { setGuardando(false); v.avisar("No se pudo guardar: " + motivoError(e)); }
  };
  return <>
    <Cab sub={<span className="sub guia">{guia}</span>}><h2>Pago del domicilio</h2></Cab>
    <p className="sub">Domicilio {pesos(servicio(p))}{gastoDe(p) ? " + flete " + pesos(gastoDe(p)) : ""}. El valor entra a la caja.</p>
    <div className="linea2"><div className="campo"><label htmlFor="dpMedio">¿Cómo pagó?</label><select id="dpMedio" value={medio} onChange={e => setMedio(e.target.value)}><option value="">Elige…</option>{Object.entries(MEDIOS).map(([k, t]) => <option key={k} value={k}>{t}</option>)}</select></div>
      <div className="campo"><label htmlFor="dpVal">Valor que pagó</label><input id="dpVal" type="number" inputMode="numeric" min="0" step="100" value={val} onChange={e => setVal(e.target.value)} /></div></div>
    <button className="btn ok" id="dpGuardar" style={{ width: "100%" }} disabled={guardando} onClick={guardar}>Registrar pago</button>
  </>;
}

/* Envío en cadena: WhatsApp no permite mandar mensajes solos desde una página, así que se abre un chat tras otro. */
const CLAVE_ENVIADOS = () => "js_wa_saldos_" + hoy();
const enviadosHoy = () => { try { return new Set<string>(JSON.parse(localStorage.getItem(CLAVE_ENVIADOS()) || "[]")); } catch { return new Set<string>(); } };
function EnvioMasivo({ tipo0 }: { tipo0: "cobrar" | "pagar" }) {
  const [tipo, setTipo] = useState(tipo0), [, setN] = useState(0);
  const env = enviadosHoy();
  const lista = listaOrdenada(S.clientes, "nombre").map(c => ({ ...c, s: saldoCliente(c.id) })).filter(c => (tipo === "cobrar" ? c.s < 0 : c.s > 0));
  const conTel = lista.filter(c => telWhatsApp(c.telefono)), sinTel = lista.filter(c => !telWhatsApp(c.telefono));
  const pend = conTel.filter(c => !env.has(c.id)), sig = pend[0];
  const tras = (cid: string) => { env.add(cid); guardarLocal(CLAVE_ENVIADOS(), JSON.stringify([...env])); setTimeout(() => setN(x => x + 1), 300); };
  return <>
    <Cab sub={<span className="sub">{conTel.length - pend.length} de {conTel.length} enviados hoy</span>}><h2>Enviar saldos por WhatsApp</h2></Cab>
    <div className="filtros">{([["cobrar", "Clientes que deben"], ["pagar", "Saldos a favor"]] as const).map(([k, t]) => <button key={k} aria-pressed={tipo === k} onClick={() => setTipo(k)}>{t}</button>)}</div>
    <p className="sub">Toca “Enviar al siguiente”: se abre el chat con el mensaje listo; envíalo en WhatsApp y vuelve aquí para el próximo.</p>
    {sig ? <a className="btn ok" id="waSig" style={{ width: "100%" }} href={linkSaldo(sig.id)} target="_blank" rel="noopener" onClick={() => tras(sig.id)}>Enviar al siguiente: {sig.nombre} ({pesos(Math.abs(sig.s))})</a>
      : <div className="vacio">{conTel.length ? "¡Listo! Ya se envió a todos." : "No hay clientes en esta lista."}</div>}
    {conTel.length ? <div className="tabla-env" style={{ marginTop: 12 }}><table><thead><tr><th>Cliente</th><th className="n">Saldo</th><th></th></tr></thead><tbody>
      {conTel.map(c => <tr key={c.id}><td><b>{c.nombre}</b></td><td className={"n " + (c.s < 0 ? "neg" : "pos")}>{pesos(Math.abs(c.s))}</td><td>{env.has(c.id) ? <><span className="etq ent">✓ Enviado</span> </> : null}<a className="btn sec chico" href={linkSaldo(c.id)} target="_blank" rel="noopener" onClick={() => tras(c.id)}>{env.has(c.id) ? "Reenviar" : "Enviar"}</a></td></tr>)}
    </tbody></table></div> : null}
    {sinTel.length ? <div className="aviso" style={{ marginTop: 12 }}>Sin celular registrado: {sinTel.map(c => c.nombre).join(", ")}.</div> : null}
    {env.size ? <div className="acciones"><button className="btn sec chico" id="waReiniciar" onClick={() => { guardarLocal(CLAVE_ENVIADOS(), "[]"); setN(x => x + 1); }}>Volver a empezar la lista de hoy</button></div> : null}
  </>;
}

/** Clientes repetidos (mismo nombre o mismo número). Unirlos lo hace el servidor. */
function Repetidos() {
  const gs = gruposRepetidos(), uso = (id: string) => ({ ped: Object.values(S.pedidos).filter(p => p.clienteId === id).length, mov: Object.values(S.movimientos).filter(m => m.clienteId === id).length, cuenta: Object.values(S.usuarios).some(u => u.clienteId === id) });
  return <>
    <Cab sub={<span className="sub">{gs.length} {pl(gs.length, "grupo")}</span>}><h2>Clientes repetidos</h2></Cab>
    <p className="sub">En cada grupo toca “Quedarse con este” en el que quieres conservar. Los pedidos, pagos y la cuenta de acceso de los otros pasan a ese cliente, el saldo se suma y los repetidos se borran. Si son clientes distintos (por ejemplo, dos tiendas del mismo dueño), no hagas nada.</p>
    {gs.length ? gs.map(g => <div className="mcard" key={g[0].id} style={{ marginBottom: 10 }}>{g.map(c => { const u = uso(c.id), s = saldoCliente(c.id); return (
      <div key={c.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, padding: "6px 0", borderBottom: "1px solid var(--borde,#ddd)" }}>
        <span><b>{c.nombre}</b> · {c.telefono || ""}<br /><span className="sub" style={{ fontSize: ".8rem" }}>{u.ped} {pl(u.ped, "pedido")} · {u.mov} {pl(u.mov, "movimiento")} · {s < 0 ? "debe " + pesos(-s) : s > 0 ? "a favor " + pesos(s) : "paz y salvo"}{u.cuenta ? " · tiene cuenta" : ""}</span></span>
        <BotonUnir k={c.id} otros={g.map(x => x.id).filter(x => x !== c.id)} /></div>); })}</div>) : <div className="vacio">No hay clientes repetidos.</div>}
  </>;
}
function BotonUnir({ k, otros }: { k: string; otros: string[] }) {
  const v = useVentana();
  const unir = async () => {
    if (!await v.confirmar("Unir clientes", `Se queda ${S.clientes[k].nombre} (${S.clientes[k].telefono || ""}). Se le pasa todo de: ${otros.map(o => S.clientes[o].nombre + " (" + (S.clientes[o].telefono || "") + ")").join(", ")}, y esos se borran.`, "Unir")) return v.abrir(<Repetidos />);
    try { await unirClientes(k, otros); v.avisar("Clientes unidos en " + nombreCliente(k)); }
    catch (e) { v.avisar("No se pudo unir: " + motivoError(e)); }
    v.abrir(<Repetidos />);
  };
  return <button className="btn sec chico" onClick={unir}>Quedarse con este</button>;
}
