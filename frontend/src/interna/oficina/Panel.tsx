/* Panel de control de la oficina (pintarInicioEmpresa del prototipo): KPIs del día, mensajeros, entregas, plata y clientes. */
import {
  S, yo, hoy, moverDia, diaDe, cerrado, servicio, pct, listaOrdenada, esRepartidor, periodoMensajero, resumenCaja, saldoCliente, entregasPorDia,
  ultimaActividad, pesos, MEDIOS_CAJA, arqueosCaja, hora, resultadoArqueo, diaCorto, COLOR_ESTADO, nombreCliente, type Pedido,
} from "../motor";
import { Columnas, Dona, EtqDash, Kpi, pl, useVentana } from "../ui";
import { E } from "../estado";
import { AbrirCuenta, AbrirPedido } from "./modales";

const COL_MEDIO: Record<string, string> = { efectivo: "var(--verde)", nequi: "#8E44AD", bancolombia: "#E0A100", cuentas: "var(--marca2)" };

export default function Panel({ pintar }: { pintar: () => void }) {
  const v = useVentana();
  const h = hoy(), ayer = moverDia(h, -1), todos = Object.values(S.pedidos);
  const delDiaE = (p: Pedido, d: string, e: string) => p.estado === e && diaDe(p.entregado || 0) === d;
  const entHoy = todos.filter(p => delDiaE(p, h, "entregado")), devHoy = todos.filter(p => delDiaE(p, h, "devuelto"));
  const enRuta = todos.filter(p => p.estado === "pendiente"), salieron = todos.filter(p => diaDe(p.creado) === h).length, sinRem = todos.filter(p => !p.clienteId).length;
  const domDe = (d: string) => todos.filter(p => cerrado(p) && diaDe(p.entregado || 0) === d).reduce((a, p) => a + servicio(p), 0), domHoy = domDe(h), domAyer = domDe(ayer);
  const efec = pct(entHoy.length, entHoy.length + devHoy.length), cambio = domAyer ? Math.round(((domHoy - domAyer) * 100) / domAyer) : null;
  const reps = listaOrdenada(S.mensajeros, "nombre").filter(esRepartidor)
    .map(m => ({ m, ruta: enRuta.filter(p => p.mensajeroId === m.id).length, ent: entHoy.filter(p => p.mensajeroId === m.id).length, debe: periodoMensajero(m.id).debe }))
    .filter(x => x.ruta || x.ent || x.debe > 0).sort((a, b) => b.ruta - a.ruta || b.ent - a.ent);
  // la caja de la empresa solo la ve administración; el asistente ve lo de mensajeros y clientes
  let porCobrar = 0, porPagar = 0, enMens = reps.reduce((a, x) => a + Math.max(0, x.debe), 0);
  const R = yo.esAdmin ? resumenCaja() : null;
  if (R) { porCobrar = R.porCobrar; porPagar = R.porPagar; enMens = R.enMens; }
  else Object.keys(S.clientes).forEach(id => { const s = saldoCliente(id); if (s > 0) porPagar += s; else porCobrar -= s; });
  const dias = entregasPorDia(todos, 14), tot14 = dias.reduce((a, d) => a + d.n, 0);
  const ultimos = todos.slice().sort((a, b) => ultimaActividad(b) - ultimaActividad(a)).slice(0, 7);
  const desde = moverDia(h, -29), porC: Record<string, { n: number; dom: number }> = {};
  todos.forEach(p => { if (p.clienteId && p.estado === "entregado" && diaDe(p.entregado || 0) >= desde) { const c = (porC[p.clienteId] = porC[p.clienteId] || { n: 0, dom: 0 }); c.n++; c.dom += servicio(p); } });
  const top = Object.entries(porC).sort((a, b) => b[1].n - a[1].n).slice(0, 6), maxTop = top.length ? top[0][1].n : 1;
  const fila = (t: React.ReactNode, x: number, cls?: string) => <div className={cls || ""}><span>{t}</span><b className={x < 0 ? "neg" : ""}>{pesos(x)}</b></div>;
  const a = arqueosCaja()[0];

  /** Atajos del panel: "pestaña|filtro|día". */
  const ir = (destino: string) => {
    const [t, f, d] = destino.split("|"); E.tabA = t;
    if (t === "pedidos") { E.filtroA = f || "todos"; E.diaPedA = d === "hoy" ? h : ""; E.mensPedA = ""; E.buscarA = ""; E.paginaA = 1; }
    if (t === "mas") E.subMas = f || "resultados";
    pintar(); scrollTo(0, 0);
  };

  return <>
    <div className="dash-cab"><div><h1>Panel de control</h1><p className="sub">Así va JS Logistics hoy</p></div>{yo.esAdmin && <button className="btn sec chico" onClick={() => ir("mas|resultados")}>Ver resultados del mes</button>}</div>
    <div className="kpis">
      <Kpi ico="ok" lbl="Entregados hoy" val={entHoy.length} onClick={() => ir("pedidos|ent|hoy")}
        pie={<><div className="prog" aria-hidden="true"><i style={{ width: efec + "%" }} /></div><small>{entHoy.length + devHoy.length ? efec + "% efectividad · " + devHoy.length + " " + pl(devHoy.length, "devuelto") : "Todavía sin entregas hoy"}</small></>} />
      <Kpi ico="ruta" lbl="En ruta ahora" val={enRuta.length} onClick={() => ir("pedidos|pend")}
        pie={<small>{salieron} salieron hoy{sinRem ? <> · <span className="neg">{sinRem} sin remitente</span></> : null}</small>} />
      <Kpi ico="pedidos" lbl="Domicilios de hoy" val={pesos(domHoy)}
        pie={<small>{cambio === null ? "Ayer: " + pesos(domAyer) : <><span className={"tend " + (cambio >= 0 ? "sube" : "baja")}>{cambio >= 0 ? "↑" : "↓"} {Math.abs(cambio)}%</span> frente a ayer</>}</small>} />
      {R ? <Kpi ico="plata" lbl="Total en caja" val={pesos(R.total)} pie={<small>Disponible de JS: {pesos(R.disponible)}</small>} onClick={() => ir("caja")} cls="oscuro" />
        : <Kpi ico="plata" lbl="Deben los mensajeros" val={pesos(enMens)} pie={<small>Lo que falta por recibir</small>} onClick={() => ir("caja")} cls="oscuro" />}
    </div>
    <div className="dash">
      <section className="tarjeta c5 tarjeta-dona"><h3>Pedidos de hoy <small>{diaCorto(h)}</small></h3>
        <Dona segs={[{ t: "Entregados", n: entHoy.length, c: COLOR_ESTADO.entregado }, { t: "En ruta", n: enRuta.length, c: COLOR_ESTADO.ruta }, { t: "Devueltos", n: devHoy.length, c: COLOR_ESTADO.devuelto }]}
          centro={entHoy.length + enRuta.length + devHoy.length} sub="pedidos" /></section>
      <section className="tarjeta c7"><h3>Mensajeros en ruta <button className="btn sec chico" onClick={() => ir("caja")}>Ir a Caja</button></h3>
        {reps.length ? <div className="tabla-env"><table><thead><tr><th>Mensajero</th><th className="n">En ruta</th><th className="n">Hoy</th><th className="n">Debe</th><th className="solo-ancho">Estado</th></tr></thead><tbody>
          {reps.map(x => <tr key={x.m.id} data-ir="caja" onClick={() => ir("caja")}><td><b>{x.m.nombre}</b></td><td className="n">{x.ruta}</td><td className="n">{x.ent}</td><td className={"n " + (x.debe > 0 ? "neg" : "")}>{pesos(x.debe)}</td>
            <td className="solo-ancho">{x.ruta ? <span className="etq ruta">En ruta</span> : x.ent ? <span className="etq ent">Terminó</span> : <span className="etq gris">Sin salir</span>}</td></tr>)}
        </tbody></table></div> : <div className="vacio">Ningún mensajero en ruta ahora.</div>}</section>
    </div>
    <div className="dash">
      <section className="tarjeta c7"><h3>Entregas · últimos 14 días <small>{tot14} en total · {(tot14 / 14).toFixed(1)} por día</small></h3><Columnas datos={dias} nombre="Entregas por día" /></section>
      <section className="tarjeta c5"><h3>Plata {R ? null : <small>Mensajeros y clientes</small>}</h3><div className="plata">
        {R ? <>
          {Object.entries(R.porMedio).filter(([, x]) => Math.round(x)).map(([m, x]) => <div key={m}><span className="medio" style={{ "--c": COL_MEDIO[m] || "var(--suave)" } as React.CSSProperties}>{MEDIOS_CAJA[m] || m}</span><b>{pesos(x)}</b></div>)}
          {fila(<b>Total en caja</b>, R.total)}{fila("En manos de mensajeros", enMens)}{fila("Te deben los clientes", porCobrar)}{fila("Les debes a clientes", porPagar)}{fila("Sueldos por pagar (semana)", R.sueldosPend)}
          <div><span>Último arqueo</span><b>{a ? hora(a.fecha) + " · " + resultadoArqueo(a) : "Nunca"}</b></div>
          {fila("Disponible de JS", R.disponible, "total")}
        </> : <>{fila("Deben los mensajeros", enMens)}{fila("Te deben los clientes", porCobrar)}{fila("Les debes a clientes", porPagar, "total")}</>}
      </div></section>
    </div>
    <div className="dash">
      <section className="tarjeta c7"><h3>Últimos pedidos <button className="btn sec chico" onClick={() => ir("pedidos|todos")}>Ver todos</button></h3>
        {ultimos.length ? <div className="tabla-env"><table><thead><tr><th>Guía</th><th>Cliente</th><th className="solo-ancho">Mensajero</th><th>Estado</th><th className="n solo-ancho">Cobrado</th></tr></thead><tbody>
          {ultimos.map(p => <tr key={p.guia} data-ped={p.guia} onClick={() => v.abrir(<AbrirPedido guia={p.guia} />, "drawer")}><td className="guia">{p.guia}</td><td>{p.clienteId ? nombreCliente(p.clienteId) : <span className="etq sin">Sin remitente</span>}</td>
            <td className="solo-ancho">{S.mensajeros[p.mensajeroId]?.nombre || ""}</td><td><EtqDash p={p} /></td><td className="n solo-ancho">{p.estado === "entregado" ? pesos(p.valorCobrado) : "—"}</td></tr>)}
        </tbody></table></div> : <div className="vacio">Todavía no hay pedidos.</div>}</section>
      <section className="tarjeta c5"><h3>Clientes que más envían <small>Últimos 30 días</small></h3>
        {top.length ? <div className="hbarras">{top.map(([id, c]) => <button key={id} style={{ "--w": Math.round((c.n * 100) / maxTop) + "%" } as React.CSSProperties} onClick={() => v.abrir(<AbrirCuenta cid={id} />, "cuenta")}>
          <span>{nombreCliente(id) || "(eliminado)"}</span><small>{c.n} {pl(c.n, "entrega")} · {pesos(c.dom)}</small><i /></button>)}</div> : <div className="vacio">Sin entregas en los últimos 30 días.</div>}</section>
    </div>
  </>;
}
