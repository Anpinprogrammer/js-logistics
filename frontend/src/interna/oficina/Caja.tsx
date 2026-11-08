/* Oficina → Caja: cierre del día, caja general, mensajeros, cajas de oficina, dinero recibido y liquidaciones (igual al prototipo). */
import { useState } from "react";
import {
  S, yo, hoy, hora, pesos, diaDe, horaCorta, listaOrdenada, periodoMensajero, totales, tipoDe, esRepartidor, sueldoTexto, textoLiq, ajusteTxt, ganaPorcentaje, sueldoPedidos,
  sueldoPersonaSemana, semanasAdelanto, semanasSueldo, liquidacionesDe, asistentes, cajaOficina, sumaMedios, yaContado, puedoCambiarMedio, yaLiquidado, resumenCaja, arqueosCaja,
  netoArqueo, resultadoArqueo, pendientesCierre, esperadoArqueo, sinServicio, diaMinCaja, fechaCaja, nombreCliente,
  MEDIOS, MEDIOS_CAJA, CATS, CATS_TIPO, CATS_PERSONA, CATS_SEMANA, type Medio, type UsuarioS, type CajaMov,
} from "../motor";
import { Cab, TablaEntregas, pl, useVentana } from "../ui";
import { E } from "../estado";
import { borrarDe, cambiarMedio, cierreOficina, deshacerArqueo, quitarDevolucion, liquidar, movCaja, reabrirLiquidacion, recibirDinero, arqueo } from "../acciones";
import { motivoError, useDatos } from "../datos";
import { avisoContado, EnBloque } from "./Pedidos";
import { diaAntesDelArqueo } from "./Clientes";

type Ventana = ReturnType<typeof useVentana>;
const noSePudo = (v: Ventana, que: string) => (e: unknown) => v.avisar(que + ": " + motivoError(e));
const MEDIOS_K = Object.keys(MEDIOS) as Medio[];
const medioAntes = (x: { medio: string; medioAntes?: string }) => x.medioAntes && x.medioAntes !== x.medio ? <> <span className="sub" style={{ fontSize: ".8rem" }}>(antes {MEDIOS[x.medioAntes as Medio] || x.medioAntes})</span></> : null;
const FilaAjuste = ({ a }: { a: number }) => a ? <><dt>Correcciones a liquidaciones cerradas</dt><dd className={a > 0 ? "neg" : "pos"}>{ajusteTxt(a)}</dd></> : null;

export default function Caja({ pintar }: { pintar: () => void }) {
  const v = useVentana();
  const pendM: Record<string, number> = {}; Object.values(S.pedidos).filter(p => p.estado === "pendiente").forEach(p => (pendM[p.mensajeroId] = (pendM[p.mensajeroId] || 0) + 1));
  const pms: Record<string, ReturnType<typeof periodoMensajero>> = {}; Object.keys(S.mensajeros).forEach(id => (pms[id] = periodoMensajero(id)));
  // los mensajeros siempre, para poder darles base al empezar el día
  const ids = listaOrdenada(S.mensajeros, "nombre").filter(esRepartidor).map(m => m.id).filter(id => { const pm = pms[id]; return tipoDe(S.mensajeros[id]) === "mensajero" || pm.ps.length || pm.recs.length || pm.debe || pendM[id]; });
  const tot = { debe: 0, ef: 0, tj: 0, tc: 0 }; ids.forEach(id => { const pm = pms[id], tt = totales(pm.ps); tot.debe += pm.debe; tot.ef += tt.efectivo; tot.tj += tt.transfJs; tot.tc += tt.transfCli; });
  const recsDia = Object.values(S.recaudos).filter(r => diaDe(r.fecha) === E.diaCaja).sort((a, b) => a.fecha - b.fecha);
  const cajaDia = recsDia.reduce((a, r) => a + (Number(r.valor) || 0), 0);
  const porMedio: Record<string, number> = {}; recsDia.forEach(r => (porMedio[r.medio] = (porMedio[r.medio] || 0) + (Number(r.valor) || 0)));
  const liqs = Object.values(S.liquidaciones).sort((a, b) => b.fecha - a.fecha).slice(0, 25);
  const base = (id: string) => (yo.esAdmin ? v.abrir(<MovCaja tipo="sale" pre={{ cat: "base", personaId: id }} />) : v.abrir(<BaseDesdeOficina mid={id} />));
  const quitarRec = async (id: string) => {
    const r = S.recaudos[id]; if (!r) return; if (yaContado(r.fecha)) return avisoContado(v);
    if (!await v.confirmar("Quitar dinero recibido", `${S.mensajeros[r.mensajeroId]?.nombre || ""} · ${pesos(r.valor)} · ${hora(r.fecha)}. Se quita de la caja y vuelve a sumarse a lo que debe.`, "Quitar")) return;
    try { await borrarDe("recaudos", id); v.avisar("Entrega de dinero quitada"); } catch (e) { noSePudo(v, "No se pudo quitar")(e); }
  };
  // El asistente solo ve lo de los mensajeros y registra lo que le entregan; la caja de la empresa, los sueldos y las liquidaciones son de administración
  return <>
    <h1>Caja</h1>
    {yo.esAdmin && <><CierreDia pintar={pintar} /><CajaGeneral pintar={pintar} /></>}
    <h2>Mensajeros</h2><p className="sub">{yo.esAdmin ? "Cada mensajero lleva un período abierto que se cierra cuando lo liquidas. Lo que entregue después cuenta para el siguiente período." : "Lo que cada mensajero debe entregar. Toca “Recibir dinero” cada vez que te entregue plata."}</p>
    <div className="cifras">
      <div className="cifra fuerte"><span>Pendiente por entregar (todos)</span><b>{pesos(tot.debe)}</b></div>
      <div className="cifra"><span>Efectivo cobrado en períodos abiertos</span><b>{pesos(tot.ef)}</b></div>
      <div className="cifra"><span>Transferencias a JS (verificar en banco)</span><b>{pesos(tot.tj)}</b></div>
      <div className="cifra"><span>Pagado directo a clientes</span><b>{pesos(tot.tc)}</b></div>
    </div>
    <div style={{ height: 14 }} />
    {ids.length ? <div className="mgrid">{ids.map(id => { const pm = pms[id], tt = totales(pm.ps); return <div className="mcard" key={id}>
      <div className="mcard-top"><b>{S.mensajeros[id].nombre}</b><span className="acciones" style={{ margin: 0, gap: 6 }}><button className="btn sec chico" onClick={() => base(id)}>Dar base</button><button className="btn ok chico" onClick={() => v.abrir(<RecibirDinero mid={id} />)}>Recibir dinero</button></span></div>
      <span className="sub" style={{ fontSize: ".85rem" }}>Período desde {pm.ul ? hora(pm.ul.fecha) : "el inicio"}</span>
      <dl className="datos">
        <dt>Entregas / en ruta</dt><dd>{pm.ps.length} / {pendM[id] || 0}</dd>
        <dt>Efectivo cobrado</dt><dd>{pesos(tt.efectivo)}</dd>
        {pm.base ? <><dt>Base para vueltos</dt><dd>{pesos(pm.base)}</dd></> : null}{pm.gastos ? <><dt>Fletes / gastos pagados</dt><dd>− {pesos(pm.gastos)}</dd></> : null}
        {pm.anterior ? <><dt>Pendiente anterior</dt><dd>{pesos(pm.anterior)}</dd></> : null}<FilaAjuste a={pm.ajuste} />
        <dt>Ya entregó</dt><dd>{pesos(pm.recibido)}</dd>
        <div className="debe" style={{ display: "contents" }}><dt>Debe</dt><dd>{pesos(pm.debe)}</dd></div>
        <dt>Transf. a JS</dt><dd>{pesos(tt.transfJs)}</dd>
        <dt>Directo al cliente</dt><dd>{pesos(tt.transfCli)}</dd>
        {yo.esAdmin && <><dt>Sueldo del período</dt><dd>{sueldoTexto(id, pm.ps)}</dd></>}
      </dl>
      <div className="liq"><span className={"liq-est " + (pm.ul && pm.ul.debe > 0 ? "neg" : "")}>{pm.ul ? "Última: " + textoLiq(pm.ul.debe) : "Sin liquidaciones"}</span>{yo.esAdmin && <button className="btn chico" onClick={() => v.abrir(<Liquidar mid={id} />)}>Liquidar</button>}</div>
    </div>; })}</div> : <div className="vacio">No hay mensajeros con movimiento pendiente.</div>}
    <BloqueCajaOficina />
    <h2>Dinero recibido de mensajeros</h2>
    <div className="campo" style={{ maxWidth: 220 }}><label htmlFor="diaC">Día</label><input type="date" id="diaC" value={E.diaCaja} onChange={e => { E.diaCaja = e.target.value || hoy(); pintar(); }} /></div>
    <div className="cifras" style={{ marginBottom: 12 }}><div className="cifra fuerte"><span>Dinero recibido</span><b>{pesos(cajaDia)}</b><span>{Object.entries(porMedio).map(([m, x]) => `${MEDIOS[m as Medio] || m}: ${pesos(x)}`).join(" · ") || "Sin entregas de dinero este día"}</span></div></div>
    {recsDia.length ? <div className="tabla-env"><table><thead><tr><th>Hora</th><th>Mensajero</th><th>Medio</th><th>Nota</th><th className="n">Valor</th>{yo.esAdmin ? <th></th> : <th>Recibió</th>}</tr></thead><tbody>
      {recsDia.map(r => <tr key={r.id}><td>{hora(r.fecha)}</td><td>{S.mensajeros[r.mensajeroId]?.nombre || ""}</td><td>{MEDIOS[r.medio] || ""}{medioAntes(r)}</td><td>{r.nota || ""}</td><td className="n"><b>{pesos(r.valor)}</b></td>
        {yo.esAdmin ? <td style={{ whiteSpace: "nowrap" }}><button className="btn sec chico" onClick={() => (yaContado(r.fecha) ? avisoContado(v) : v.abrir(<EditarRecaudo id={r.id} />))}>Editar</button> <button className="btn peligro chico" onClick={() => quitarRec(r.id)}>Quitar</button></td>
          : <td>{r.porNombre || ""}{puedoCambiarMedio(r) ? <> <button className="btn sec chico" onClick={() => (yaContado(r.fecha) ? avisoContado(v) : v.abrir(<CambiarMedio col="recaudos" id={r.id} />))}>Cambiar medio</button></> : null}</td>}</tr>)}
    </tbody></table></div> : <div className="vacio">Toca “Recibir dinero” en un mensajero cada vez que te entregue plata.</div>}
    {yo.esAdmin && <h2>Liquidaciones recientes</h2>}
    {!yo.esAdmin ? (recsDia.length ? <p className="sub" style={{ marginTop: 8 }}>Si algo quedó mal registrado, avísale al administrador para que lo corrija.</p> : null)
      : liqs.length ? <div className="tabla-env"><table><thead><tr><th>Liquidado</th><th>Mensajero</th><th className="n">Entregas</th><th className="n">Entregó</th><th>Resultado</th><th></th></tr></thead><tbody>
        {liqs.map(l => <tr key={l.id}><td>{hora(l.fecha)}</td><td>{S.mensajeros[l.mensajeroId]?.nombre || ""}</td><td className="n">{l.entregas || 0}</td><td className="n">{pesos(l.recibido)}</td><td className={l.debe > 0 ? "neg" : "pos"}>{textoLiq(l.debe)}</td><td><button className="btn sec chico" onClick={() => v.abrir(<VerLiquidacion id={l.id} />)}>Ver</button></td></tr>)}
      </tbody></table></div> : <div className="vacio">Aún no has liquidado a ningún mensajero.</div>}
  </>;
}

/* ---------- Cierre del día: lo que hay que dejar listo antes del arqueo, en orden ---------- */
function CierreDia({ pintar }: { pintar: () => void }) {
  const v = useVentana(), x = pendientesCierre(), listo = !x.mens.length && !x.ofis.length && !x.sinRem.length && !x.sinServ.length;
  const abierto = E.cierreAbierto === null ? !listo || !x.arqueoHoy : E.cierreAbierto;
  const paso = (ok: boolean, titulo: string, detalle: React.ReactNode, boton?: React.ReactNode) => <div style={{ display: "flex", gap: 10, alignItems: "flex-start", padding: "10px 0", borderBottom: "1px solid var(--borde,#ddd)" }}>
    <b className={ok ? "pos" : "neg"} style={{ fontSize: "1.1rem", minWidth: 22 }}>{ok ? "✓" : "•"}</b><div style={{ flex: 1 }}><b>{titulo}</b>{detalle ? <div className="sub" style={{ fontSize: ".85rem", marginTop: 2 }}>{detalle}</div> : null}</div>{boton || null}</div>;
  const aPedidos = (f: "sin" | "serv") => {
    E.tabA = "pedidos"; E.filtroA = f; E.buscarA = ""; E.mensPedA = ""; E.diaPedA = ""; E.paginaA = 1; pintar(); scrollTo(0, 0);
    const ps = Object.values(S.pedidos).filter(f === "sin" ? p => !p.clienteId : sinServicio).sort((a, b) => b.creado - a.creado); if (ps.length) v.abrir(<EnBloque modo={f} lista={ps} />);
  };
  const arquear = async () => {
    const y = pendientesCierre();
    if ((y.mens.length || y.ofisEf.length) && !await v.confirmar("Hacer arqueo con pendientes", `Todavía ${[y.mens.length ? `hay ${y.mens.length} ${pl(y.mens.length, "mensajero")} con plata` : "", y.ofisEf.length ? `hay ${y.ofisEf.length} ${pl(y.ofisEf.length, "caja")} de oficina con efectivo sin cerrar` : ""].filter(Boolean).join(" y ")}. No cuentes esa plata: la app todavía la tiene a nombre de ellos.`, "Hacer arqueo igual")) return;
    v.abrir(<HacerArqueo />);
  };
  return <details className="mcard" id="cierreDia" open={abierto} onToggle={e => { E.cierreAbierto = (e.target as HTMLDetailsElement).open; }} style={{ marginBottom: 16 }}>
    <summary style={{ cursor: "pointer" }}><b>Cierre del día</b> <span className="sub">{listo ? (x.arqueoHoy ? "· todo listo y contado hoy" : "· listo para el arqueo") : "· hay pendientes antes del arqueo"}</span></summary>
    {paso(!x.mens.length, "1. Plata de los mensajeros", x.mens.length ? x.mens.map(({ m, debe }, i) => <span key={m.id}>{i ? " · " : ""}{m.nombre} {pesos(debe)} <button className="btn ok chico" onClick={() => v.abrir(<RecibirDinero mid={m.id} />)}>Recibir</button></span>) : "Ningún mensajero tiene plata pendiente.")}
    {paso(!x.ofis.length, "2. Cajas de oficina", x.ofis.length ? x.ofis.map(({ u, s }, i) => <span key={u.uid}>{i ? " · " : ""}{u.nombre || u.email}: {MEDIOS_K.filter(k => Math.round(s[k])).map(k => MEDIOS[k] + " " + pesos(s[k])).join(", ")} <button className="btn ok chico" onClick={() => v.abrir(<MovOficina auid={u.uid} tipo="entrega" />)}>Recibir cierre</button></span>) : "Todas en $ 0.")}
    {paso(!x.sinRem.length, "3. Pedidos sin remitente", x.sinRem.length ? `${x.sinRem.length} ${pl(x.sinRem.length, "guía")}: el saldo de esos clientes no está completo.` : "Todos tienen remitente.", x.sinRem.length ? <button className="btn sec chico" onClick={() => aPedidos("sin")}>Asignar</button> : null)}
    {paso(!x.sinServ.length, "4. Entregas sin valor de domicilio", x.sinServ.length ? `${x.sinServ.length} ${pl(x.sinServ.length, "entrega")}: no se descuenta el domicilio ni suma al sueldo.` : "Todas tienen domicilio.", x.sinServ.length ? <button className="btn sec chico" onClick={() => aPedidos("serv")}>Completar</button> : null)}
    {paso(true, "5. Gastos, adelantos o pagos que hayan quedado sin registrar", "Regístralos ahora: después del arqueo ya no se pueden poner con fecha de días anteriores.", <button className="btn sec chico" id="cdSalida" onClick={() => v.abrir(<MovCaja tipo="sale" />)}>Registrar salida</button>)}
    {paso(x.arqueoHoy, "6. Arqueo", x.arqueoHoy && x.a ? `Hecho hoy a las ${horaCorta(x.a.fecha)}: ${resultadoArqueo(x.a)}.` : (x.mens.length || x.ofisEf.length ? "Primero recibe la plata de los pasos 1 y 2: si cuentas plata que la app todavía tiene en otra parte, el arqueo sale descuadrado." : "Cuenta efectivo, Nequi, Bancolombia y la Base de JS.") + (x.enRuta.length ? ` Hay ${x.enRuta.length} ${pl(x.enRuta.length, "pedido")} en ruta: esa plata todavía no ha llegado.` : ""),
      <button className={"btn " + (x.mens.length || x.ofisEf.length ? "sec" : "ok") + " chico"} id="cdArqueo" onClick={arquear}>Hacer arqueo</button>)}
  </details>;
}

/* ---------- Caja general (solo administración) ---------- */
function CajaGeneral({ pintar }: { pintar: () => void }) {
  const v = useVentana(), R = resumenCaja();
  const delDia = R.L.filter(x => diaDe(x.fecha) === E.diaLibro);
  const ent = delDia.filter(x => x.valor > 0).reduce((a, x) => a + x.valor, 0), sal = delDia.filter(x => x.valor < 0).reduce((a, x) => a - x.valor, 0);
  const a0 = arqueosCaja()[0], mes = hoy().slice(0, 7), A = arqueosCaja().filter(a => diaDe(a.fecha).startsWith(mes));
  // solo cuenta lo que faltó o sobró en total; el reacomodo entre medios no es pérdida ni ganancia
  const falto = A.reduce((x, a) => x + Math.min(0, netoArqueo(a)), 0), sobro = A.reduce((x, a) => x + Math.max(0, netoArqueo(a)), 0);
  const ultimos = arqueosCaja().slice(0, 10);
  const quitar = async (ref: string) => {
    const [col, id] = ref.split("|") as ["recaudos" | "cajamovs", string], x = col === "recaudos" ? S.recaudos[id] : S.cajamovs[id]; if (!x) return;
    if (yaContado(x.fecha)) return avisoContado(v);
    if (!await v.confirmar("Quitar movimiento de caja", `${hora(x.fecha)} · ${pesos(x.valor)}. Se quita de la caja.`, "Quitar")) return;
    try {
      if (col === "cajamovs" && (x as CajaMov).cat === "devolucion") await quitarDevolucion(id); else await borrarDe(col, id);
      v.avisar("Movimiento quitado");
    } catch (e) { noSePudo(v, "No se pudo quitar")(e); }
  };
  const deshacer = async (id: string) => {
    const a = arqueosCaja().find(x => x.id === id); if (!a) return;
    if (!await v.confirmar("Deshacer el arqueo del " + hora(a.fecha), "Se quitan el conteo y su faltante o sobrante. La caja vuelve a quedar abierta hasta el arqueo anterior.", "Deshacer")) return;
    try { await deshacerArqueo(id); v.avisar("Arqueo deshecho"); } catch (e) { noSePudo(v, "No se pudo deshacer")(e); }
  };
  return <>
    <div className="cifras">
      <div className="cifra fuerte"><span>Total en caja</span><b>{pesos(R.total)}</b><span>{Object.entries(R.porMedio).filter(([, x]) => Math.round(x)).map(([m, x]) => `${MEDIOS_CAJA[m] || m}: ${pesos(x)}`).join(" · ") || "Sin movimientos"}</span></div>
      <div className="cifra"><span>De clientes (cuentas por pagar)</span><b>{pesos(R.porPagar)}</b><span>Se resta cuando les pagas</span></div>
      <div className="cifra"><span>Sueldos por pagar esta semana</span><b>{pesos(R.sueldosPend)}</b></div>
      <div className="cifra"><span>Disponible de JS</span><b className={R.disponible < 0 ? "neg" : ""}>{pesos(R.disponible)}</b><span>Caja − clientes − sueldos</span></div>
      <div className="cifra"><span>Todavía en manos de mensajeros</span><b>{pesos(R.enMens)}</b></div>
      <div className="cifra"><span>Cuentas por cobrar a clientes</span><b>{pesos(R.porCobrar)}</b></div>
      <div className="cifra"><span>Último arqueo</span><b>{a0 ? hora(a0.fecha) : "Nunca"}</b><span>{a0 ? resultadoArqueo(a0) : "Cuenta la plata real para comprobar que cuadra"}</span></div>
      {A.length ? <div className="cifra"><span>Faltantes y sobrantes de arqueos</span><b className={falto + sobro < 0 ? "neg" : "pos"}>{falto || sobro ? (falto + sobro < 0 ? "− " : "+ ") + pesos(Math.abs(falto + sobro)) : "$ 0"}</b><span>Este mes · faltó {pesos(-falto)} · sobró {pesos(sobro)} · {A.length} {pl(A.length, "arqueo")}</span></div> : null}
      {R.sobrantes.n ? <div className="cifra"><span>Sobrantes de cajas de oficina</span><b className="pos">{pesos(R.sobrantes.mes)}</b><span>Este mes · {R.sobrantes.n} en total ({pesos(R.sobrantes.total)})</span></div> : null}
    </div>
    <div className="acciones" style={{ margin: "14px 0" }}><button className="btn" id="cjArqueo" onClick={() => v.abrir(<HacerArqueo />)}>Hacer arqueo</button><button className="btn ok" id="cjEntra" onClick={() => v.abrir(<MovCaja tipo="entra" />)}>Registrar entrada</button><button className="btn sec" id="cjSale" onClick={() => v.abrir(<MovCaja tipo="sale" />)}>Registrar salida o gasto</button></div>
    <h2>Movimientos de caja</h2>
    <div className="campo" style={{ maxWidth: 220 }}><label htmlFor="diaL">Día</label><input type="date" id="diaL" value={E.diaLibro} onChange={e => { E.diaLibro = e.target.value || hoy(); pintar(); }} /></div>
    {delDia.length ? <div className="tabla-env"><table><thead><tr><th>Hora</th><th>Concepto</th><th>Tipo</th><th>Medio</th><th className="n">Valor</th><th></th></tr></thead><tbody>
      {delDia.map((x, i) => <tr key={(x.ref || "") + i}><td>{hora(x.fecha)}</td><td>{x.concepto}</td><td>{x.cat}</td><td>{MEDIOS_CAJA[x.medio] || ""}</td><td className={"n " + (x.valor < 0 ? "neg" : "pos")}>{pesos(x.valor)}</td><td>{x.ref ? <button className="btn peligro chico" onClick={() => quitar(x.ref!)}>Quitar</button> : null}</td></tr>)}
      <tr><td></td><td><b>Entradas {pesos(ent)} · Salidas {pesos(sal)}</b></td><td></td><td></td><td className="n"><b>{pesos(ent - sal)}</b></td><td></td></tr>
    </tbody></table></div> : <div className="vacio">Sin movimientos de caja este día.</div>}
    {ultimos.length ? <><h2>Arqueos</h2><div className="tabla-env"><table><thead><tr><th>Fecha</th>{MEDIOS_K.map(k => <th className="n" key={k}>{MEDIOS[k]}<br /><small>contado / esperado</small></th>)}<th>Resultado</th><th>Contó</th><th></th></tr></thead><tbody>
      {ultimos.map((a, i) => <tr key={a.id}><td>{hora(a.fecha)}{a.nota ? <><br /><span className="sub" style={{ fontSize: ".8rem" }}>{a.nota}</span></> : null}</td>
        {MEDIOS_K.map(k => <td className="n" key={k}>{a.contado ? pesos(a.contado[k]) : "—"}<br /><span className="sub" style={{ fontSize: ".8rem" }}>{a.esperado ? pesos(a.esperado[k]) : ""}</span></td>)}
        <td className={netoArqueo(a) < 0 ? "neg" : "pos"}>{resultadoArqueo(a)}</td><td>{a.por || ""}</td><td>{i === 0 ? <button className="btn sec chico" onClick={() => deshacer(a.id)}>Deshacer</button> : null}</td></tr>)}
    </tbody></table></div></> : null}
  </>;
}

/** Arqueo: el conteo real de la plata. La diferencia queda como faltante o sobrante y lo contado ya no se cambia. */
function HacerArqueo() {
  const v = useVentana(), { e, of, sinCuenta } = esperadoArqueo(), conOf = Object.values(of).some(x => Math.round(x));
  const [c, setC] = useState<Record<string, string>>({ efectivo: "", nequi: "", bancolombia: "" }), [nota, setNota] = useState(""), [guardando, setGuardando] = useState(false);
  const esp = Object.values(e).reduce((x, y) => x + y, 0), tot = Object.values(c).reduce((x, y) => x + (Number(y) || 0), 0), dt = Math.round(tot - esp);
  const todo = Object.values(c).every(x => x !== ""), mueve = MEDIOS_K.some(k => c[k] !== "" && Math.round(Number(c[k]) - e[k]));
  const guardar = async () => {
    if (Object.values(c).some(x => x === "")) return v.avisar("Escribe lo que contaste en cada medio (0 si no hay nada)");
    if (Object.values(c).some(x => Number(x) < 0)) return v.avisar("Los valores no pueden ser negativos");
    setGuardando(true);
    const contado = Object.fromEntries(Object.entries(c).map(([k, x]) => [k, Math.round(Number(x))]));
    try { await arqueo(e, contado, nota.trim()); v.cerrar(); const a = arqueosCaja()[0]; v.avisar("Arqueo guardado: " + (a ? resultadoArqueo(a) : "listo")); }
    catch (err) { setGuardando(false); noSePudo(v, "No se pudo guardar el arqueo")(err); }
  };
  return <>
    <Cab sub={<span className="sub">Cuenta la plata que tienes ahora mismo</span>}><h2>Arqueo de caja</h2></Cab>
    <p className="sub">Escribe lo que cuentas en cada medio: el efectivo en la mano y el saldo que ves en la app de Nequi y de Bancolombia. La diferencia queda registrada como faltante o sobrante y desde ese momento esa plata ya no se puede cambiar.</p>
    {sinCuenta ? <div className="aviso alerta">Hay {pesos(sinCuenta)} en transferencias a JS sin cuenta asignada. Antes del arqueo, abre esos pedidos y elige si llegaron a Nequi o a Bancolombia.</div> : null}
    {conOf ? <div className="aviso">No cuentes el efectivo que tienen las cajas de oficina ({pesos(of.efectivo)}): ese se cuenta cuando recibes el cierre de cada asistente. Nequi y Bancolombia sí cuéntalos completos, como los ves en su app.</div> : null}
    {MEDIOS_K.map((k, i) => { const d = c[k] === "" ? null : Math.round(Number(c[k]) - e[k]); return <div className="linea2" style={{ alignItems: "center" }} key={k}>
      <div className="campo"><label htmlFor={"aq_" + k}>{MEDIOS[k]} que cuentas</label><input id={"aq_" + k} type="number" inputMode="numeric" min="0" step="100" autoFocus={i === 0} value={c[k]} onChange={ev => setC({ ...c, [k]: ev.target.value })} /></div>
      <div className="campo"><span className="lbl">La app espera</span><b style={{ fontSize: "1.1rem" }}>{pesos(e[k])}</b><span className="sub" style={{ margin: 0 }}>{d === null ? "" : d === 0 ? <b className="pos">Cuadra</b> : d < 0 ? <b className="neg">Falta {pesos(-d)}</b> : <b className="pos">Sobra {pesos(d)}</b>}</span></div></div>; })}
    <div className={"res-liq " + (!todo ? "cero" : dt < 0 ? "debe" : dt > 0 ? "sobra" : "cero")} style={{ margin: "6px 0 12px" }}>
      {Object.values(c).some(x => x !== "") ? <><span>Total contado {pesos(tot)} · esperado {pesos(esp)}</span><b>{!todo ? "Escribe los tres medios" : dt === 0 ? (mueve ? "La plata da exacto: cada medio queda como lo contaste" : "Cuadra exacto") : dt < 0 ? "Falta " + pesos(-dt) + " en total" : "Sobra " + pesos(dt) + " en total"}</b></> : <><span>Total</span><b>La app espera {pesos(esp)}</b></>}
    </div>
    <div className="campo"><label htmlFor="aqNota">Nota (opcional)</label><input id="aqNota" placeholder="Ej: arqueo de cierre del sábado" value={nota} onChange={ev => setNota(ev.target.value)} /></div>
    <button className="btn ok" id="aqGuardar" style={{ width: "100%" }} disabled={guardando} onClick={guardar}>Guardar arqueo</button>
  </>;
}

/** Registrar una entrada o salida de la caja general (gasto, base, arriendo, adelanto, sueldo…). */
export function MovCaja({ tipo, pre = {} }: { tipo: "entra" | "sale"; pre?: { cat?: string; personaId?: string; valor?: number; semana?: string; dia?: string } }) {
  const v = useVentana(), personas = listaOrdenada(S.mensajeros, "nombre");
  const [cat, setCat] = useState(pre.cat || CATS_TIPO[tipo][0]), [per, setPer] = useState(pre.personaId || ""), [val, setVal] = useState(pre.valor && pre.valor > 0 ? String(Math.round(pre.valor)) : "");
  const sems = semanasSueldo(pre.semana);
  const [medio, setMedio] = useState<Medio>("efectivo"), [sem, setSem] = useState(pre.semana || sems[0]?.[0] || ""), [dia, setDia] = useState(pre.dia || hoy()), [con, setCon] = useState(""), [guardando, setGuardando] = useState(false);
  const conPersona = CATS_PERSONA.includes(cat), conSemana = CATS_SEMANA.includes(cat);
  const guardar = async () => {
    const valor = Number(val); if (!(valor > 0)) return v.avisar("Escribe un valor mayor a cero"); if (conPersona && !per) return v.avisar("Elige la persona");
    const d = dia || hoy(); if (diaAntesDelArqueo(v, d)) return;
    setGuardando(true);
    try { await movCaja({ tipo, cat, personaId: conPersona ? per : "", valor, medio, concepto: con.trim(), fecha: fechaCaja(d), semana: conSemana ? sem : "" }); v.cerrar(); v.avisar((CATS[cat] || "Movimiento") + " registrado"); }
    catch (e) { setGuardando(false); noSePudo(v, "No se pudo guardar")(e); }
  };
  return <>
    <Cab><h2>{tipo === "entra" ? "Registrar entrada" : "Registrar salida"}</h2></Cab>
    <div className="linea2"><div className="campo"><label htmlFor="cjCat">Tipo</label><select id="cjCat" value={cat} onChange={e => setCat(e.target.value)}>{CATS_TIPO[tipo].map(k => <option key={k} value={k}>{CATS[k]}</option>)}</select></div>
      <div className={"campo " + (conPersona ? "" : "oculto")} id="cjPerC"><label htmlFor="cjPer">Persona</label><select id="cjPer" value={per} onChange={e => setPer(e.target.value)}><option value="">Elige…</option>{personas.map(m => <option key={m.id} value={m.id}>{m.nombre}</option>)}</select></div></div>
    <div className="linea2"><div className="campo"><label htmlFor="cjVal">Valor</label><input id="cjVal" type="number" inputMode="numeric" min="0" step="1000" autoFocus value={val} onChange={e => setVal(e.target.value)} /></div>
      <div className="campo"><label htmlFor="cjMedio">Medio</label><select id="cjMedio" value={medio} onChange={e => setMedio(e.target.value as Medio)}>{MEDIOS_K.map(k => <option key={k} value={k}>{MEDIOS[k]}</option>)}</select></div></div>
    <div className={"campo " + (conSemana ? "" : "oculto")} id="cjSemC"><label htmlFor="cjSem">Semana del sueldo</label><select id="cjSem" value={sem} onChange={e => setSem(e.target.value)}>{sems.map(([w, t]) => <option key={w} value={w}>{t}</option>)}</select></div>
    <div className="linea2"><div className="campo"><label htmlFor="cjDia">Día en que salió o entró la plata</label><input id="cjDia" type="date" value={dia} min={diaMinCaja()} max={hoy()} onChange={e => setDia(e.target.value)} /></div>
      <div className="campo"><label htmlFor="cjCon">Detalle (opcional)</label><input id="cjCon" placeholder="Ej: gasolina, arriendo de mayo" value={con} onChange={e => setCon(e.target.value)} /></div></div>
    <button className={"btn " + (tipo === "entra" ? "ok" : "")} id="cjGuardar" style={{ width: "100%" }} disabled={guardando} onClick={guardar}>Guardar</button>
  </>;
}

/* ---------- Mensajeros: recibir dinero, liquidar ---------- */
export function RecibirDinero({ mid }: { mid: string }) {
  const v = useVentana(), m = S.mensajeros[mid], pm = periodoMensajero(mid);
  const [val, setVal] = useState(pm.debe > 0 ? String(pm.debe) : ""), [medio, setMedio] = useState<Medio>("efectivo"), [nota, setNota] = useState(""), [guardando, setGuardando] = useState(false);
  if (!m) return null;
  const guardar = async () => {
    const valor = Number(val); if (!(valor > 0)) return v.avisar("Escribe un valor mayor a cero");
    setGuardando(true);
    try { await recibirDinero({ mensajeroId: mid, valor, medio, nota: nota.trim() }); const falta = pm.debe - valor; v.cerrar();
      v.avisar(`Recibido ${pesos(valor)} de ${m.nombre}. ${falta > 0 ? "Le falta " + pesos(falta) : falta < 0 ? "Entregó " + pesos(-falta) + " de más" : "Quedó a paz y salvo"}`); }
    catch (e) { setGuardando(false); noSePudo(v, "No se pudo guardar")(e); }
  };
  return <>
    <Cab sub={<span className="sub">{m.nombre}</span>}><h2>Recibir dinero</h2></Cab>
    <dl className="datos"><dt>Efectivo cobrado</dt><dd>{pesos(pm.efectivo)}</dd>{pm.base ? <><dt>Base para vueltos</dt><dd>{pesos(pm.base)}</dd></> : null}{pm.gastos ? <><dt>Fletes / gastos pagados</dt><dd>− {pesos(pm.gastos)}</dd></> : null}
      {pm.anterior ? <><dt>Pendiente anterior</dt><dd>{pesos(pm.anterior)}</dd></> : null}<FilaAjuste a={pm.ajuste} /><dt>Ya entregó</dt><dd>{pesos(pm.recibido)}</dd><dt>Debe</dt><dd className="neg">{pesos(pm.debe)}</dd></dl>
    <div className="linea2"><div className="campo"><label htmlFor="rVal">Valor que entrega</label><input id="rVal" type="number" inputMode="numeric" min="0" step="1000" autoFocus value={val} onFocus={e => e.target.select()} onChange={e => setVal(e.target.value)} /></div>
      <div className="campo"><label htmlFor="rMedio">Medio</label><select id="rMedio" value={medio} onChange={e => setMedio(e.target.value as Medio)}>{MEDIOS_K.map(k => <option key={k} value={k}>{MEDIOS[k]}</option>)}</select></div></div>
    <div className="campo"><label htmlFor="rNota">Nota (opcional)</label><input id="rNota" placeholder="Ej: primera entrega de la tarde" value={nota} onChange={e => setNota(e.target.value)} /></div>
    <button className="btn ok" id="rGuardar" style={{ width: "100%" }} disabled={guardando} onClick={guardar}>Registrar entrega de dinero</button>
  </>;
}

function EditarRecaudo({ id }: { id: string }) {
  const v = useVentana(), r = S.recaudos[id];
  const [val, setVal] = useState(String(Number(r?.valor) || "")), [medio, setMedio] = useState<Medio>(r?.medio || "efectivo"), [nota, setNota] = useState(r?.nota || ""), [guardando, setGuardando] = useState(false);
  if (!r) return null;
  const guardar = async () => {
    const valor = Number(val); if (!(valor > 0)) return v.avisar("Escribe un valor mayor a cero");
    setGuardando(true);
    try { await recibirDinero({ mensajeroId: r.mensajeroId, valor, medio, nota: nota.trim(), fecha: r.fecha }, id); v.cerrar(); v.avisar("Entrega de dinero corregida"); }
    catch (e) { setGuardando(false); noSePudo(v, "No se pudo guardar")(e); }
  };
  return <>
    <Cab sub={<span className="sub">{S.mensajeros[r.mensajeroId]?.nombre || ""} · {hora(r.fecha)}</span>}><h2>Editar dinero recibido</h2></Cab>
    {yaLiquidado(r.mensajeroId, r.fecha) ? <div className="aviso">Esta entrega de dinero ya está en una liquidación cerrada: si la corriges, la diferencia pasa sola a lo que debe en su período abierto.</div> : null}
    <div className="linea2"><div className="campo"><label htmlFor="erVal">Valor que entregó</label><input id="erVal" type="number" inputMode="numeric" min="0" step="1000" autoFocus value={val} onChange={e => setVal(e.target.value)} /></div>
      <div className="campo"><label htmlFor="erMedio">Medio</label><select id="erMedio" value={medio} onChange={e => setMedio(e.target.value as Medio)}>{MEDIOS_K.map(k => <option key={k} value={k}>{MEDIOS[k]}</option>)}</select></div></div>
    <div className="campo"><label htmlFor="erNota">Nota (opcional)</label><input id="erNota" value={nota} onChange={e => setNota(e.target.value)} /></div>
    <button className="btn ok" id="erGuardar" style={{ width: "100%" }} disabled={guardando} onClick={guardar}>Guardar cambios</button>
  </>;
}

/** El asistente corrige el medio de un pago o una entrega que registró, hasta 24 horas después. Administración ve el cambio. */
export function CambiarMedio({ col, id }: { col: "recaudos" | "movimientos"; id: string }) {
  const v = useVentana(), x = col === "recaudos" ? S.recaudos[id] : S.movimientos[id];
  const [medio, setMedio] = useState<Medio>((x?.medio || "efectivo") as Medio), [guardando, setGuardando] = useState(false);
  if (!x) return null;
  const quien = col === "recaudos" ? "Entrega de " + (S.mensajeros[S.recaudos[id].mensajeroId]?.nombre || "")
    : (S.movimientos[id].tipo === "pago_de_cliente" ? "Pago de " : S.movimientos[id].tipo === "pago_a_cliente" ? "Pago a " : "Compra para ") + nombreCliente(S.movimientos[id].clienteId);
  const guardar = async () => {
    if (medio === x.medio) return v.cerrar();
    setGuardando(true);
    try { await cambiarMedio(col, id, medio); v.cerrar(); v.avisar(`Quedó en ${MEDIOS[medio]}`); } catch (e) { setGuardando(false); noSePudo(v, "No se pudo cambiar")(e); }
  };
  return <>
    <Cab sub={<span className="sub">{quien} · {pesos(x.valor)} · {hora(x.fecha)}</span>}><h2>Cambiar medio</h2></Cab>
    <p className="sub">Está como <b>{MEDIOS[x.medio as Medio] || "sin medio"}</b>. Administración verá el cambio.</p>
    <div className="campo"><label htmlFor="cmMedio">Medio correcto</label><select id="cmMedio" value={medio} onChange={e => setMedio(e.target.value as Medio)}>{MEDIOS_K.map(k => <option key={k} value={k}>{MEDIOS[k]}</option>)}</select></div>
    <button className="btn" id="cmGuardar" style={{ width: "100%" }} disabled={guardando} onClick={guardar}>Guardar</button>
  </>;
}

function Liquidar({ mid }: { mid: string }) {
  const v = useVentana(), m = S.mensajeros[mid], pm = periodoMensajero(mid), t = totales(pm.ps), sueldo = ganaPorcentaje(m) ? sueldoPedidos(pm.ps) : 0;
  const enRuta = Object.values(S.pedidos).filter(p => p.estado === "pendiente" && p.mensajeroId === mid).length, sinValor = pm.ps.filter(p => !Number(p.valorServicio)).length;
  const sems = semanasAdelanto();
  const [val, setVal] = useState(String(pm.debe > 0 ? pm.debe : 0)), [medio, setMedio] = useState<Medio>("efectivo"), [conAdel, setConAdel] = useState(true), [sem, setSem] = useState(sems[0][0]), [guardando, setGuardando] = useState(false);
  if (!m) return null;
  // adelanto = lo que queda debiendo, sin pasar del sueldo que le falta por cobrar esa semana (el sueldo no puede quedar negativo)
  const adelanto = (d: number) => (d > 0 && conAdel ? Math.max(0, Math.min(d, Math.round(sueldoPersonaSemana(mid, sem).neto))) : 0);
  const d = pm.debe - (Number(val) || 0), adel = adelanto(d), resto = d - adel;
  const guardar = async () => {
    const valor = Number(val) || 0; if (valor < 0) return v.avisar("El valor no puede ser negativo");
    setGuardando(true);
    try {
      const queda = pm.debe - valor, ad = adelanto(queda);
      const id = await liquidar({ mensajeroId: mid, desde: pm.desde, dia: hoy(), entregas: pm.ps.length, guias: pm.ps.map(p => p.guia), efectivo: t.efectivo, base: pm.base, gastos: pm.gastos, anterior: pm.anterior,
        recibidoAntes: pm.recibido, entregaFinal: valor, recibido: pm.recibido + valor, debe: queda - ad, adelanto: ad, ajuste: pm.ajuste, transfJs: t.transfJs, transfCli: t.transfCli, sueldo, enRuta, medio, semanaAdelanto: ad ? sem : "" });
      v.avisar(`${m.nombre}: ${ad ? "adelanto de " + pesos(ad) + " en su sueldo" : textoLiq(queda).toLowerCase()}`); v.abrir(<VerLiquidacion id={id} />);
    } catch (e) { setGuardando(false); noSePudo(v, "No se pudo guardar")(e); }
  };
  return <>
    <Cab sub={<span className="sub">{m.nombre} · desde {pm.ul ? hora(pm.ul.fecha) : "el inicio"} hasta ahora</span>}><h2>Liquidar período</h2></Cab>
    {enRuta ? <div className="aviso">Tiene {enRuta} {pl(enRuta, "pedido")} en ruta. Cuando los entregue, contarán para el siguiente período.</div> : null}
    {sinValor ? <div className="aviso">{sinValor} {pl(sinValor, "entrega")} sin valor de servicio: el sueldo puede salir más bajo.</div> : null}
    <dl className="datos">
      <dt>Entregas</dt><dd>{pm.ps.length}</dd>
      <dt>Efectivo cobrado</dt><dd>{pesos(t.efectivo)}</dd>
      {pm.base ? <><dt>Base para vueltos</dt><dd>{pesos(pm.base)}</dd></> : null}{pm.gastos ? <><dt>Fletes / gastos pagados</dt><dd>− {pesos(pm.gastos)}</dd></> : null}
      {pm.anterior ? <><dt>Pendiente de la liquidación anterior</dt><dd>{pesos(pm.anterior)}</dd></> : null}<FilaAjuste a={pm.ajuste} />
      <dt>Ya entregó</dt><dd>{pesos(pm.recibido)}</dd>
      <dt>Pendiente por entregar</dt><dd className="neg">{pesos(pm.debe)}</dd>
      <dt>Transferencias a JS</dt><dd>{pesos(t.transfJs)}</dd>
      <dt>Pagado directo al cliente</dt><dd>{pesos(t.transfCli)}</dd>
      <dt>Sueldo del período</dt><dd>{ganaPorcentaje(m) ? pesos(sueldo) : sueldoTexto(mid, pm.ps)}</dd>
    </dl>
    <div className="linea2"><div className="campo"><label htmlFor="lVal">Entrega final (lo que te da ahora)</label><input id="lVal" type="number" inputMode="numeric" min="0" step="1000" autoFocus value={val} onFocus={e => e.target.select()} onChange={e => setVal(e.target.value)} /></div>
      <div className="campo"><label htmlFor="lMedio">Medio</label><select id="lMedio" value={medio} onChange={e => setMedio(e.target.value as Medio)}>{MEDIOS_K.map(k => <option key={k} value={k}>{MEDIOS[k]}</option>)}</select></div></div>
    <div className={"res-liq " + (resto > 0 ? "debe" : d < 0 ? "sobra" : "cero")} id="lRes"><span>Resultado</span><b>{adel ? (resto > 0 ? "Adelanto de " + pesos(adel) + " · sigue debiendo " + pesos(resto) : "Quedó en $ 0 · adelanto de " + pesos(adel)) : d > 0 && conAdel ? textoLiq(d) + " (no tiene sueldo por cobrar esa semana)" : textoLiq(d)}</b></div>
    <div id="lAdelC" className={d > 0 ? "" : "oculto"} style={{ margin: "10px 0" }}><label style={{ display: "flex", gap: 8, alignItems: "flex-start" }}><input type="checkbox" id="lAdel" checked={conAdel} onChange={e => setConAdel(e.target.checked)} style={{ width: "auto", marginTop: 3 }} /><span>Pasar lo que queda debiendo a <b>adelanto de sueldo</b>, hasta lo que tiene por cobrar de sueldo esa semana. Si debe más, el resto queda pendiente para el próximo período.</span></label>
      <div className="campo" style={{ marginTop: 6 }}><label htmlFor="lSem">Descontar del sueldo de la semana</label><select id="lSem" value={sem} disabled={!conAdel} onChange={e => setSem(e.target.value)}>{sems.map(([w, tx]) => <option key={w} value={w}>{tx}</option>)}</select></div></div>
    <button className="btn ok" id="lGuardar" style={{ width: "100%" }} disabled={guardando} onClick={guardar}>Liquidar y cerrar período</button>
  </>;
}

export function VerLiquidacion({ id }: { id: string }) {
  useDatos();
  const v = useVentana(), l = S.liquidaciones[id];
  if (!l) return <div className="vacio">Esta liquidación ya no existe.</div>;
  const nom = S.mensajeros[l.mensajeroId]?.nombre || "Mensajero", esUltima = liquidacionesDe(l.mensajeroId)[0]?.id === id, ps = (l.guias || []).map(g => S.pedidos[g]).filter(Boolean);
  const reabrir = async () => { try { await reabrirLiquidacion(id); v.avisar("Período reabierto"); v.cerrar(); } catch (e) { noSePudo(v, "No se pudo reabrir")(e); } };
  return <>
    <Cab sub={<span className="sub">{nom} · {l.desde ? "desde " + hora(l.desde) + " " : ""}hasta {hora(l.fecha)}</span>}><h2>Liquidación</h2></Cab>
    <div className={"res-liq " + (l.debe > 0 ? "debe" : l.debe < 0 ? "sobra" : "cero")}><span>Resultado</span><b>{textoLiq(l.debe)}{l.adelanto ? " · adelanto de " + pesos(l.adelanto) : ""}</b></div>
    <dl className="datos">
      <dt>Entregas</dt><dd>{l.entregas}</dd>
      <dt>Efectivo cobrado</dt><dd>{pesos(l.efectivo)}</dd>
      {l.base ? <><dt>Base para vueltos</dt><dd>{pesos(l.base)}</dd></> : null}
      {l.gastos ? <><dt>Fletes / gastos pagados</dt><dd>− {pesos(l.gastos)}</dd></> : null}
      {l.anterior ? <><dt>Pendiente anterior</dt><dd>{pesos(l.anterior)}</dd></> : null}
      {l.ajuste ? <><dt>Correcciones a liquidaciones anteriores</dt><dd>{ajusteTxt(l.ajuste)}</dd></> : null}
      <dt>Entregó durante el período</dt><dd>{pesos(l.recibidoAntes ?? l.recibido)}</dd>
      <dt>Entrega final</dt><dd>{pesos(l.entregaFinal || 0)}</dd>
      <dt>Total entregado</dt><dd>{pesos(l.recibido)}</dd>
      {l.adelanto ? <><dt>Pasado a adelanto de sueldo</dt><dd className="neg">{pesos(l.adelanto)}</dd></> : null}
      <dt>Transferencias a JS</dt><dd>{pesos(l.transfJs)}</dd>
      <dt>Pagado directo al cliente</dt><dd>{pesos(l.transfCli)}</dd>
      <dt>Sueldo del período</dt><dd>{pesos(l.sueldo)}</dd>
    </dl>
    {ps.length ? <><h2>Entregas incluidas</h2><TablaEntregas ps={ps} conCliente /></> : null}
    {esUltima && <><div className="acciones" style={{ marginTop: 14 }}><button className="btn peligro chico" id="lReabrir" onClick={reabrir}>Reabrir período</button></div>
      <p className="sub" style={{ marginTop: 8, fontSize: ".85rem" }}>Reabrir borra esta liquidación y junta sus entregas con el período actual. El dinero recibido se conserva en la caja.{l.adelanto ? " El adelanto que salió de esta liquidación se quita del sueldo." : ""}</p></>}
  </>;
}

/* ---------- Cajas de oficina: la plata que maneja cada asistente ---------- */
function TarjetaCajaOficina({ u, dia }: { u: Pick<UsuarioS, "uid" | "nombre" | "email">; dia: string }) {
  const v = useVentana(), C = cajaOficina(u.uid), hasta = sumaMedios(C.L.filter(x => diaDe(x.fecha) <= dia)), delDia = C.L.filter(x => diaDe(x.fecha) === dia), ahora = dia === hoy();
  const quitar = async (ref: string) => {
    if (yaContado(S.cajamovs[ref]?.fecha)) return avisoContado(v);
    if (!await v.confirmar("Quitar movimiento de la caja de oficina", "Se quita la base o el cierre registrado.", "Quitar")) return;
    try { await borrarDe("cajamovs", ref); v.avisar("Movimiento quitado"); } catch (e) { noSePudo(v, "No se pudo quitar")(e); }
  };
  return <div className="mcard"><div className="mcard-top"><b>{yo.esAdmin ? u.nombre || u.email : "Mi caja de oficina"}</b>
    {yo.esAdmin ? <span className="acciones" style={{ margin: 0, gap: 6 }}><button className="btn sec chico" onClick={() => v.abrir(<MovOficina auid={u.uid} tipo="base" />)}>Dar base</button><button className="btn ok chico" onClick={() => v.abrir(<MovOficina auid={u.uid} tipo="entrega" />)}>Recibir cierre</button></span>
      : <span className="acciones" style={{ margin: 0 }}><button className="btn sec chico" onClick={() => v.abrir(<BaseDesdeOficina />)}>Dar base a un mensajero</button></span>}</div>
    <span className="sub" style={{ fontSize: ".85rem" }}>{ahora ? "Lo que tiene ahora y debe entregar al cierre" : "Lo que tenía al final de ese día"}</span>
    <dl className="datos">{MEDIOS_K.map(k => <span key={k} style={{ display: "contents" }}><dt>{MEDIOS[k]}</dt><dd className={hasta[k] < 0 ? "neg" : ""}>{pesos(hasta[k])}</dd></span>)}
      <div className="debe" style={{ display: "contents" }}><dt>Total</dt><dd>{pesos(hasta.efectivo + hasta.nequi + hasta.bancolombia)}</dd></div></dl>
    {delDia.length ? <div className="tabla-env" style={{ marginTop: 8 }}><table><tbody>{delDia.map((x, i) => <tr key={i}><td>{horaCorta(x.fecha)}</td><td>{x.concepto}</td><td>{MEDIOS[x.medio]}</td><td className={"n " + (x.valor < 0 ? "neg" : "pos")}>{x.valor < 0 ? "− " : "+ "}{pesos(Math.abs(x.valor))}</td>
      {yo.esAdmin && x.ref ? <td><button className="btn peligro chico" onClick={() => quitar(x.ref!)}>Quitar</button></td> : yo.esAdmin ? <td></td> : null}</tr>)}</tbody></table></div> : <p className="sub">Sin movimientos este día.</p>}
  </div>;
}
function BloqueCajaOficina() {
  if (yo.esAdmin) {
    const as = asistentes(); if (!as.length) return null;
    return <><h2>Caja de oficina</h2><p className="sub">Lo que maneja cada asistente en efectivo, Nequi y Bancolombia: la base que le das, más lo que recibe (mensajeros, pagos de clientes, domicilios), menos las bases que da a los mensajeros, las compras que paga y lo que les paga a los clientes, menos lo que te entrega al cierre.</p>
      <div className="mgrid">{as.map(u => <TarjetaCajaOficina key={u.uid} u={u} dia={E.diaCaja} />)}</div></>;
  }
  if (yo.esAsistente && yo.uid) return <><h2>Mi caja de oficina</h2><p className="sub">Tu base más lo que recibes, menos las bases que das a los mensajeros y lo que les pagas a los clientes. Al final del día entrega a administración lo que dice cada medio.</p>
    <div className="mgrid"><TarjetaCajaOficina u={{ uid: yo.uid, nombre: yo.nombre, email: "" }} dia={E.diaCaja} /></div></>;
  return null;
}
/** Dar base a un asistente o recibir su cierre. Al cierre, lo que pasa de lo que debía tener en efectivo es sobrante; en Nequi y Bancolombia se deja en $ 0. */
function MovOficina({ auid, tipo }: { auid: string; tipo: "base" | "entrega" }) {
  const v = useVentana(), u = S.usuarios[auid], C = cajaOficina(auid), base = tipo === "base";
  const [vals, setVals] = useState<Record<Medio, string>>({ efectivo: base ? "" : C.saldo.efectivo > 0 ? String(C.saldo.efectivo) : "", nequi: !base && C.saldo.nequi > 0 ? String(C.saldo.nequi) : "", bancolombia: !base && C.saldo.bancolombia > 0 ? String(C.saldo.bancolombia) : "" });
  const [nota, setNota] = useState(""), [guardando, setGuardando] = useState(false);
  const medios: Medio[] = base ? ["efectivo"] : MEDIOS_K;
  const entregas = medios.map(m => [m, Number(vals[m]) || 0] as [Medio, number]);
  const excesos = base ? [] : entregas.map(([m, x]) => [m, Math.round(x - C.saldo[m])] as [Medio, number]).filter(([, x]) => x > 0);
  const sobs = excesos.filter(([m]) => m === "efectivo"), nivs = excesos.filter(([m]) => m !== "efectivo"), sb = new Map(sobs), nv = new Map(nivs);
  const guardar = async () => {
    if (entregas.some(([, x]) => x < 0)) return v.avisar("Los valores no pueden ser negativos");
    const pos = entregas.filter(([, x]) => x > 0);
    if (!pos.length && !sobs.length && !nivs.length) return v.avisar("Escribe un valor mayor a cero");
    setGuardando(true); const t = Date.now(), quien = u?.nombre || u?.email || "", n = nota.trim();
    try {
      if (base) for (const [medio, valor] of pos) await movCaja({ tipo: "base", cat: "oficina", personaUid: auid, personaId: "", valor, medio, concepto: n, fecha: t + 1 });
      else await cierreOficina(auid, { efectivo: Number(vals.efectivo) || 0, nequi: Number(vals.nequi) || 0, bancolombia: Number(vals.bancolombia) || 0 }, n, [
        ...sobs.map(([medio, valor]) => ({ tipo: "entra" as const, cat: "sobrante", personaUid: auid, personaId: "", valor, medio, concepto: quien + (n ? " · " + n : ""), fecha: t })),
        ...nivs.map(([medio, valor]) => ({ tipo: "base" as const, cat: "oficina", nivel: true, personaUid: auid, personaId: "", valor, medio, concepto: "Pagó desde la cuenta de la empresa más de lo que registró que entró", fecha: t })),
        ...pos.map(([medio, valor]) => ({ tipo: "sale" as const, cat: "oficina", personaUid: auid, personaId: "", valor, medio, concepto: n, fecha: t + 1 })),
      ]);
      v.cerrar(); v.avisar((base ? "Base entregada: " : "Cierre recibido: ") + (pos.map(([m, x]) => MEDIOS[m] + " " + pesos(x)).join(" · ") || "sin entrega") + (sobs.length ? " · Sobrante: " + sobs.map(([m, x]) => MEDIOS[m] + " " + pesos(x)).join(" · ") : ""));
    } catch (e) { setGuardando(false); noSePudo(v, "No se pudo guardar")(e); }
  };
  return <>
    <Cab sub={<span className="sub">{u?.nombre || u?.email || ""} · tiene {MEDIOS_K.map(k => MEDIOS[k] + " " + pesos(C.saldo[k])).join(" · ")}</span>}><h2>{base ? "Dar base de caja" : "Recibir cierre de caja"}</h2></Cab>
    <p className="sub">{base ? "Efectivo que le entregas para trabajar y dar base a los mensajeros." : "Lo que te entrega en cada medio. Viene lleno con lo que debe tener; cámbialo si te entrega otra cosa (por ejemplo, si le dejas base para mañana). Si en efectivo está en negativo o te entrega de más, sobró plata: se registra como sobrante. Nequi y Bancolombia son las mismas cuentas de la empresa: si quedan en negativo es porque pagó desde ellas más de lo que registró que entró; se dejan en $ 0 sin tocar la caja."}</p>
    {base ? <div className="campo"><label htmlFor="of_efectivo">Valor (efectivo)</label><input id="of_efectivo" type="number" inputMode="numeric" min="0" step="1000" autoFocus value={vals.efectivo} onChange={e => setVals({ ...vals, efectivo: e.target.value })} /></div>
      : <div className="linea2">{MEDIOS_K.map((k, i) => <div className="campo" style={{ minWidth: 120 }} key={k}><label htmlFor={"of_" + k}>{MEDIOS[k]}</label><input id={"of_" + k} type="number" inputMode="numeric" min="0" step="1000" autoFocus={i === 0} value={vals[k]} onChange={e => setVals({ ...vals, [k]: e.target.value })} /></div>)}</div>}
    {!base && <div id="ofRes" className="sub" style={{ margin: "-4px 0 10px" }}>{entregas.map(([m, x], i) => { const queda = Math.round(C.saldo[m] - x); return <span key={m}>{i ? " · " : ""}{MEDIOS[m]}: {sb.has(m) ? <><b className="pos">sobrante {pesos(sb.get(m)!)}</b>, queda en $ 0</> : nv.has(m) ? `pagó ${pesos(nv.get(m)!)} más de lo que entró; queda en $ 0 (no es sobrante)` : queda ? `queda ${pesos(queda)} en su caja` : "queda en $ 0"}</span>; })}</div>}
    <div className="campo"><label htmlFor="ofNota">Nota (opcional)</label><input id="ofNota" placeholder={base ? "Ej: base del día" : "Ej: cierre del día"} value={nota} onChange={e => setNota(e.target.value)} /></div>
    <button className={"btn " + (base ? "" : "ok")} id="ofGuardar" style={{ width: "100%" }} disabled={guardando} onClick={guardar}>{base ? "Entregar base" : "Registrar cierre"}</button>
  </>;
}
/** Base para vueltos que el asistente le da a un mensajero desde su caja de oficina (en efectivo, con la hora del momento). */
function BaseDesdeOficina({ mid: mid0 }: { mid?: string }) {
  const v = useVentana(), elegir = !mid0, ms = listaOrdenada(S.mensajeros, "nombre").filter(x => esRepartidor(x) && tipoDe(x) === "mensajero"), C = cajaOficina(yo.uid);
  const [mid, setMid] = useState(mid0 || ""), [val, setVal] = useState(""), [nota, setNota] = useState(""), [guardando, setGuardando] = useState(false);
  if (!elegir && !S.mensajeros[mid0!]) return null;
  const guardar = async () => {
    const m = S.mensajeros[mid]; if (!m) return v.avisar("Elige el mensajero");
    const valor = Number(val); if (!(valor > 0)) return v.avisar("Escribe un valor mayor a cero");
    setGuardando(true);
    try { await movCaja({ tipo: "sale", cat: "base", personaId: mid, valor, medio: "efectivo", concepto: nota.trim(), fecha: Date.now(), semana: "", porUid: yo.uid, porNombre: yo.nombre });
      v.cerrar(); v.avisar(`Base de ${pesos(valor)} para ${m.nombre}. Te quedan ${pesos(C.saldo.efectivo - valor)} en efectivo`); }
    catch (e) { setGuardando(false); noSePudo(v, "No se pudo guardar")(e); }
  };
  return <>
    <Cab sub={<span className="sub">Tienes {pesos(C.saldo.efectivo)} en efectivo</span>}><h2>{elegir ? "Dar base a un mensajero" : "Dar base a " + S.mensajeros[mid0!].nombre}</h2></Cab>
    <p className="sub">Sale de tu caja en efectivo y se le suma a lo que el mensajero debe entregar.</p>
    {elegir && <div className="campo"><label htmlFor="bmMen">Mensajero</label><select id="bmMen" autoFocus value={mid} onChange={e => setMid(e.target.value)}><option value="">Elige…</option>{ms.map(x => <option key={x.id} value={x.id}>{x.nombre}</option>)}</select></div>}
    <div className="linea2"><div className="campo"><label htmlFor="bmVal">Valor</label><input id="bmVal" type="number" inputMode="numeric" min="0" step="1000" autoFocus={!elegir} value={val} onChange={e => setVal(e.target.value)} /></div>
      <div className="campo"><label htmlFor="bmNota">Nota (opcional)</label><input id="bmNota" placeholder="Ej: base del día" value={nota} onChange={e => setNota(e.target.value)} /></div></div>
    <button className="btn" id="bmGuardar" style={{ width: "100%" }} disabled={guardando} onClick={guardar}>Dar base</button>
  </>;
}
