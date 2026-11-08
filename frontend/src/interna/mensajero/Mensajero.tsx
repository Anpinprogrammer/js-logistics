/* App del mensajero, igual al prototipo (pintarMensajero, inicioMensajeroHtml, miSueldoHtml y los diálogos de entrega). */
import { useRef } from "react";
import { useUsuario } from "../../auth/Sesion";
import { E, guardarLocal } from "../estado";
import {
  S, yo, cerrado, delDia, diaDe, hora, hoy, listaOrdenada, esRepartidor, nombreCliente, pesos, totales, periodoMensajero, sueldoTexto, textoLiq, ajusteTxt,
  MEDIOS, MOTIVOS, metodoTxt, moverDia, pct, nivelEfectividad, CONSEJOS_MOTIVO, semanaDe, tipoDe, sueldoPersonaSemana, entregasPorDia, COLOR_ESTADO,
  moverSemana, diaSueldo, servicio, DIAS_SEM, fechaLarga, pendienteAnterior, DESC_SUELDO,
} from "../motor";
import { Columnas, Dona, EtqEstado, FiltroDia, Icono, IconoCamara, Kpi, Mini, TablaEntregas, pl, useVentana } from "../ui";
import { crearGuias } from "../acciones";
import { motivoError } from "../datos";
import { abrirEntregaEn, VerEntregado } from "./Entrega";

export const pendientesMios = () => Object.values(S.pedidos).filter(p => p.estado === "pendiente" && p.mensajeroId === E.miMensajero).sort((a, b) => a.creado - b.creado);
const MAX_FOTOS = 30;

export default function Mensajero({ pintar }: { pintar: () => void }) {
  const u = useUsuario(), ventana = useVentana();
  const camara = useRef<HTMLInputElement>(null), galeria = useRef<HTMLInputElement>(null);
  // La cuenta queda vinculada a su nombre en Personal; administración puede actuar como otro mensajero.
  const vinc = u.mensajeroId && S.mensajeros[u.mensajeroId] ? u.mensajeroId : "";
  if (vinc && !E.actuarComo && E.miMensajero !== vinc) { E.miMensajero = vinc; guardarLocal("js_mensajero", vinc); }
  const puedeCambiar = !vinc || yo.esAdmin;
  const mens = listaOrdenada(S.mensajeros, "nombre").filter(esRepartidor);
  const elegir = (id: string) => { if (!id) return; E.actuarComo = !!vinc && id !== vinc; E.miMensajero = id; guardarLocal("js_mensajero", id); pintar(); };
  const cambiarYo = (e: React.MouseEvent) => { e.preventDefault(); if (E.actuarComo) { E.actuarComo = false; E.miMensajero = vinc; pintar(); return; } if (vinc && yo.esAdmin) E.actuarComo = true; E.miMensajero = ""; pintar(); };
  const enlaceCambiar = puedeCambiar ? <> · <a href="#" id="cambiarYo" onClick={cambiarYo}>{E.actuarComo ? "volver a mi nombre" : "cambiar"}</a></> : null;
  const irM = (k: string) => { E.tabM = k; if (k === "pend") E.diaPedM = ""; pintar(); scrollTo(0, 0); };

  const fotos = async (lista: FileList | null) => {
    let files = [...(lista || [])].filter(f => f.type.startsWith("image/")); if (!files.length) return;
    if (files.length > MAX_FOTOS) { ventana.avisar("Máximo " + MAX_FOTOS + " fotos a la vez"); files = files.slice(0, MAX_FOTOS); }
    try {
      const hechas = await crearGuias(files, E.miMensajero, ventana.avisar);
      ventana.avisar(hechas.length === 1 ? "Guía " + hechas[0] + " creada" : "Se crearon " + hechas.length + " guías");
      E.ultimaGuia = hechas.length === 1 ? hechas[0] : hechas[0] + " a " + hechas[hechas.length - 1];
      pintar();
    } catch (e) { ventana.avisar(navigator.onLine === false ? "Sin señal: la guía necesita conexión para darle número." : "No se pudo crear la guía: " + motivoError(e) + "."); }
  };
  const btnFoto = () => { if (camara.current) { camara.current.value = ""; camara.current.click(); } };
  const btnGaleria = () => { if (galeria.current) { galeria.current.value = ""; galeria.current.click(); } };
  const entradas = <>
    <input type="file" ref={camara} accept="image/*" capture="environment" className="oculto" onChange={e => fotos(e.target.files)} />
    <input type="file" ref={galeria} accept="image/*" multiple className="oculto" onChange={e => fotos(e.target.files)} />
  </>;

  let h: React.ReactNode;
  if (!S.mensajeros[E.miMensajero] && !yo.esAdmin && !u.mensajeroId) {
    h = <><h1>Hola</h1><div className="vacio">Tu cuenta todavía no está vinculada a tu nombre. Pídele al administrador que la vincule en Más → Personal → Accesos a la app.</div></>;
  } else if (!mens.length && yo.esAdmin) {
    h = <><h1>Hola</h1><div className="vacio">Todavía no hay mensajeros registrados. El administrador los crea en Administración → Más → Personal.</div></>;
  } else if (!S.mensajeros[E.miMensajero]) {
    h = <><h1>Hola</h1><p className="sub">Elige tu nombre una sola vez. Quedará vinculado a tu cuenta y solo el administrador lo puede cambiar.</p>
      <div className="campo"><label htmlFor="selMens">¿Quién eres?</label>
        <select id="selMens" value="" onChange={e => elegir(e.target.value)}><option value="">Elige tu nombre…</option>{mens.map(m => <option key={m.id} value={m.id}>{m.nombre}</option>)}</select></div></>;
  } else if (E.tabM === "inicio") {
    h = <InicioMensajero mid={E.miMensajero} enlace={enlaceCambiar} irM={irM} btnFoto={btnFoto} btnGaleria={btnGaleria} />;
  } else if (E.tabM === "nuevo") {
    const m = S.mensajeros[E.miMensajero];
    h = <><h1>Salida de pedidos</h1><p className="sub">{m.nombre}{enlaceCambiar}</p>
      <button className="camara" id="btnFoto" onClick={btnFoto}><IconoCamara />Tomar foto del pedido<small>Se le asigna número de guía y pasa a “Por entregar”</small></button>
      <button className="btn sec" id="btnGaleria" style={{ width: "100%", marginTop: 10 }} onClick={btnGaleria}>Subir fotos de la galería (puedes elegir varias)</button>
      {E.ultimaGuia && <div className="recien"><div><div className="guia">{E.ultimaGuia}</div><span>Guardado en por entregar. Escribe {E.ultimaGuia.includes(" a ") ? "cada número en su paquete" : "este número en el paquete"}.</span></div></div>}</>;
  } else if (E.tabM === "pend") {
    const ps = pendientesMios().filter(p => delDia(p, E.diaPedM));
    h = <><h1>Por entregar</h1><p className="sub">{ps.length} {pl(ps.length, "pedido")} en ruta{E.diaPedM ? " que salieron ese día" : ""}</p>
      <FiltroDia d={E.diaPedM} poner={d => { E.diaPedM = d; pintar(); }} />
      {ps.length ? <div className="lista">{ps.map(p => (
        <button className="fila" key={p.guia} onClick={() => abrirEntregaEn(ventana, p.guia)}><Mini p={p} />
          <span className="info"><span className="guia">{p.guia}</span>{Number(p.aCobrar) ? <> <b>Cobrar {pesos(p.aCobrar)}</b></> : null}{p.intentos.length ? <> <span className="etq sin">{p.intentos.length} {pl(p.intentos.length, "intento")}</span></> : null}
            <p>{nombreCliente(p.clienteId) || p.clienteNombre || "Remitente sin asignar"} · salió {hora(p.creado)}</p></span>
          <span className="btn chico ok">Entregar</span></button>))}</div>
        : <div className="vacio">{E.diaPedM ? "No tienes pedidos pendientes de ese día." : "No tienes pedidos pendientes. Toma la foto en “Nuevo pedido” al salir."}</div>}</>;
  } else if (E.tabM === "sueldo") {
    h = <MiSueldo mid={E.miMensajero} pintar={pintar} />;
  } else if (E.tabM === "entregados") {
    const ps = Object.values(S.pedidos).filter(p => cerrado(p) && p.mensajeroId === E.miMensajero && (!E.diaEntM || diaDe(p.entregado || 0) === E.diaEntM)).sort((a, b) => (b.entregado || 0) - (a.entregado || 0));
    const ent = ps.filter(p => p.estado === "entregado"), t = totales(ent), dev = ps.length - ent.length;
    h = <><h1>Entregados</h1><p className="sub">{ent.length} {pl(ent.length, "entregado")}{dev ? ` · ${dev} ${pl(dev, "devuelto")}` : ""}{E.diaEntM ? "" : " en total"}. Solo para consultar.</p>
      <FiltroDia d={E.diaEntM} poner={d => { E.diaEntM = d; pintar(); }} />
      {ent.length > 0 && <div className="cifras" style={{ margin: "10px 0" }}><div className="cifra"><span>Efectivo cobrado</span><b>{pesos(t.efectivo)}</b></div><div className="cifra"><span>Transferencias a JS</span><b>{pesos(t.transfJs)}</b></div><div className="cifra"><span>Pagado directo al cliente</span><b>{pesos(t.transfCli)}</b></div></div>}
      {ps.length ? <div className="lista">{ps.map(p => (
        <button className="fila" key={p.guia} onClick={() => ventana.abrir(<VerEntregado guia={p.guia} />)}><Mini p={p} />
          <span className="info"><span className="guia">{p.guia}</span> <EtqEstado p={p} /><p>{p.estado === "entregado" ? "Recibió " + (p.destinatario || "") + " · " + metodoTxt(p) + (Number(p.valorCobrado) ? " · cobró " + pesos(p.valorCobrado) : "") : MOTIVOS[p.motivoDev as keyof typeof MOTIVOS] || "Devuelto"} · {hora(p.entregado)}</p></span>
          <span className="btn chico sec">Ver</span></button>))}</div>
        : <div className="vacio">{E.diaEntM ? "No entregaste pedidos ese día." : "Todavía no tienes pedidos entregados."}</div>}</>;
  } else {
    const pm = periodoMensajero(E.miMensajero), t = totales(pm.ps), ul = pm.ul;
    h = <><h1>Mi caja</h1><p className="sub">Período actual: {ul ? "desde la liquidación del " + hora(ul.fecha) : "desde el inicio"} hasta ahora.</p>
      <div className="cifras">
        <div className="cifra fuerte"><span>Te falta entregar</span><b>{pesos(pm.debe)}</b></div>
        <div className="cifra"><span>Sueldo del período</span><b>{sueldoTexto(E.miMensajero, pm.ps)}</b></div>
        <div className="cifra"><span>Efectivo cobrado</span><b>{pesos(t.efectivo)}</b></div>
        {pm.base ? <div className="cifra"><span>Base para vueltos</span><b>{pesos(pm.base)}</b></div> : null}
        {pm.gastos ? <div className="cifra"><span>Fletes / gastos que pagaste</span><b>− {pesos(pm.gastos)}</b></div> : null}
        <div className="cifra"><span>Ya entregaste</span><b>{pesos(pm.recibido)}</b></div>
        {pm.anterior ? <div className="cifra"><span>Pendiente de la liquidación anterior</span><b>{pesos(pm.anterior)}</b></div> : null}
        {pm.ajuste ? <div className="cifra"><span>Correcciones a liquidaciones cerradas</span><b>{ajusteTxt(pm.ajuste)}</b></div> : null}
        <div className="cifra"><span>Transferencias a JS</span><b>{pesos(t.transfJs)}</b></div>
        <div className="cifra"><span>Pagado directo al cliente</span><b>{pesos(t.transfCli)}</b></div>
        <div className="cifra"><span>Entregas</span><b>{pm.ps.length}</b></div>
      </div>
      {ul && <p className="sub" style={{ marginTop: 12 }}>Última liquidación ({hora(ul.fecha)}): {textoLiq(ul.debe).toLowerCase()}.</p>}
      {pm.recs.length > 0 && <><h2>Dinero que entregaste</h2><div className="tabla-env"><table><thead><tr><th>Hora</th><th>Medio</th><th className="n">Valor</th></tr></thead><tbody>{pm.recs.map(r => <tr key={r.id}><td>{hora(r.fecha)}</td><td>{MEDIOS[r.medio] || ""}</td><td className="n">{pesos(r.valor)}</td></tr>)}</tbody></table></div></>}
      <h2>Entregas del período</h2><TablaEntregas ps={pm.ps} conCliente={false} /></>;
  }
  return <>{entradas}{h}</>;
}

/* ---- Panel del mensajero: su rendimiento y recomendaciones para mejorar (solo con sus propios pedidos) ---- */
type Reco = [cls: "sin" | "ent" | "pend" | "ruta", ic: string, titulo: string, texto: string, ir?: string];
function InicioMensajero({ mid, enlace, irM, btnFoto, btnGaleria }: { mid: string; enlace: React.ReactNode; irM: (k: string) => void; btnFoto: () => void; btnGaleria: () => void }) {
  const m = S.mensajeros[mid], h = hoy(), H = 36e5, desde = moverDia(h, -29), mis = Object.values(S.pedidos).filter(p => p.mensajeroId === mid);
  const enRuta = mis.filter(p => p.estado === "pendiente").sort((a, b) => a.creado - b.creado), viejos = enRuta.filter(p => Date.now() - p.creado > 24 * H);
  const entHoy = mis.filter(p => p.estado === "entregado" && diaDe(p.entregado || 0) === h).length, devHoy = mis.filter(p => p.estado === "devuelto" && diaDe(p.entregado || 0) === h).length;
  const mes = mis.filter(p => cerrado(p) && diaDe(p.entregado || 0) >= desde), ent = mes.filter(p => p.estado === "entregado"), dev = mes.filter(p => p.estado === "devuelto");
  const efec = pct(ent.length, mes.length), [nivel, clsNivel] = nivelEfectividad(efec, mes.length);
  // por qué no se entregó: devoluciones y visitas fallidas (reprogramadas) de los últimos 30 días
  const fallos: Record<string, number> = {};
  dev.forEach(p => { const k = p.motivoDev || "otro"; fallos[k] = (fallos[k] || 0) + 1; });
  mis.forEach(p => p.intentos.forEach(i => { if (diaDe(i.fecha) >= desde) { const k = i.motivo || "otro"; fallos[k] = (fallos[k] || 0) + 1; } }));
  const motivos = Object.entries(fallos).sort((a, b) => b[1] - a[1]), totFallos = motivos.reduce((a, [, n]) => a + n, 0);
  const conDif = ent.filter(p => Number(p.difCobro)).length;
  const tiempos = ent.map(p => ((p.entregado || 0) - p.creado) / H).filter(x => x >= 0).sort((a, b) => a - b), mediana = tiempos.length ? tiempos[Math.floor(tiempos.length / 2)] : 0;
  const diasTrab = new Set(ent.map(p => diaDe(p.entregado || 0))).size, porDia = diasTrab ? ent.length / diasTrab : 0;
  const sem = semanaDe(h), entSem = ent.filter(p => diaDe(p.entregado || 0) >= sem), diasSem = new Set(entSem.map(p => diaDe(p.entregado || 0))).size, porDiaSem = diasSem ? entSem.length / diasSem : 0;
  const pm = periodoMensajero(mid), esMens = tipoDe(m) === "mensajero", su = sueldoPersonaSemana(mid, sem);
  const tiempoTxt = (x: number) => (x < 1 ? Math.round(x * 60) + " min" : x.toFixed(1).replace(".", ",") + " h");
  const coma = (x: number) => x.toFixed(1).replace(".", ",");
  const nomMotivo = (k: string) => MOTIVOS[k as keyof typeof MOTIVOS] || "Otro motivo";
  // recomendaciones: primero lo urgente, luego cómo mejorar, y siempre reconocer lo que va bien
  const R: Reco[] = [];
  if (viejos.length) R.push(["sin", "pend", `Tienes ${viejos.length} ${pl(viejos.length, "pedido")} con más de un día en ruta`, "Entrégalos hoy o márcalos como “No se pudo entregar” con el motivo, para que la oficina le avise al remitente.", "pend"]);
  const ultimaEntregaPlata = Math.max(pm.ul?.fecha || 0, ...pm.recs.map(r => r.fecha)), desdeCuando = ultimaEntregaPlata || pm.ps[0]?.entregado || Date.now(), diasSinEntregar = Math.floor((Date.now() - desdeCuando) / (24 * H));
  if (pm.debe >= 100000 && diasSinEntregar >= 1) R.push(["sin", "plata", `Llevas ${pesos(pm.debe)} sin entregar a la oficina`, `Hace ${diasSinEntregar === 1 ? "más de un día" : diasSinEntregar + " días"} que no le pasas plata a la oficina. Entrégala hoy: andar con mucha plata es un riesgo para ti, y la caja de la empresa no cuadra hasta que la recibe.`, "caja"]);
  if (mes.length >= 10 && efec < 90 && motivos.length) { const [k, n] = motivos[0], c = CONSEJOS_MOTIVO[k] || CONSEJOS_MOTIVO.otro;
    R.push(["pend", "dev", `Devuelves ${100 - efec} de cada 100 pedidos`, `La causa que más se repite es “${nomMotivo(k)}” (${n} ${n === 1 ? "vez" : "veces"} en 30 días). Consejo: ${c[1]}`]); }
  else if (motivos.length && motivos[0][1] >= 3) { const [k, n] = motivos[0], c = CONSEJOS_MOTIVO[k] || CONSEJOS_MOTIVO.otro;
    R.push(["ruta", "dev", c[0], `“${nomMotivo(k)}” se repitió ${n} veces en 30 días. ${c[1]}`]); }
  if (conDif) R.push(["pend", "plata", `${conDif} ${pl(conDif, "entrega")} con un valor cobrado distinto al de la guía`, "Antes de entregar, mira en la app cuánto hay que cobrar y cuenta la plata delante del cliente. Si el cliente paga otro valor, escribe en la nota por qué."]);
  if (tiempos.length >= 10 && mediana > 5) R.push(["ruta", "ruta", `Tus pedidos tardan ${tiempoTxt(mediana)} desde que salen`, "Organiza la ruta por barrios antes de salir y llama primero a los que más lejos están. Entregar más rápido te deja hacer más domicilios en el día."]);
  if (diasSem >= 2 && diasTrab >= 5 && porDiaSem < porDia * 0.8) R.push(["ruta", "pedidos", `Esta semana vas en ${coma(porDiaSem)} entregas por día`, `Tu promedio del último mes es ${coma(porDia)}. Pide en la oficina más pedidos de tu zona o arranca un poco más temprano.`]);
  if (mes.length >= 10 && efec >= 95) R.unshift(["ent", "ok", "¡Vas excelente!", `Entregaste ${efec}% de tus pedidos en los últimos 30 días. Sigue llamando antes de llegar y confirmando direcciones: eso es lo que hace la diferencia.`]);
  else if (!R.length && mes.length) R.push(["ent", "ok", "Vas bien", "No hay nada urgente. Sigue confirmando direcciones y llamando antes de llegar para mantener tus entregas al día."]);
  if (!mes.length && !enRuta.length) R.push(["ruta", "nuevo", "Empieza tu día", "Toma la foto de cada pedido al salir. Aquí vas a ver cómo te va y consejos para mejorar."]);
  const orden = { sin: 0, ent: 1, pend: 2, ruta: 3 }; R.sort((a, b) => orden[a[0]] - orden[b[0]]);
  const dias = entregasPorDia(mis, 14), tot14 = dias.reduce((a, d) => a + d.n, 0);
  return <>
    <div className="dash-cab"><div><h1>Hola, {m.nombre}</h1><p className="sub">Así va tu trabajo{enlace}</p></div></div>
    <div className="acciones" style={{ margin: "0 0 16px" }}><button className="btn" id="btnFoto" onClick={btnFoto}><Icono n="nuevo" /> Tomar foto del pedido</button><button className="btn sec" id="btnGaleria" onClick={btnGaleria}>Subir de la galería</button></div>
    <div className="kpis">
      <Kpi ico="ruta" lbl="En ruta" val={enRuta.length} pie={<small>{viejos.length ? <span className="neg">{viejos.length} con más de un día</span> : "Por entregar ahora"}</small>} onClick={() => irM("pend")} />
      <Kpi ico="ok" lbl="Entregados hoy" val={entHoy} pie={<small>{devHoy ? devHoy + " " + pl(devHoy, "devuelto") + " hoy" : "Sin devoluciones hoy"}</small>} />
      {esMens ? <Kpi ico="sueldos" lbl="Sueldo de la semana" val={pesos(su.neto)} pie={<small>{su.adel ? "Ya descontados " + pesos(su.adel) + " de adelantos" : "Lo que te deben esta semana"}</small>} />
        : <Kpi ico="pedidos" lbl="Entregas del mes" val={ent.length} pie={<small>{coma(porDia)} por día trabajado</small>} />}
      <Kpi ico="plata" lbl="Te falta entregar" val={pesos(pm.debe)} pie={<small>{pm.debe > 0 ? "Plata que debes llevar a la oficina" : "Estás al día con la oficina"}</small>} onClick={() => irM("caja")} cls="oscuro" />
    </div>
    <section className="tarjeta" style={{ marginBottom: 16 }}><h3>Recomendaciones para ti</h3>
      <div className="recos">{R.slice(0, 4).map(([cls, ic, t, txt, ir], i) => <div key={i} className={"reco " + cls}><span className="reco-ic"><Icono n={ic} /></span><div><b>{t}</b><p>{txt}</p>{ir && <button className="btn sec chico" onClick={() => irM(ir)}>{ir === "pend" ? "Ver por entregar" : "Ver mi caja"}</button>}</div></div>)}</div></section>
    <div className="dash">
      <section className="tarjeta c4"><h3>Efectividad <span className={"etq " + clsNivel}>{nivel}</span></h3>
        <Dona segs={[{ t: "Entregados", n: ent.length, c: COLOR_ESTADO.entregado }, { t: "Devueltos", n: dev.length, c: COLOR_ESTADO.devuelto }]} centro={mes.length ? efec + "%" : "—"} sub="últimos 30 días" /></section>
      <section className="tarjeta c8"><h3>Tus entregas por día <small>Últimos 14 días · {tot14} en total</small></h3><Columnas datos={dias} nombre="Entregas por día" /></section>
    </div>
    <div className="dash">
      <section className="tarjeta c6"><h3>Por qué no se entregó <small>Últimos 30 días</small></h3>
        {motivos.length ? <div className="hbarras">{motivos.map(([k, n]) => <button key={k} tabIndex={-1} style={{ "--w": Math.round((n * 100) / motivos[0][1]) + "%", cursor: "default" } as React.CSSProperties}><span>{nomMotivo(k)}</span><small>{n} · {pct(n, totFallos)}%</small><i /></button>)}</div>
          : <div className="vacio">Ninguna devolución ni visita fallida. ¡Muy bien!</div>}</section>
      <section className="tarjeta c6"><h3>Tus números <small>Últimos 30 días</small></h3><div className="plata">
        <div><span>Entregas</span><b>{ent.length}</b></div>
        <div><span>Días trabajados</span><b>{diasTrab}</b></div>
        <div><span>Entregas por día</span><b>{coma(porDia)}</b></div>
        <div><span>Esta semana, por día</span><b>{diasSem ? coma(porDiaSem) : "—"}</b></div>
        <div><span>Tiempo de entrega (normal)</span><b>{tiempos.length ? tiempoTxt(mediana) : "—"}</b></div>
        <div><span>Cobros con diferencia</span><b className={conDif ? "neg" : ""}>{conDif}</b></div>
      </div></section>
    </div>
  </>;
}

function MiSueldo({ mid, pintar }: { mid: string; pintar: () => void }) {
  const m = S.mensajeros[mid], R = sueldoPersonaSemana(mid, E.semM), hoyS = hoy(), esDueno = tipoDe(m) === "dueno";
  const ent = Object.values(S.pedidos).filter(p => cerrado(p) && p.mensajeroId === mid);
  const movs = [...R.adelantos.map(c => ({ ...c, t: "Adelanto" })), ...R.pagos.map(c => ({ ...c, t: "Pago de sueldo" }))].sort((a, b) => a.fecha - b.fecha);
  const ant = pendienteAnterior(mid, E.semM), antTot = ant.reduce((a, r) => a + r.neto, 0);
  const neto = Math.round(R.neto), pagadoTodo = R.pagado > 0 && neto <= 0;
  const sem = (n: number | null) => { E.semM = n === null ? semanaDe(hoy()) : moverSemana(E.semM, n); pintar(); };
  return <>
    <h1>Mi sueldo</h1><p className="sub">{m.nombre} · semana del {fechaLarga(R.dias[0])} al {fechaLarga(R.dias[6])}</p>
    <div className="acciones" style={{ marginBottom: 14 }}><button className="btn sec chico" id="msAnt" onClick={() => sem(-1)}>← Anterior</button><button className="btn sec chico" id="msHoy" onClick={() => sem(null)}>Esta semana</button><button className="btn sec chico" id="msSig" onClick={() => sem(1)}>Siguiente →</button></div>
    <div className="cifras">
      <div className="cifra fuerte"><span>{pagadoTodo ? "Pagado ✓ · te deben" : "Te deben esta semana"}</span><b className={neto < 0 ? "neg" : ""}>{pesos(neto)}</b></div>
      <div className="cifra"><span>Sueldo de la semana</span><b>{pesos(R.total)}</b>{R.previo ? <span>Incluye {pesos(R.previo)} que llevabas antes de la app</span> : null}</div>
      <div className="cifra"><span>Adelantos</span><b>{R.adel ? "− " + pesos(R.adel) : pesos(0)}</b></div>
      <div className="cifra"><span>Ya te pagaron</span><b>{R.pagado ? "− " + pesos(R.pagado) : pesos(0)}</b></div>
    </div>
    {neto < 0 && <p className="sub" style={{ marginTop: 10 }}>Los adelantos superan lo ganado esta semana: quedas debiendo {pesos(-neto)}.</p>}
    {antTot ? <div className="aviso" style={{ marginTop: 12 }}>De semanas anteriores te deben {pesos(antTot)} ({ant.map(r => "semana del " + r.sem.slice(8) + "/" + r.sem.slice(5, 7) + ": " + pesos(r.neto)).join(" · ")}).</div> : null}
    <h2>Día por día</h2><p className="sub">Cada domicilio cuenta el día en que salió el pedido, aunque lo entregues al otro día.</p>
    <div className="tabla-env"><table><thead><tr><th>Día</th><th className="n">Entregas</th><th className="n">Domicilios</th><th className="n">Sueldo</th></tr></thead><tbody>
      {R.dias.map((d, i) => { const ps = ent.filter(p => diaSueldo(p) === d), dom = ps.reduce((a, p) => a + servicio(p), 0);
        if (!ps.length && !R.vals[i]) return <tr key={d}><td>{DIAS_SEM[i]} {d.slice(8)}</td><td className="n sub" colSpan={3}>{d > hoyS ? "" : "No trabajó"}</td></tr>;
        return <tr key={d}><td><b>{DIAS_SEM[i]} {d.slice(8)}</b></td><td className="n">{ps.length}</td><td className="n">{pesos(dom)}</td><td className="n"><b className={R.vals[i] < 0 ? "neg" : ""}>{pesos(R.vals[i])}</b></td></tr>; })}
      <tr><td><b>Total</b></td><td className="n">{ent.filter(p => R.dias.includes(diaSueldo(p))).length}</td><td className="n"></td><td className="n"><b>{pesos(R.total)}</b></td></tr></tbody></table></div>
    <p className="sub" style={{ marginTop: 8 }}>{esDueno ? "Tu sueldo diario: 30% de los domicilios de los mensajeros + tus domicilios y los de oficina + ganancias ocasionales + " + pesos(DESC_SUELDO) + " por mensajero − pagos fijos (patinadores, oficina y JS)." : tipoDe(m) === "oficina" ? "Pago fijo por día trabajado. Los domicilios de tus pedidos son 100% de JS." : "Cada día: 70% de tus domicilios − " + pesos(DESC_SUELDO) + "."}</p>
    <h2>Adelantos y pagos</h2>
    {movs.length ? <div className="tabla-env"><table><thead><tr><th>Fecha</th><th>Tipo</th><th>Medio</th><th className="n">Valor</th></tr></thead><tbody>{movs.map(c => <tr key={c.id}><td>{hora(c.fecha)}</td><td>{c.t}{c.concepto ? <><br /><span className="sub" style={{ fontSize: ".8rem" }}>{c.concepto}</span></> : null}</td><td>{MEDIOS[c.medio as keyof typeof MEDIOS] || ""}</td><td className="n">{pesos(c.valor)}{Number(c.devuelto) ? <><br /><span className="sub" style={{ fontSize: ".8rem" }}>devolvió {pesos(c.devuelto)}</span></> : null}</td></tr>)}</tbody></table></div>
      : <div className="vacio">Sin adelantos ni pagos esta semana.</div>}
  </>;
}
