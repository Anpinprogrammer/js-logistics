/* Oficina → Pedidos, el detalle de una guía y la asignación en bloque, igual al prototipo. */
import { useRef, useState } from "react";
import {
  S, yo, hora, pesos, listaOrdenada, esRepartidor, tipoDe, cambioPendiente, sinServicio, delDia, nombreCliente, sinTildes, cerrado, gastoDe, pagoDomi,
  saldoPedido, metodoTxt, pedidoLiquidado, cambiaLoContado, corteCaja, CUENTAS_JS, METODOS, MEDIOS, MOTIVOS, type Metodo, type Medio, type Motivo, type Pedido,
} from "../motor";
import { Cab, EtqEstado, FiltroDia, FilaPedido, FotosGuia, IconoCamara, pl, useVentana } from "../ui";
import { E } from "../estado";
import { actualizarPedido, cambioEntregado, crearGuias, eliminarPedido, reabrir } from "../acciones";
import { motivoError, useDatos } from "../datos";
import { abrirEntregaEn, DlgDevolucion } from "../mensajero/Entrega";
import { FormCliente } from "./Clientes";
import type { CambiosPedido } from "../../api/servicios";

type Ventana = ReturnType<typeof useVentana>;
export const avisoContado = (v: Ventana) => v.avisar("Eso ya quedó contado en el arqueo del " + hora(corteCaja()) + ". Para corregirlo, registra un movimiento nuevo.");

export default function Pedidos({ pintar }: { pintar: () => void }) {
  const v = useVentana();
  const camara = useRef<HTMLInputElement>(null), galeria = useRef<HTMLInputElement>(null), ofiSel = useRef<HTMLSelectElement>(null);
  const [buscar, setBuscar] = useState(E.buscarA);
  let ps = Object.values(S.pedidos).sort((a, b) => b.creado - a.creado);
  const f = E.filtroA;
  if (f === "sin") ps = ps.filter(p => !p.clienteId);
  else if (f === "pend") ps = ps.filter(p => p.estado === "pendiente");
  else if (f === "ent") ps = ps.filter(p => p.estado === "entregado");
  else if (f === "dev") ps = ps.filter(p => p.estado === "devuelto");
  else if (f === "dif") ps = ps.filter(p => Number(p.difCobro));
  else if (f === "cambio") ps = ps.filter(cambioPendiente);
  else if (f === "serv") ps = ps.filter(sinServicio);
  if (E.buscarA) { const q = E.buscarA.toLowerCase(); ps = ps.filter(p => (p.guia + " " + nombreCliente(p.clienteId) + " " + (p.destinatario || "") + " " + (S.mensajeros[p.mensajeroId]?.nombre || "")).toLowerCase().includes(q)); }
  if (E.mensPedA) ps = ps.filter(p => p.mensajeroId === E.mensPedA);
  if (E.diaPedA) ps = ps.filter(p => delDia(p, E.diaPedA));
  const todos = Object.values(S.pedidos);
  const porEntregar = todos.filter(p => p.estado === "pendiente" && (!E.mensPedA || p.mensajeroId === E.mensPedA)).length;
  const repartidores = listaOrdenada(S.mensajeros, "nombre").filter(m => esRepartidor(m) || m.id === E.mensPedA);
  const ofis = listaOrdenada(S.mensajeros, "nombre").filter(m => tipoDe(m) === "oficina");
  const nCambio = todos.filter(cambioPendiente).length, nServ = todos.filter(sinServicio).length, nDif = todos.filter(p => Number(p.difCobro) && !p.difRevisada).length;
  const poner = (cambio: Partial<typeof E>) => { Object.assign(E, cambio); pintar(); };
  const tBuscar = useRef<number>(0);

  const fotos = async (lista: FileList | null) => {
    const files = [...(lista || [])].filter(x => x.type.startsWith("image/")).slice(0, 30); if (!files.length) return;
    const mid = ofiSel.current?.value || ofis[0]?.id; if (!mid) return;
    try {
      const hechas = await crearGuias(files, mid, v.avisar);
      v.avisar(hechas.length === 1 ? "Guía " + hechas[0] + " creada" : "Se crearon " + hechas.length + " guías");
      if (hechas.length === 1) v.abrir(<AbrirPedido guia={hechas[0]} />);
    } catch (e) { v.avisar("No se pudo crear la guía: " + motivoError(e) + "."); }
  };

  return <>
    <h1>Pedidos</h1><p className="sub">Asigna el remitente, el valor del servicio y el valor a cobrar a cada guía.</p>
    {ofis.length ? <div className="acciones" style={{ margin: "0 0 14px", alignItems: "center" }}>
      <button className="btn" id="fotoOfi" onClick={() => { if (camara.current) { camara.current.value = ""; camara.current.click(); } }}><IconoCamara chico /><span>Tomar foto del pedido</span></button>
      <button className="btn sec" id="galeriaOfi" onClick={() => { if (galeria.current) { galeria.current.value = ""; galeria.current.click(); } }}>Subir fotos (varias)</button>
      {ofis.length > 1 && <select id="ofiSel" ref={ofiSel} aria-label="Oficina encargada">{ofis.map(m => <option key={m.id} value={m.id}>{m.nombre}</option>)}</select>}
      <span className="sub">Queda a cargo de {ofis.length > 1 ? "la oficina elegida" : ofis[0].nombre}; el domicilio es 100% de JS.</span>
      <input type="file" ref={camara} accept="image/*" capture="environment" className="oculto" onChange={e => fotos(e.target.files)} />
      <input type="file" ref={galeria} accept="image/*" multiple className="oculto" onChange={e => fotos(e.target.files)} />
    </div> : <div className="aviso">{yo.esAdmin ? "Para registrar pedidos con foto desde aquí, agrega en Más → Personal una persona de tipo “Oficina (JS)”." : "Para registrar pedidos con foto, el administrador debe crear la Oficina en Personal."}</div>}
    {nCambio && f !== "cambio" ? <div className="aviso">{nCambio === 1 ? "Hay 1 prenda de cambio" : "Hay " + nCambio + " prendas de cambio"} por entregar a los clientes. Míralas en “Cambios por entregar”.</div> : null}
    {nServ && f !== "serv" ? <div className="aviso alerta">{nServ === 1 ? "1 pedido entregado no tiene" : nServ + " pedidos entregados no tienen"} valor de servicio: el saldo del cliente queda mal hasta que lo pongas. <button className="btn chico" onClick={() => poner({ filtroA: "serv", limiteA: 100 })}>Verlos</button></div>
      : f === "serv" ? <div className="aviso">Mostrando los pedidos entregados sin valor de servicio. Ábrelos y ponles el domicilio.</div> : null}
    {nDif ? <div className="aviso alerta">{nDif === 1 ? "1 entrega tiene" : nDif + " entregas tienen"} un valor cobrado distinto al que debían cobrar. Revísalas en “Con diferencia”.</div> : null}
    <div className="filtros">{([["sin", "Sin remitente"], ["pend", "Por entregar", porEntregar], ["ent", "Entregados"], ["dev", "Devueltos"], ["dif", "Con diferencia"], ["cambio", "Cambios por entregar"], ["todos", "Todos"]] as [string, string, number?][])
      .map(([k, t, n]) => <button key={k} aria-pressed={f === k} onClick={() => poner({ filtroA: k, limiteA: 100 })}>{t}{n !== undefined ? <> <span className="num">{n}</span></> : null}</button>)}</div>
    <div className="linea2"><div className="campo" style={{ flex: 2, minWidth: 220 }}><input id="buscar" type="search" placeholder="Buscar guía, remitente, destinatario o mensajero" value={buscar} aria-label="Buscar"
      onChange={e => { const x = e.target.value; setBuscar(x); clearTimeout(tBuscar.current); tBuscar.current = window.setTimeout(() => poner({ buscarA: x }), 300); }} /></div>
      <div className="campo"><select id="mensPed" aria-label="Filtrar por mensajero" value={E.mensPedA} onChange={e => poner({ mensPedA: e.target.value, limiteA: 100 })}><option value="">Todos los mensajeros</option>{repartidores.map(m => <option key={m.id} value={m.id}>{m.nombre}</option>)}</select></div></div>
    {(f === "sin" || f === "serv") && ps.length ? <div className="acciones" style={{ margin: "6px 0" }}><button className="btn" id="enBloque" onClick={() => v.abrir(<EnBloque modo={f} lista={ps} />)}>{f === "sin" ? "Asignar remitente a varios" : "Poner domicilio a varios"} ({ps.length})</button></div> : null}
    <FiltroDia d={E.diaPedA} poner={d => poner({ diaPedA: d, limiteA: 100 })} />
    {E.diaPedA || E.mensPedA ? <p className="sub">{ps.length} {pl(ps.length, "pedido")}{E.mensPedA ? " de " + (S.mensajeros[E.mensPedA]?.nombre || "") : ""}{E.diaPedA ? " que salieron o se cerraron ese día" : ""}</p> : null}
    {ps.length ? <><div className="lista">{ps.slice(0, E.limiteA).map(p => <FilaPedido key={p.guia} p={p} onClick={() => v.abrir(<AbrirPedido guia={p.guia} />)} />)}</div>
      {ps.length > E.limiteA && <div className="acciones" style={{ justifyContent: "center" }}><button className="btn sec" id="masPed" onClick={() => poner({ limiteA: E.limiteA + 200 })}>Ver más ({ps.length - E.limiteA} restantes)</button></div>}</>
      : <div className="vacio">{f === "sin" ? "Todos los pedidos tienen remitente asignado." : f === "serv" ? "Todos los pedidos entregados tienen valor de servicio." : "No hay pedidos aquí."}</div>}
  </>;
}

/** Detalle de una guía para la oficina (abrirPedido del prototipo). */
export function AbrirPedido({ guia, cliElegido }: { guia: string; cliElegido?: string }) {
  useDatos();
  const v = useVentana(), p0 = S.pedidos[guia];
  const cs = listaOrdenada(S.clientes, "nombre");
  const [q, setQ] = useState(""), [cli, setCli] = useState(cliElegido || p0?.clienteId || "");
  const [serv, setServ] = useState(String(Number(p0?.valorServicio) || S.clientes[cliElegido || p0?.clienteId || ""]?.tarifa || ""));
  const [cob, setCob] = useState(String(Number(p0?.aCobrar) || "")), [dev, setDev] = useState(!!p0?.cobrarDev);
  const [valCob, setValCob] = useState(String(Number(p0?.valorCobrado) || 0)), [met, setMet] = useState<Metodo>((p0?.metodo as Metodo) || "efectivo"), [cta, setCta] = useState(p0?.cuentaJs || "");
  const [gasto, setGasto] = useState(String(gastoDe(p0 || ({} as Pedido)) || "")), [gastoNota, setGastoNota] = useState(p0?.gastoNota || "");
  const [domi, setDomi] = useState(!!p0?.domiPagado), [domiMedio, setDomiMedio] = useState<string>(p0?.domiPagoMedio || ""), [domiVal, setDomiVal] = useState(p0?.domiPagado ? String(pagoDomi(p0)) : "");
  const p = S.pedidos[guia]; if (!p) return null;
  const vis = cs.filter(x => !q || sinTildes(x.nombre + " " + (x.telefono || "")).includes(sinTildes(q.trim())));
  const elegirCli = (id: string) => { setCli(id); const t = S.clientes[id]?.tarifa; if (t && !serv) setServ(String(t)); };
  const conCambio = async (fn: () => Promise<void>, ok: string, cerrar = true) => { try { await fn(); v.avisar(ok); if (cerrar) v.cerrar(); else v.abrir(<AbrirPedido guia={guia} />); } catch (e) { v.avisar("No se pudo guardar: " + motivoError(e)); } };

  const guardar = async () => {
    if (!cli) return v.avisar("Elige el remitente");
    const datos: CambiosPedido & { domiPagoMedio?: Medio | "" } = { clienteId: cli, valorServicio: Number(serv) || 0, domiPagado: domi, aCobrar: Number(cob) || 0, gasto: Math.max(0, Number(gasto) || 0), gastoNota: gastoNota.trim() };
    if (domi) {
      const val = Number(domiVal) || 0, antiguo = p.domiPagado && !p.domiPagoMedio;
      if (!domiMedio && !antiguo) return v.avisar("Elige cómo pagó el domicilio"); if (!(val > 0)) return v.avisar("Escribe el valor que pagó");
      Object.assign(datos, { domiPagoMedio: domiMedio as Medio, domiPagoValor: val });
    } else Object.assign(datos, { domiPagoMedio: "" });
    if (p.estado === "devuelto") datos.cobrarDev = dev;
    if (p.estado === "entregado" && (p.metodo === "transf_js" || yo.esAdmin)) datos.cuentaJs = cta as "";
    if (p.estado === "entregado" && yo.esAdmin) { // corrección de lo que cobró el mensajero (solo administración)
      const val = Number(valCob); if (valCob === "" || val < 0) return v.avisar("Escribe el valor cobrado (0 si no cobró)");
      Object.assign(datos, { valorCobrado: val, metodo: met, cuentaJs: met === "transf_js" ? datos.cuentaJs || "" : "" });
      const dif = datos.aCobrar ? val - (met === "transf_cliente" ? 0 : datos.aCobrar) : 0;
      if (dif !== (Number(p.difCobro) || 0)) datos.difRevisada = false;
    }
    const despues = { ...p, ...datos, domiPagoMedio: (datos.domiPagoMedio ?? p.domiPagoMedio) as Medio | "", domiPagoValor: datos.domiPagoValor ?? null } as Pedido;
    if (cambiaLoContado(p, despues)) return avisoContado(v);
    await conCambio(() => actualizarPedido(guia, datos), "Guía " + guia + " actualizada");
  };
  const borrar = async () => {
    if (cambiaLoContado(p, null)) return avisoContado(v);
    if (!await v.confirmar("Eliminar la guía " + guia, "Se borran el pedido y sus fotos. No se puede deshacer.", "Eliminar")) return v.abrir(<AbrirPedido guia={guia} />);
    await conCambio(() => eliminarPedido(guia), "Guía enviada a la papelera");
  };
  const reabrirG = async () => {
    if (cambiaLoContado(p, { ...p, estado: "pendiente", metodo: "" })) return avisoContado(v);
    if (!await v.confirmar("Reabrir la guía " + guia, "El pedido volverá a por entregar. La foto y la firma de esta entrega se guardan en el pedido como “entrega anterior”.", "Reabrir")) return v.abrir(<AbrirPedido guia={guia} />);
    await conCambio(() => reabrir(guia), "Guía " + guia + " reabierta");
  };
  const cambioOk = async () => {
    if (!await v.confirmar("Cambio de " + guia + " entregado", "Se marca que el cliente ya recibió la prenda de cambio.", "Marcar entregado")) return v.abrir(<AbrirPedido guia={guia} />);
    await conCambio(() => cambioEntregado(guia), "Cambio marcado como entregado", false);
  };
  const s = saldoPedido(p);
  return <>
    <Cab sub={<EtqEstado p={p} />}><h2 className="guia">{guia}</h2></Cab>
    <div className="linea2">
      <div className="campo"><label htmlFor="pCli">Remitente (cliente)</label><input id="pCliBuscar" type="search" placeholder="Buscar cliente…" autoComplete="off" aria-label="Buscar cliente" value={q}
        onChange={e => { setQ(e.target.value); const l = cs.filter(x => !e.target.value.trim() || sinTildes(x.nombre + " " + (x.telefono || "")).includes(sinTildes(e.target.value.trim()))); if (l.length === 1 && e.target.value.trim()) elegirCli(l[0].id); }} />
        <select id="pCli" value={cli} onChange={e => elegirCli(e.target.value)}><option value="">{vis.length ? (q ? vis.length + " " + pl(vis.length, "encontrado") + "…" : "Elige…") : "Ningún cliente con ese nombre"}</option>
          {(cli && !vis.some(x => x.id === cli) && S.clientes[cli] ? [S.clientes[cli], ...vis] : vis).map(x => <option key={x.id} value={x.id}>{x.nombre}</option>)}</select>
        <button className="btn sec chico" id="pNuevoCli" type="button" style={{ alignSelf: "start" }} onClick={() => v.abrir(<FormCliente alGuardar={cid => v.abrir(<AbrirPedido guia={guia} cliElegido={cid} />)} nombre={q} />)}>+ Crear cliente nuevo</button></div>
      <div className="campo"><label htmlFor="pServ">Valor del servicio</label><input id="pServ" type="number" inputMode="numeric" min="0" step="100" value={serv} onChange={e => setServ(e.target.value)} /></div>
    </div>
    <div className="campo"><label htmlFor="pCob">Valor a cobrar al destinatario (opcional)</label><input id="pCob" type="number" inputMode="numeric" min="0" step="100" value={cob} onChange={e => setCob(e.target.value)} placeholder="Lo que el mensajero debe recoger" /></div>
    {p.estado === "devuelto" && <label className="check"><input type="checkbox" id="pDev" checked={dev} onChange={e => setDev(e.target.checked)} /> Cobrarle al cliente el domicilio de esta devolución</label>}
    {p.estado === "entregado" && yo.esAdmin && <>
      <div className="linea2"><div className="campo"><label htmlFor="pValCob">Valor que cobró el mensajero</label><input id="pValCob" type="number" inputMode="numeric" min="0" step="100" value={valCob} onChange={e => setValCob(e.target.value)} /></div>
        <div className="campo"><label htmlFor="pMet">Cómo se lo pagaron</label><select id="pMet" value={met} onChange={e => setMet(e.target.value as Metodo)}>{(Object.keys(METODOS) as Metodo[]).map(k => <option key={k} value={k}>{METODOS[k].t}</option>)}</select></div></div>
      {pedidoLiquidado(p) && <p className="sub" style={{ marginTop: -6 }}>Esta entrega ya está en una liquidación cerrada de {S.mensajeros[p.mensajeroId]?.nombre || "el mensajero"}: si la corriges, la diferencia pasa sola a lo que debe en su período abierto (“Correcciones a liquidaciones cerradas”).</p>}
    </>}
    {p.estado === "entregado" && (p.metodo === "transf_js" || yo.esAdmin) && <div className={"campo " + ((yo.esAdmin ? met : p.metodo) === "transf_js" ? "" : "oculto")} id="pCtaBox"><label htmlFor="pCta">Cuenta de JS donde llegó la transferencia</label>
      <select id="pCta" value={cta} onChange={e => setCta(e.target.value as "")}><option value="">Sin especificar</option>{Object.entries(CUENTAS_JS).map(([k, t]) => <option key={k} value={k}>{t}</option>)}</select></div>}
    <div className="linea2"><div className="campo"><label htmlFor="pGasto">Flete / gasto pagado por el mensajero (se le cobra al cliente)</label><input id="pGasto" type="number" inputMode="numeric" min="0" step="1000" value={gasto} onChange={e => setGasto(e.target.value)} placeholder="0" /></div>
      <div className="campo"><label htmlFor="pGastoNota">Detalle del gasto</label><input id="pGastoNota" value={gastoNota} onChange={e => setGastoNota(e.target.value)} placeholder="Ej: bus a Pasto" /></div></div>
    <label className="check"><input type="checkbox" id="pDomi" checked={domi} onChange={e => { setDomi(e.target.checked); if (e.target.checked && !domiVal) setDomiVal(String((Number(serv) || 0) + (Number(gasto) || 0) || "")); }} /> El cliente ya pagó el domicilio</label>
    <div className={"linea2 " + (domi ? "" : "oculto")} id="pDomiBox"><div className="campo"><label htmlFor="pDomiMedio">¿Cómo pagó? (entra a la caja)</label>
      <select id="pDomiMedio" value={domiMedio} onChange={e => setDomiMedio(e.target.value)}><option value="">{p.domiPagado && !p.domiPagoMedio ? "No registrado en caja" : "Elige…"}</option>{Object.entries(MEDIOS).map(([k, t]) => <option key={k} value={k}>{t}</option>)}</select></div>
      <div className="campo"><label htmlFor="pDomiVal">Valor que pagó</label><input id="pDomiVal" type="number" inputMode="numeric" min="0" step="100" value={domiVal} onChange={e => setDomiVal(e.target.value)} /></div></div>
    <button className="btn" id="pGuardar" onClick={guardar}>Guardar</button>
    <dl className="datos" style={{ marginTop: 18 }}>
      {p.cambio && <><dt>Cambio</dt><dd>{p.cambioRecibido ? "El cliente lo recibió " + hora(p.cambioRecibido) : "Prenda por entregar al cliente"}</dd></>}
      <dt>Mensajero</dt><dd>{S.mensajeros[p.mensajeroId]?.nombre || "—"}</dd>
      <dt>Salió</dt><dd>{hora(p.creado)}</dd>
      {p.intentos.map((i, k) => <IntentoFila key={k} n={k + 1} fecha={i.fecha} motivo={i.motivo} nota={i.nota} />)}
      {p.estado === "devuelto" && <><dt>Devuelto</dt><dd>{hora(p.entregado)}</dd><dt>Motivo</dt><dd>{MOTIVOS[p.motivoDev as Motivo] || ""}{p.notaDev ? " · " + p.notaDev : ""}</dd><dt>Efecto en saldo</dt><dd className={s < 0 ? "neg" : ""}>{pesos(s)}</dd></>}
      {p.estado === "entregado" && Number(p.difCobro) ? <><dt>Debía cobrar</dt><dd>{pesos(p.aCobrar)}</dd><dt>Diferencia</dt><dd className="neg">{pesos(p.difCobro)}{p.difRevisada ? " (revisada)" : ""}</dd></> : null}
      {p.estado === "entregado" && <><dt>Entregado</dt><dd>{hora(p.entregado)}</dd><dt>Recibió</dt><dd>{p.destinatario}</dd>
        <dt>Cobrado</dt><dd>{pesos(p.valorCobrado)}</dd><dt>Método</dt><dd>{metodoTxt(p)}</dd>
        {p.domiPagado && <><dt>Pago de domicilio</dt><dd>{pesos(pagoDomi(p))}{p.domiPagoMedio ? " · " + MEDIOS[p.domiPagoMedio] + " · " + hora(p.domiPagoFecha) : " · sin registrar en caja"}</dd></>}
        <dt>Efecto en saldo</dt><dd className={s < 0 ? "neg" : "pos"}>{pesos(s)}</dd></>}
    </dl>
    <FotosGuia p={p} id="pFotos" conPrevias />
    <div className="acciones">
      {!cerrado(p) && tipoDe(S.mensajeros[p.mensajeroId]) === "oficina" && <button className="btn ok chico" id="pEntregar" onClick={() => abrirEntregaEn(v, guia)}>Marcar entregado</button>}
      {cerrado(p) ? (yo.esAdmin && <button className="btn sec chico" id="pReabrir" onClick={reabrirG}>Devolver a por entregar</button>)
        : <button className="btn sec chico" id="pNoEnt" onClick={() => v.abrir(<DlgDevolucion guia={guia} />)}>Registrar que no se pudo entregar</button>}
      {Number(p.difCobro) && !p.difRevisada ? <button className="btn sec chico" id="pDifOk" onClick={() => conCambio(() => actualizarPedido(guia, { difRevisada: true }), "Diferencia revisada", false)}>Marcar diferencia como revisada</button> : null}
      {cambioPendiente(p) && <button className="btn sec chico" id="pCambioOk" onClick={cambioOk}>Cambio entregado al cliente</button>}
      {yo.esAdmin && <button className="btn peligro chico" id="pBorrar" onClick={borrar}>Eliminar pedido</button>}
    </div>
  </>;
}
const IntentoFila = ({ n, fecha, motivo, nota }: { n: number; fecha: number; motivo: string; nota: string }) =>
  <><dt>Intento {n}</dt><dd>{hora(fecha)} · {MOTIVOS[motivo as Motivo] || ""}{nota ? " · " + nota : ""}</dd></>;

/* Pedidos en bloque: "sin" pone el mismo remitente a varias guías; "serv" pone el domicilio a varias entregas sin valor. */
export function EnBloque({ modo, lista }: { modo: string; lista: Pedido[] }) {
  const v = useVentana(), sin = modo === "sin", ps = lista.slice(), cs = listaOrdenada(S.clientes, "nombre");
  const [sel, setSel] = useState(() => new Set(ps.map(p => p.guia)));
  const [q, setQ] = useState(""), [cli, setCli] = useState(""), [serv, setServ] = useState(""), [suyo, setSuyo] = useState(true), [guardando, setGuardando] = useState(false);
  const vis = cs.filter(c => !q.trim() || sinTildes(c.nombre + " " + (c.telefono || "")).includes(sinTildes(q.trim())));
  const marcar = (g: string, si: boolean) => setSel(s => { const n = new Set(s); if (si) n.add(g); else n.delete(g); return n; });
  const guardar = async () => {
    const valor = Number(serv) || 0, guias = ps.map(p => p.guia).filter(g => sel.has(g));
    let cambios: [string, CambiosPedido][];
    if (sin) { if (!cli) return v.avisar("Elige el remitente"); cambios = guias.map(g => [g, { clienteId: cli, ...(valor ? { valorServicio: valor } : {}) }]); }
    else {
      const l = guias.map(g => { const t = suyo ? Number(S.clientes[S.pedidos[g].clienteId]?.tarifa) || valor : valor; return [g, t ? { valorServicio: t } : null] as [string, CambiosPedido | null]; });
      const faltan = l.filter(([, d]) => !d).length; if (faltan) return v.avisar(`${faltan} ${pl(faltan, "guía")} sin valor: escribe el valor del domicilio`);
      cambios = l as [string, CambiosPedido][];
    }
    setGuardando(true); let n = 0;
    try { for (const [g, d] of cambios) { await actualizarPedido(g, d); n++; } v.cerrar(); v.avisar(`${n} ${pl(n, "guía")} ${n === 1 ? "actualizada" : "actualizadas"}`); }
    catch { setGuardando(false); v.avisar(`Se guardaron ${n}; las demás no. Intenta otra vez.`); }
  };
  return <>
    <Cab sub={<span className="sub">{ps.length} {pl(ps.length, "guía")}</span>}><h2>{sin ? "Asignar remitente a varios" : "Poner domicilio a varios"}</h2></Cab>
    {sin ? <>
      <div className="campo"><label htmlFor="ebCli">Remitente</label><input id="ebBus" type="search" placeholder="Buscar cliente…" autoComplete="off" style={{ marginBottom: 6 }} value={q}
        onChange={e => { setQ(e.target.value); const l = cs.filter(c => !e.target.value.trim() || sinTildes(c.nombre + " " + (c.telefono || "")).includes(sinTildes(e.target.value.trim()))); if (l.length === 1 && e.target.value.trim()) { setCli(l[0].id); setServ(String(Number(l[0].tarifa) || "")); } }} />
        <select id="ebCli" value={cli} onChange={e => { setCli(e.target.value); setServ(String(Number(S.clientes[e.target.value]?.tarifa) || "")); }}><option value="">{vis.length ? "Elige…" : "Ningún cliente con ese nombre"}</option>{vis.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}</select></div>
      <div className="campo"><label htmlFor="ebServ">Valor del domicilio (opcional)</label><input id="ebServ" type="number" inputMode="numeric" min="0" step="100" placeholder="Se llena con el del cliente" value={serv} onChange={e => setServ(e.target.value)} /></div>
    </> : <>
      <label style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 8 }}><input type="checkbox" id="ebSuyo" checked={suyo} onChange={e => setSuyo(e.target.checked)} style={{ width: "auto" }} /><span>Usar el domicilio guardado de cada cliente</span></label>
      <div className="campo" id="ebFijoC"><label htmlFor="ebServ">{suyo ? "Valor para las que no tienen domicilio guardado" : "Valor del domicilio para todas"}</label><input id="ebServ" type="number" inputMode="numeric" min="0" step="100" value={serv} onChange={e => setServ(e.target.value)} /></div>
    </>}
    <div className="acciones" style={{ margin: "0 0 6px" }}><button className="btn sec chico" id="ebTodos" onClick={() => setSel(new Set(ps.map(p => p.guia)))}>Marcar todas</button><button className="btn sec chico" id="ebNinguna" onClick={() => setSel(new Set())}>Ninguna</button></div>
    <div style={{ maxHeight: "40vh", overflow: "auto" }}><table><tbody>{ps.map(p => <tr key={p.guia}><td style={{ width: 32 }}><input type="checkbox" checked={sel.has(p.guia)} onChange={e => marcar(p.guia, e.target.checked)} style={{ width: "auto" }} aria-label={p.guia} /></td>
      <td>{p.mini ? <img src={p.mini} alt="" style={{ width: 42, height: 42, objectFit: "cover", borderRadius: 6 }} /> : null}</td>
      <td><b>{p.guia}</b> <EtqEstado p={p} /><br /><span className="sub" style={{ fontSize: ".8rem" }}>{sin ? S.mensajeros[p.mensajeroId]?.nombre || "" : nombreCliente(p.clienteId)}{p.destinatario ? " · " + p.destinatario : ""} · {hora(p.creado)}{!sin && Number(S.clientes[p.clienteId]?.tarifa) ? " · domicilio " + pesos(S.clientes[p.clienteId].tarifa) : ""}</span></td></tr>)}</tbody></table></div>
    <button className="btn ok" id="ebGuardar" style={{ width: "100%", marginTop: 10 }} disabled={!sel.size || guardando} onClick={guardar}>{guardando ? "Guardando…" : `Guardar ${sel.size} ${pl(sel.size, "guía")}`}</button>
  </>;
}
