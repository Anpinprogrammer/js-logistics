/* Oficina → Cuentas: cuentas internas (JS Envíos, MT, Base de JS) y pagos, compras y ganancias de clientes, igual al prototipo. */
import { useState } from "react";
import {
  S, yo, hoy, hora, pesos, diaDe, listaOrdenada, textoCuenta, yaContado, mueveCaja, esPago, nombreCliente, saldoCliente, sinTildes, cajaOficina, puedoCambiarMedio,
  fechaCaja, fechaDia, diaMinCaja, MEDIOS, MOVS, MOVS_OFICINA, TIPOS_CUENTA, type Medio, type Movimiento, type TipoMov,
} from "../motor";
import { Cab, useVentana } from "../ui";
import { borrarDe, crearCuenta, guardarMovimiento, movCaja } from "../acciones";
import { motivoError } from "../datos";
import { avisoContado } from "./Pedidos";
import { diaAntesDelArqueo, FormCliente } from "./Clientes";
import { CambiarMedio } from "./Caja";

type Ventana = ReturnType<typeof useVentana>;
const MEDIOS_K = Object.keys(MEDIOS) as Medio[];
const medioAntes = (x: { medio: string; medioAntes?: string }) => x.medioAntes && x.medioAntes !== x.medio ? <> <span className="sub" style={{ fontSize: ".8rem" }}>(antes {MEDIOS[x.medioAntes as Medio] || x.medioAntes})</span></> : null;

/** Un pago ya contado en un arqueo no se borra: se registra hoy un pago contrario por el mismo valor. */
const reversarPago = (m: Movimiento) => yaContado(m.fecha) ? guardarMovimiento(null, { clienteId: m.clienteId, tipo: m.tipo === "pago_a_cliente" ? "pago_de_cliente" : "pago_a_cliente", valor: Number(m.valor) || 0, medio: m.medio || "efectivo", nota: "Reverso del pago del " + hora(m.fecha), fecha: Date.now() }) : borrarDe("movimientos", m.id);

export default function Cuentas() {
  const v = useVentana();
  const cs = listaOrdenada(S.cuentas, "nombre");
  const movs = Object.values(S.cajamovs).filter(c => c.cat === "interna").sort((a, b) => b.fecha - a.fecha).slice(0, 60);
  const extra = Object.values(S.movimientos).filter(m => MOVS_OFICINA.includes(m.tipo)).sort((a, b) => b.fecha - a.fecha).slice(0, 40);
  const [creando, setCreando] = useState(false);
  const semilla = async () => {
    setCreando(true);
    try { for (const [n, t] of [["JS Envíos", "socio"], ["MT (tienda de ropa)", "socio"], ["Base de JS", "base"]] as const) await crearCuenta(n, t); v.avisar("Cuentas creadas"); }
    catch (e) { setCreando(false); v.avisar("No se pudieron crear: " + motivoError(e)); }
  };
  const quitarCu = async (id: string) => {
    if (yaContado(S.cajamovs[id]?.fecha)) return avisoContado(v);
    if (!await v.confirmar("Quitar movimiento", "Se borra de la cuenta y de la caja.", "Quitar")) return;
    try { await borrarDe("cajamovs", id); v.avisar("Movimiento quitado"); } catch (e) { v.avisar("No se pudo quitar: " + motivoError(e)); }
  };
  const quitarMx = async (m: Movimiento) => {
    if (mueveCaja(m) && yaContado(m.fecha) && !esPago(m)) return avisoContado(v);
    if (esPago(m) && yaContado(m.fecha)) {
      if (!await v.confirmar("Reversar pago", `${nombreCliente(m.clienteId) || "Cliente"} · ${pesos(m.valor)}. Ya se contó en un arqueo: se registra hoy un pago contrario por el mismo valor.`, "Reversar")) return;
      try { await reversarPago(m); v.avisar("Pago reversado"); } catch (e) { v.avisar("No se pudo reversar: " + motivoError(e)); } return;
    }
    if (!await v.confirmar("Quitar " + (m.tipo === "ganancia" ? "ganancia" : esPago(m) ? "pago" : "compra"), `${nombreCliente(m.clienteId) || "Cliente"} · ${pesos(m.valor)}. Se quita de la cuenta del cliente${m.tipo === "ganancia" ? " y del sueldo de JS" : " y de la caja"}.`, "Quitar")) return;
    try { await borrarDe("movimientos", m.id); v.avisar("Movimiento quitado"); } catch (e) { v.avisar("No se pudo quitar: " + motivoError(e)); }
  };
  const tipoTxt = (m: Movimiento) => m.tipo === "pago_de_cliente" ? `Pago · ${MEDIOS[m.medio as Medio] || ""}` : m.tipo === "pago_a_cliente" ? `Le pagó · ${MEDIOS[m.medio as Medio] || ""}` : m.tipo === "ganancia" ? "Ganancia JS" : "Compra" + (m.medio ? ` · ${MEDIOS[m.medio as Medio] || ""}` : "");
  return <>
    <h1>Cuentas</h1><p className="sub">Entradas y salidas de JS Envíos, MT y la base de JS. Mueven la caja; no tocan clientes ni sueldos.</p>
    {cs.length ? <div className="mgrid">{cs.map(cu => { const t = textoCuenta(cu); return <div className="mcard" key={cu.id}><div className="mcard-top"><b>{cu.nombre}</b><span className="acciones" style={{ margin: 0, gap: 6 }}><button className="btn ok chico" onClick={() => v.abrir(<MovCuenta id={cu.id} tipo="entra" />)}>Entrada</button><button className="btn sec chico" onClick={() => v.abrir(<MovCuenta id={cu.id} tipo="sale" />)}>Salida</button></span></div>
      <span className="sub" style={{ fontSize: ".85rem" }}>{TIPOS_CUENTA[cu.tipo] || ""}</span><dl className="datos"><dt>{t.txt}</dt><dd className={t.cls}>{t.val}</dd></dl></div>; })}</div>
      : <div className="vacio">{yo.esAdmin ? <>Todavía no hay cuentas. <button className="btn chico" id="cuSemilla" disabled={creando} onClick={semilla}>Crear JS Envíos, MT y Base de JS</button></> : "El administrador todavía no ha creado las cuentas."}</div>}
    {yo.esAdmin && <div className="acciones"><button className="btn sec chico" id="cuNueva" onClick={() => v.abrir(<NuevaCuenta />)}>+ Nueva cuenta</button></div>}
    <h2>Movimientos de las cuentas</h2>
    {movs.length ? <div className="tabla-env"><table><thead><tr><th>Fecha</th><th>Cuenta</th><th>Motivo</th><th>Medio</th><th className="n">Valor</th>{yo.esAdmin && <th></th>}</tr></thead><tbody>
      {movs.map(c => <tr key={c.id}><td>{hora(c.fecha)}</td><td>{S.cuentas[c.cuentaId || ""]?.nombre || "—"}</td><td>{c.concepto || ""}</td><td>{MEDIOS[c.medio as Medio] || ""}</td><td className={"n " + (c.tipo === "entra" ? "pos" : "neg")}>{c.tipo === "entra" ? "+ " : "− "}{pesos(c.valor)}</td>
        {yo.esAdmin && <td><button className="btn peligro chico" onClick={() => quitarCu(c.id)}>Quitar</button></td>}</tr>)}
    </tbody></table></div> : <div className="vacio">Sin movimientos.</div>}
    <h2>Pagos, compras y ganancias de clientes</h2>
    <p className="sub">El pago de un cliente entra a la caja (efectivo, Nequi o Bancolombia) y se descuenta de lo que debe. Pagarle a un cliente es entregarle su saldo a favor: sale de la caja. La compra sale de la caja y queda como deuda del cliente; al entregar se compensa con lo cobrado. La ganancia ocasional se le carga al cliente y suma al sueldo de JS.</p>
    <div className="acciones"><button className="btn ok" id="cuPago" onClick={() => v.abrir(<MovClienteOficina tipo="pago_de_cliente" />)}>Pago de un cliente</button><button className="btn" id="cuPagoA" onClick={() => v.abrir(<MovClienteOficina tipo="pago_a_cliente" />)}>Pagarle a un cliente</button><button className="btn" id="cuCompra" onClick={() => v.abrir(<MovClienteOficina tipo="compra_cliente" />)}>Compra para un cliente</button><button className="btn sec" id="cuGanancia" onClick={() => v.abrir(<MovClienteOficina tipo="ganancia" />)}>Ganancia ocasional</button></div>
    {extra.length ? <div className="tabla-env" style={{ marginTop: 10 }}><table><thead><tr><th>Fecha</th><th>Cliente</th><th>Tipo</th><th>Detalle</th><th>Registró</th><th className="n">Valor</th><th></th></tr></thead><tbody>
      {extra.map(m => <tr key={m.id}><td>{hora(m.fecha)}</td><td>{nombreCliente(m.clienteId) || "—"}</td><td>{tipoTxt(m)}{medioAntes(m)}</td><td>{m.nota || ""}</td><td>{m.porNombre || ""}</td><td className="n">{pesos(m.valor)}</td>
        {yo.esAdmin ? <td style={{ whiteSpace: "nowrap" }}><button className="btn sec chico" onClick={() => editar(v, m)}>Editar</button> <button className="btn peligro chico" onClick={() => quitarMx(m)}>Quitar</button></td>
          : <td>{m.tipo !== "ganancia" && puedoCambiarMedio(m) ? <button className="btn sec chico" onClick={() => (yaContado(m.fecha) ? avisoContado(v) : v.abrir(<CambiarMedio col="movimientos" id={m.id} />))}>Cambiar medio</button> : null}</td>}</tr>)}
    </tbody></table></div> : null}
  </>;
}
const editar = (v: Ventana, m: Movimiento) => { if (mueveCaja(m) && yaContado(m.fecha)) return avisoContado(v); v.abrir(<MovClienteOficina tipo={m.tipo} mov={m} />); };

function NuevaCuenta() {
  const v = useVentana(), [nombre, setNombre] = useState(""), [tipo, setTipo] = useState<"socio" | "base">("socio");
  const guardar = async () => { const n = nombre.trim(); if (!n) return v.avisar("Escribe el nombre");
    try { await crearCuenta(n, tipo); v.cerrar(); v.avisar("Cuenta creada"); } catch (e) { v.avisar("No se pudo crear: " + motivoError(e)); } };
  return <>
    <Cab><h2>Nueva cuenta</h2></Cab>
    <div className="campo"><label htmlFor="ncNom">Nombre</label><input id="ncNom" placeholder="Ej: JS Envíos" autoFocus value={nombre} onChange={e => setNombre(e.target.value)} /></div>
    <div className="campo"><label htmlFor="ncTipo">Tipo</label><select id="ncTipo" value={tipo} onChange={e => setTipo(e.target.value as "socio" | "base")}>{Object.entries(TIPOS_CUENTA).map(([k, t]) => <option key={k} value={k}>{t}</option>)}</select></div>
    <button className="btn" id="ncGuardar" style={{ width: "100%" }} onClick={guardar}>Crear cuenta</button>
  </>;
}

function MovCuenta({ id, tipo }: { id: string; tipo: "entra" | "sale" }) {
  const v = useVentana(), cu = S.cuentas[id];
  const [val, setVal] = useState(""), [medio, setMedio] = useState<Medio>("efectivo"), [dia, setDia] = useState(hoy()), [mot, setMot] = useState(""), [guardando, setGuardando] = useState(false);
  if (!cu) return null;
  const t = textoCuenta(cu);
  const guardar = async () => {
    const valor = Number(val), m = mot.trim();
    if (!(valor > 0)) return v.avisar("Escribe un valor mayor a cero"); if (!m) return v.avisar("Escribe el motivo");
    const d = dia || hoy(); if (diaAntesDelArqueo(v, d)) return;
    setGuardando(true);
    try { await movCaja({ tipo, cat: "interna", cuentaId: id, personaId: "", valor, medio, concepto: m, fecha: fechaCaja(d), porUid: yo.uid, porNombre: yo.nombre }); v.cerrar(); v.avisar((tipo === "entra" ? "Entrada" : "Salida") + " registrada"); }
    catch (e) { setGuardando(false); v.avisar("No se pudo guardar: " + motivoError(e)); }
  };
  return <>
    <Cab sub={<span className="sub">{t.txt}: {t.val}</span>}><h2>{tipo === "entra" ? "Entrada de" : "Salida a"} {cu.nombre}</h2></Cab>
    <p className="sub">{tipo === "entra" ? "Dinero que entra a la caja desde esta cuenta." : "Dinero que sale de la caja hacia esta cuenta."}</p>
    <div className="linea2"><div className="campo"><label htmlFor="mcVal">Valor</label><input id="mcVal" type="number" inputMode="numeric" min="0" step="1000" autoFocus value={val} onChange={e => setVal(e.target.value)} /></div>
      <div className="campo"><label htmlFor="mcMedio">Medio</label><select id="mcMedio" value={medio} onChange={e => setMedio(e.target.value as Medio)}>{MEDIOS_K.map(k => <option key={k} value={k}>{MEDIOS[k]}</option>)}</select></div></div>
    <div className="linea2"><div className="campo"><label htmlFor="mcDia">Día</label><input id="mcDia" type="date" value={dia} min={diaMinCaja()} max={hoy()} onChange={e => setDia(e.target.value)} /></div>
      <div className="campo"><label htmlFor="mcMot">Motivo</label><input id="mcMot" placeholder={tipo === "entra" ? "Ej: devolución del préstamo" : "Ej: préstamo para nómina"} value={mot} onChange={e => setMot(e.target.value)} /></div></div>
    <button className={"btn " + (tipo === "entra" ? "ok" : "")} id="mcGuardar" style={{ width: "100%" }} disabled={guardando} onClick={guardar}>Registrar {tipo === "entra" ? "entrada" : "salida"}</button>
  </>;
}

interface Escrito { cid: string; val: string; medio: string; dia: string; nota: string }
/** Pago de un cliente, pago a un cliente, compra por encargo o ganancia ocasional. mov: el movimiento a editar (solo administración). */
export function MovClienteOficina({ tipo, mov, pre }: { tipo: TipoMov; mov?: Movimiento; pre?: Escrito }) {
  const v = useVentana(), cs = listaOrdenada(S.clientes, "nombre");
  const compra = tipo === "compra_cliente", pago = tipo === "pago_de_cliente", pagoA = tipo === "pago_a_cliente";
  const conMedio = compra || pago || pagoA, soloHoy = (pago || pagoA) && !yo.esAdmin; // los pagos que registra el asistente quedan con la hora del momento
  const miCaja = yo.esAsistente && yo.uid ? cajaOficina(yo.uid).saldo : null;
  const v0: Escrito = pre || (mov ? { cid: mov.clienteId, val: String(mov.valor), medio: mov.medio, dia: diaDe(mov.fecha), nota: mov.nota } : { cid: "", val: "", medio: compra ? "efectivo" : "", dia: hoy(), nota: "" });
  const [x, setX] = useState<Escrito>(v0), [bus, setBus] = useState(""), [guardando, setGuardando] = useState(false);
  const titulo = pago ? (mov ? "Editar pago" : "Pago de un cliente") : pagoA ? (mov ? "Editar pago al cliente" : "Pagarle a un cliente") : compra ? (mov ? "Editar compra" : "Compra para un cliente") : mov ? "Editar ganancia ocasional" : "Ganancia ocasional";
  const q = sinTildes(bus.trim()), vis = cs.filter(c => !q || sinTildes(c.nombre + " " + (c.telefono || "")).includes(q));
  const s = x.cid ? saldoCliente(x.cid) : 0;
  const elegir = (cid: string) => {
    const sc = cid ? saldoCliente(cid) : 0; let val = x.val;
    if (!mov && cid && !val) { if (pago && sc < 0) val = String(-sc); if (pagoA && sc > 0) val = String(sc); }
    setX({ ...x, cid, val });
  };
  const buscar = (t: string) => { setBus(t); const qq = sinTildes(t.trim()), l = cs.filter(c => !qq || sinTildes(c.nombre + " " + (c.telefono || "")).includes(qq)); if (l.length === 1 && qq) elegir(l[0].id); };
  // Cliente que todavía no está registrado: se crea y se vuelve al formulario con lo que ya estaba escrito
  const nuevoCli = () => v.abrir(<FormCliente nombre={bus.trim()} alGuardar={cid => v.abrir(<MovClienteOficina tipo={tipo} mov={mov} pre={{ ...x, cid }} />)} />);
  const guardar = async () => {
    const valor = Number(x.val), medio = conMedio ? x.medio : "";
    if (!x.cid) return v.avisar("Elige el cliente"); if (!(valor > 0)) return v.avisar("Escribe un valor mayor a cero");
    if (pago && !medio) return v.avisar("Elige cómo pagó"); if (pagoA && !medio) return v.avisar("Elige cómo le pagas");
    const dia = x.dia || hoy(), caja = mueveCaja({ tipo }); if (!soloHoy && caja && diaAntesDelArqueo(v, dia)) return;
    setGuardando(true);
    try {
      await guardarMovimiento(mov ? mov.id : null, { clienteId: x.cid, tipo, valor, medio: medio as Medio | "", nota: x.nota.trim(), fecha: soloHoy ? Date.now() : caja ? fechaCaja(dia) : fechaDia(dia) });
      v.cerrar(); v.avisar(mov ? "Cambios guardados" : pago ? `Pago de ${pesos(valor)} de ${nombreCliente(x.cid)} registrado` : pagoA ? `Pago de ${pesos(valor)} a ${nombreCliente(x.cid)} registrado` : compra ? "Compra registrada" : "Ganancia registrada");
    } catch (e) { setGuardando(false); v.avisar("No se pudo guardar: " + motivoError(e)); }
  };
  return <>
    <Cab><h2>{titulo}</h2></Cab>
    {mov && <div className="campo"><label htmlFor="mxTipo">Tipo</label><select id="mxTipo" value={tipo} onChange={e => v.abrir(<MovClienteOficina tipo={e.target.value as TipoMov} mov={mov} pre={x} />)}>{MOVS_OFICINA.map(k => <option key={k} value={k}>{MOVS[k].t}</option>)}</select></div>}
    <p className="sub">{pago ? "El dinero entra a la caja en el medio que elijas y se descuenta de lo que el cliente debe." : pagoA ? "Le entregas al cliente su saldo a favor: sale de la caja en el medio que elijas y se descuenta de lo que JS le debe." + (miCaja ? ` Tienes ${MEDIOS_K.map(k => MEDIOS[k] + " " + pesos(miCaja[k])).join(" · ")}.` : "") : compra ? "Sale de la caja y queda como deuda del cliente. En el pedido pon el domicilio y en “a cobrar” lo que se le cobra al destinatario; al entregar se compensa." : "Se le carga al cliente (queda por cobrar) y suma 100% al sueldo de JS ese día. Ej: $4.000 por punto extra."}</p>
    <div className="campo"><label htmlFor="mxCli">Cliente</label><div style={{ display: "flex", gap: 6, marginBottom: 6 }}><input id="mxBus" type="search" placeholder="Buscar cliente…" autoComplete="off" style={{ flex: 1 }} value={bus} onChange={e => buscar(e.target.value)} /><button className="btn sec chico" id="mxNuevoCli" type="button" onClick={nuevoCli}>+ Cliente nuevo</button></div>
      <select id="mxCli" value={x.cid} onChange={e => elegir(e.target.value)}><option value="">{vis.length ? "Elige…" : "Ningún cliente con ese nombre"}</option>{(x.cid && !vis.some(c => c.id === x.cid) && S.clientes[x.cid] ? [S.clientes[x.cid], ...vis] : vis).map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}</select>
      <span className="sub" id="mxSaldo" style={{ display: "block", marginTop: 4 }}>{!x.cid ? "" : s < 0 ? <b className="neg">Debe {pesos(-s)}</b> : s > 0 ? <b className="pos">Tiene {pesos(s)} a favor</b> : "Está a paz y salvo"}</span></div>
    <div className="linea2"><div className="campo"><label htmlFor="mxVal">{pago ? "Valor que pagó" : pagoA ? "Valor que le entregas" : "Valor"}</label><input id="mxVal" type="number" inputMode="numeric" min="0" step="100" value={x.val} onChange={e => setX({ ...x, val: e.target.value })} /></div>
      {conMedio && <div className="campo"><label htmlFor="mxMedio">{pago ? "¿Cómo pagó?" : pagoA ? "¿Cómo le pagas?" : "Pagado con"}</label><select id="mxMedio" value={x.medio} onChange={e => setX({ ...x, medio: e.target.value })}>{pago || pagoA ? <option value="">Elige…</option> : null}{MEDIOS_K.map(k => <option key={k} value={k}>{MEDIOS[k]}</option>)}</select></div>}</div>
    <div className="linea2">{!soloHoy && <div className="campo"><label htmlFor="mxDia">Día</label><input id="mxDia" type="date" value={x.dia || hoy()} max={hoy()} onChange={e => setX({ ...x, dia: e.target.value })} /></div>}
      <div className="campo"><label htmlFor="mxNota">Detalle</label><input id="mxNota" value={x.nota} onChange={e => setX({ ...x, nota: e.target.value })} placeholder={pago ? "Ej: comprobante Nequi 4521" : pagoA ? "Ej: entregado en oficina" : compra ? "Ej: compra en almacén · guía JS-00120" : "Ej: 3 puntos extra · guía JS-00120"} /></div></div>
    <button className="btn ok" id="mxGuardar" style={{ width: "100%" }} disabled={guardando} onClick={guardar}>{mov ? "Guardar cambios" : pago || pagoA ? "Registrar pago" : "Registrar"}</button>
  </>;
}
