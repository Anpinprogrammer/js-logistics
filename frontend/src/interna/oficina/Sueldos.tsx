/* Oficina → Sueldos: la planilla de la semana, el cálculo del sueldo de Javier y los adelantos (pintarSueldos del prototipo). */
import { useState } from "react";
import {
  S, hoy, hora, pesos, fechaLarga, resumenSemana, sueldoPersonaSemana, moverSemana, semanaDe, tipoDe, jornada, valorAdel, sueldoPrevio, yaContado, liquidacionesDe,
  MEDIOS, TIPOS, PAGO_FIJO, DIAS_SEM, DESC_SUELDO, type Medio, type Persona,
} from "../motor";
import { Cab, IconoCalendario, IconoOjo, useVentana } from "../ui";
import { E } from "../estado";
import { devolverAdelanto, guardarPersona, ponerJornada, quitarAdelanto } from "../acciones";
import { motivoError, useDatos } from "../datos";
import { MovCaja } from "./modales";

type Ventana = ReturnType<typeof useVentana>;
const MEDIOS_K = Object.keys(MEDIOS) as Medio[];
const fallo = (v: Ventana) => (e: unknown) => v.avisar("No se pudo guardar: " + motivoError(e));

export default function Sueldos({ pintar }: { pintar: () => void }) {
  const v = useVentana(), R = resumenSemana(E.semA);
  const tot = R.filas.reduce((a, f) => ({ total: a.total + f.total, adel: a.adel + f.adel, pagado: a.pagado + f.pagado, neto: a.neto + f.neto }), { total: 0, adel: 0, pagado: 0, neto: 0 });
  const dueno = Object.values(S.mensajeros).find(m => tipoDe(m) === "dueno");
  const adelSem = R.filas.flatMap(f => f.adelantos.map(c => ({ ...c, nom: f.m.nombre }))).sort((a, b) => a.fecha - b.fecha);
  const sem = (w: string) => { E.semA = w; pintar(); };
  const detalle = (mid: string) => v.abrir(<DetalleSueldo mid={mid} sem={R.sem} />, "centrada-ancha");
  const adelanto = (mid: string) => v.abrir(<MovCaja tipo="sale" pre={{ cat: "adelanto", personaId: mid, semana: R.sem }} />, "centrada-ancha");
  const pagar = (mid: string, neto: number) => v.abrir(<MovCaja tipo="sale" pre={{ cat: "sueldo", personaId: mid, valor: neto, semana: R.sem }} />, "centrada-ancha");
  return <>
    <h1>Sueldos</h1><p className="sub">Semana del {fechaLarga(R.dias[0])} al {fechaLarga(R.dias[6])}</p>
    <div className="acciones" style={{ marginBottom: 14 }}><button className="btn sec chico" id="semAnt" onClick={() => sem(moverSemana(E.semA, -1))}>← Semana anterior</button><button className="btn sec chico" id="semHoy" onClick={() => sem(semanaDe(hoy()))}>Esta semana</button><button className="btn sec chico" id="semSig" onClick={() => sem(moverSemana(E.semA, 1))}>Semana siguiente →</button></div>
    {!dueno && <div className="aviso">Para calcular el sueldo de Javier, márcalo como “Dueño (Javier)” en la pestaña Personal.</div>}
    <div className="cifras" style={{ marginBottom: 14 }}>
      <div className="cifra"><span>Total sueldos</span><b>{pesos(tot.total)}</b></div>
      <div className="cifra"><span>Adelantos</span><b>{pesos(tot.adel)}</b></div>
      <div className="cifra"><span>Ya pagado</span><b>{pesos(tot.pagado)}</b></div>
      <div className="cifra fuerte"><span>Neto por pagar</span><b>{pesos(tot.neto)}</b></div>
    </div>
    {R.filas.length ? <>
      {/* Computador: tabla resumida (el detalle de cada día va en la ventana "Detalle de sueldo"). */}
      <div className="tabla-env sueldos-tabla"><table><thead><tr><th>Persona</th><th className="n">Anterior</th><th className="n">Total</th><th className="n">Adelantos</th><th className="n">Pagado</th><th className="n">Neto</th><th className="n">Acciones</th></tr></thead><tbody>
        {R.filas.map(f => <tr key={f.m.id}>
          <td><b>{f.m.nombre}</b><span className="sd-rol">{TIPOS[tipoDe(f.m)]}</span></td>
          <td className="n"><a href="#" className="enlace" title="Sueldo que llevaba antes de la app" onClick={e => { e.preventDefault(); v.abrir(<EditarPrevio m={f.m} sem={R.sem} />, "centrada-ancha"); }}>{f.previo ? pesos(f.previo) : "+"}</a></td>
          <td className="n"><b>{pesos(f.total)}</b></td>
          <td className={"n" + (f.adel ? " sd-adel" : "")}>{f.adel ? pesos(f.adel) : "—"}</td>
          <td className={"n" + (f.pagado ? " sd-pagado" : "")}>{f.pagado ? pesos(f.pagado) : "—"}</td>
          <td className="n"><b className={"sd-neto" + (f.neto < 0 ? " neg" : "")}>{pesos(f.neto)}</b></td>
          <td className="n"><div className="sd-acciones">
            <button className="btn sec chico" onClick={() => detalle(f.m.id)} aria-label={"Ver detalle de " + f.m.nombre}><IconoCalendario /><span>Detalle</span></button>
            <button className="btn sec chico sd-rapido" onClick={() => adelanto(f.m.id)}>Adelanto</button>
            <button className="btn ok chico sd-rapido" disabled={f.neto <= 0} onClick={() => pagar(f.m.id, f.neto)}>Pagar</button>
          </div></td></tr>)}
        <tr className="sd-total"><td><b>Total</b></td><td className="n">{pesos(R.filas.reduce((a, f) => a + f.previo, 0))}</td><td className="n"><b>{pesos(tot.total)}</b></td><td className="n">{pesos(tot.adel)}</td><td className="n">{pesos(tot.pagado)}</td><td className="n"><b>{pesos(tot.neto)}</b></td><td></td></tr>
      </tbody></table></div>
      {/* Celular: una fila por persona con su neto; al tocarla se abre el mismo detalle. */}
      <ul className="sueldos-lista">
        {R.filas.map(f => <li key={f.m.id}><button type="button" onClick={() => detalle(f.m.id)}>
          <span className="sd-quien"><b>{f.m.nombre}</b><span className="sd-rol">{TIPOS[tipoDe(f.m)]}</span></span>
          <span className="sd-cuanto"><b className={f.neto < 0 ? "neg" : ""}>{pesos(f.neto)}</b><small>{f.neto > 0 ? "Neto a pagar" : f.neto < 0 ? "Debe" : f.pagado ? "Pagado" : "Sin saldo"}</small></span>
          <span className="sd-flecha" aria-hidden="true">›</span>
        </button></li>)}
      </ul>
    </> : <div className="vacio">Registra tu personal en la pestaña Personal.</div>}
    <p className="sub" style={{ marginTop: 10 }}>Mensajeros: 70% de sus domicilios del día − {pesos(DESC_SUELDO)}. Patinadores, oficina y JS: toca cada día que trabajó (se marca con su pago por día); toca otra vez para quitarlo. Para un valor distinto, usa “otro valor”. Los domicilios de pedidos a nombre de oficina son 100% de JS y suman al sueldo de Javier.</p>
    {dueno && <JaviSemana R={R} nombre={dueno.nombre} />}
    <h2>Adelantos de la semana</h2>
    {adelSem.length ? <div className="tabla-env"><table><thead><tr><th>Día</th><th>Persona</th><th>Medio</th><th>Detalle</th><th className="n">Valor</th><th></th></tr></thead><tbody>
      {adelSem.map(c => <tr key={c.id}><td>{hora(c.fecha)}</td><td>{c.nom}</td><td>{MEDIOS[c.medio as Medio] || ""}</td><td>{c.concepto || ""}</td><td className="n">{pesos(c.valor)}{Number(c.devuelto) ? <><br /><span className="sub" style={{ fontSize: ".8rem" }}>devolvió {pesos(c.devuelto || 0)}</span></> : null}</td>
        <td>{valorAdel(c) > 0 ? <button className="btn sec chico" onClick={() => v.abrir(<QuitarAdelanto id={c.id} />, "centrada-ancha")}>Devolvió / Quitar</button> : <span className="sub">Devuelto</span>}</td></tr>)}
    </tbody></table></div> : <div className="vacio">Sin adelantos esta semana. Usa el botón “Adelanto” en cada persona.</div>}
  </>;
}

const DIAS_LARGOS = ["Sábado", "Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes"];
const MESES_LARGOS = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
type Semana = ReturnType<typeof resumenSemana>;
type DiaJavi = Semana["porDia"][number];
/** Lo que entra en el día para Javier: 30% de mensajeros, domicilios propios y de oficina, ganancias ocasionales y el descuento fijo por mensajero. */
const ingresosJavi = (x: DiaJavi) => x.dom30 + x.propios + x.ganancias + x.desc;
const conMovimiento = (x: DiaJavi) => !!(x.dom30 || x.propios || x.fijos || x.ganancias);

/** Cálculo del sueldo de Javier: tabla de 5 columnas en el computador y lista en el celular.
 *  El desglose de cada día (la fórmula completa) va en la ventana "DetalleJavi". */
function JaviSemana({ R, nombre }: { R: Semana; nombre: string }) {
  const v = useVentana();
  const dias = R.dias.map((d, i) => ({ d, i, x: R.porDia[i] })).filter(o => conMovimiento(o.x));
  const tot = dias.reduce((a, o) => ({ ing: a.ing + ingresosJavi(o.x), fijos: a.fijos + o.x.fijos, sueldo: a.sueldo + o.x.javier }), { ing: 0, fijos: 0, sueldo: 0 });
  const detalle = (i: number) => v.abrir(<DetalleJavi sem={R.sem} i={i} nombre={nombre} />, "centrada-ancha");
  const fijosTxt = (n: number) => <span className={n ? "neg" : "sd-cero"}>{pesos(-n)}</span>;
  return <>
    <h2>Cálculo del sueldo de {nombre}</h2>
    {!dias.length ? <div className="vacio">Sin movimiento esta semana.</div> : <>
      <div className="tabla-env sueldos-tabla jv-tabla"><table><thead><tr><th>Día</th><th className="n">Ingresos del día</th><th className="n">Pagos fijos</th><th className="n">Sueldo</th><th className="n">Acciones</th></tr></thead><tbody>
        {dias.map(({ d, i, x }) => <tr key={d}>
          <td><b>{DIAS_SEM[i]} {d.slice(8)}</b></td>
          <td className="n"><b>{pesos(ingresosJavi(x))}</b></td>
          <td className="n">{fijosTxt(x.fijos)}</td>
          <td className="n"><b className={"sd-neto" + (x.javier < 0 ? " neg" : "")}>{pesos(x.javier)}</b></td>
          <td className="n"><div className="sd-acciones"><button className="btn sec chico" onClick={() => detalle(i)} aria-label={`Ver el cálculo del ${DIAS_LARGOS[i].toLowerCase()} ${d.slice(8)}`}><IconoOjo /><span>Detalle</span></button></div></td>
        </tr>)}
        <tr className="sd-total"><td><b>Total semana</b></td><td className="n"><b>{pesos(tot.ing)}</b></td><td className="n">{fijosTxt(tot.fijos)}</td><td className="n"><b className={"sd-neto" + (tot.sueldo < 0 ? " neg" : "")}>{pesos(tot.sueldo)}</b></td><td></td></tr>
      </tbody></table></div>
      <ul className="sueldos-lista jv-lista">
        {dias.map(({ d, i, x }) => <li key={d}><button type="button" onClick={() => detalle(i)} aria-label={`${DIAS_LARGOS[i]} ${d.slice(8)}: sueldo ${pesos(x.javier)}. Ver el cálculo`}>
          <span className="sd-quien"><b>{DIAS_SEM[i]} {d.slice(8)}</b><span className="sd-rol"><span className="jv-par">Ingresos {pesos(ingresosJavi(x))}</span> · <span className="jv-par">Fijos {pesos(-x.fijos)}</span></span></span>
          <span className="sd-cuanto"><b className={x.javier < 0 ? "neg" : ""}>{pesos(x.javier)}</b><small>Sueldo</small></span>
          <span className="jv-ver" aria-hidden="true"><IconoOjo /></span>
        </button></li>)}
        <li className="jv-total"><span className="sd-quien"><b>Total semana</b><span className="sd-rol"><span className="jv-par">Ingresos {pesos(tot.ing)}</span> · <span className="jv-par">Fijos {pesos(-tot.fijos)}</span></span></span><span className="sd-cuanto"><b className={tot.sueldo < 0 ? "neg" : ""}>{pesos(tot.sueldo)}</b></span></li>
      </ul>
    </>}
  </>;
}

/** Desglose de un día del sueldo de Javier, paso a paso. Lee los datos en cada render para estar al día. */
function DetalleJavi({ sem, i, nombre }: { sem: string; i: number; nombre: string }) {
  useDatos();
  const R = resumenSemana(sem), d = R.dias[i], x = R.porDia[i];
  const fila = (txt: string, val: number, clase = "") => <div><dt>{txt}</dt><dd className={clase || (val ? "" : "sd-cero")}>{pesos(val)}</dd></div>;
  return <div className="sd-detalle jv-detalle">
    <header className="sd-cab">
      <div><h2>Cálculo del sueldo de {nombre}</h2><p className="sub">{DIAS_LARGOS[i]} {d.slice(8)} de {MESES_LARGOS[Number(d.slice(5, 7)) - 1]}</p></div>
      <button className="cerrar" data-cerrar aria-label="Cerrar">×</button>
    </header>
    <dl className="sd-resumen jv-formula">
      {fila("+ 30% domicilios mensajeros", x.dom30)}
      {fila("+ Domicilios propios y de oficina", x.propios)}
      {fila("+ Ganancias ocasionales", x.ganancias)}
      {fila(`+ ${pesos(DESC_SUELDO)} × mensajeros (${x.nMens})`, x.desc)}
      <div className="jv-resta"><dt>− Pagos fijos (patinadores, oficina, JS)</dt><dd className={x.fijos ? "neg" : "sd-cero"}>{pesos(-x.fijos)}</dd></div>
    </dl>
    <div className="jv-neto"><span>Sueldo neto del día</span><b className={x.javier < 0 ? "neg" : ""}>{pesos(x.javier)}</b></div>
  </div>;
}
const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
const diaCorto = (d: string) => d.slice(8) + " " + MESES[Number(d.slice(5, 7)) - 1];

/** Detalle de sueldo de una persona en la semana: los 7 días, el resumen y los botones de Adelanto y Pagar.
 *  Lee los datos en cada render (useDatos), así se ve al instante cuando se marca o quita un día. */
function DetalleSueldo({ mid, sem }: { mid: string; sem: string }) {
  useDatos();
  const v = useVentana(), m = S.mensajeros[mid], hoyS = hoy();
  const [ocupado, setOcupado] = useState("");
  if (!m) return null;
  const r = sueldoPersonaSemana(mid, sem), t = tipoDe(m), editable = PAGO_FIJO.includes(t);
  const volver = () => v.abrir(<DetalleSueldo mid={mid} sem={sem} />, "centrada-ancha");
  const tocarDia = async (dia: string) => {
    if (!Number(m.tarifa) && !jornada(mid, dia)) return v.abrir(<PedirTarifa m={m} despues={async () => { await ponerJornada(mid, dia, Number(S.mensajeros[mid]?.tarifa) || 0); volver(); }} />, "centrada-ancha");
    setOcupado(dia);
    try { await ponerJornada(mid, dia, jornada(mid, dia) ? 0 : Number(m.tarifa)); } catch (e) { fallo(v)(e); }
    setOcupado("");
  };
  const enlace = (txt: string, f: () => void) => <a href="#" className="enlace" onClick={e => { e.preventDefault(); f(); }}>{txt}</a>;
  return <div className="sd-detalle">
    <header className="sd-cab">
      <div><h2>{m.nombre} <span className="sd-badge">{TIPOS[t]}</span></h2><p className="sub">{DIAS_SEM[0]} {diaCorto(r.dias[0])} – {DIAS_SEM[6]} {diaCorto(r.dias[6])}</p></div>
      <button className="cerrar" data-cerrar aria-label="Cerrar">×</button>
    </header>
    <h3 className="sd-titulo">Desglose diario de la semana</h3>
    {editable && <p className="sub sd-ayuda">{m.tarifa ? <>Toca un día para marcarlo con {pesos(m.tarifa)}; otro toque lo quita. {enlace("Cambiar pago por día", () => v.abrir(<PedirTarifa m={m} despues={async () => volver()} />, "centrada-ancha"))} · {enlace("otro valor", () => v.abrir(<OtroValor m={m} dias={r.dias} />, "centrada-ancha"))}</> : enlace("Poner pago por día", () => v.abrir(<PedirTarifa m={m} despues={async () => volver()} />, "centrada-ancha"))}</p>}
    <ul className="sd-dias">
      {r.dias.map((d, i) => { const val = r.vals[i], j = jornada(mid, d); return <li key={d}>
        <span>{DIAS_LARGOS[i]} <small>{diaCorto(d)}</small></span>
        {editable
          ? <button className="dia-btn" aria-pressed={!!j} disabled={(d > hoyS && !j) || ocupado === d} aria-label={`${DIAS_LARGOS[i]} ${diaCorto(d)}: ${j ? "trabajó" : "no trabajó"}`} onClick={() => tocarDia(d)}>{j ? "✓ " + pesos(j) : "—"}</button>
          : <b className={val < 0 ? "neg" : val ? "" : "sd-cero"}>{val ? pesos(val) : "—"}</b>}
      </li>; })}
    </ul>
    <dl className="sd-resumen">
      <div><dt>Sueldo anterior</dt><dd>{enlace(r.previo ? pesos(r.previo) : "Agregar", () => v.abrir(<EditarPrevio m={m} sem={sem} despues={volver} />, "centrada-ancha"))}</dd></div>
      <div><dt>Total semana</dt><dd>{pesos(r.total)}</dd></div>
      <div><dt>Adelantos</dt><dd className={r.adel ? "sd-adel" : "sd-cero"}>{r.adel ? "− " + pesos(r.adel) : "—"}</dd></div>
      <div><dt>Ya pagado</dt><dd className={r.pagado ? "sd-pagado" : "sd-cero"}>{r.pagado ? "− " + pesos(r.pagado) : "—"}</dd></div>
      <div className="sd-neto-fila"><dt>Neto por pagar</dt><dd className={r.neto < 0 ? "neg" : ""}>{pesos(r.neto)}</dd></div>
    </dl>
    <div className="sd-pie">
      <button className="btn sec" onClick={() => v.abrir(<MovCaja tipo="sale" pre={{ cat: "adelanto", personaId: mid, semana: sem }} />, "centrada-ancha")}>Adelanto</button>
      <button className="btn ok" disabled={r.neto <= 0} onClick={() => v.abrir(<MovCaja tipo="sale" pre={{ cat: "sueldo", personaId: mid, valor: r.neto, semana: sem }} />, "centrada-ancha")}>Pagar</button>
    </div>
  </div>;
}

/** Adelanto que se devuelve (entra hoy a la caja) o que se registró por error (se borra). */
function QuitarAdelanto({ id }: { id: string }) {
  const v = useVentana(), c = S.cajamovs[id];
  const [val, setVal] = useState(String(c ? valorAdel(c) : "")), [medio, setMedio] = useState<Medio>("efectivo"), [guardando, setGuardando] = useState(false);
  if (!c) return null;
  const m = S.mensajeros[c.personaId], resta = valorAdel(c), liq = c.deLiquidacion ? S.liquidaciones[c.deLiquidacion] : null;
  const devolver = async () => {
    const x = Math.round(Number(val)); if (!(x > 0)) return v.avisar("Escribe un valor mayor a cero"); if (x > resta) return v.avisar("No puede devolver más de " + pesos(resta));
    setGuardando(true);
    try { await devolverAdelanto(id, x, medio); v.cerrar(); v.avisar(`Devolución de ${pesos(x)} registrada`); } catch (e) { setGuardando(false); fallo(v)(e); }
  };
  const quitar = async () => {
    if (!liq && yaContado(c.fecha)) return v.avisar("Ese adelanto ya se contó en un arqueo: si devolvió la plata, usa “Registrar devolución”.");
    if (liq && liquidacionesDe(c.personaId)[0]?.id !== liq.id) return v.avisar("Ya hay una liquidación más nueva de este mensajero: usa “Registrar devolución” cuando pague.");
    if (Number(c.devuelto)) return v.avisar("Este adelanto ya tiene una devolución registrada: no se puede quitar.");
    if (!await v.confirmar("Quitar adelanto", `${m?.nombre || ""} · ${pesos(c.valor)}. ${liq ? "Vuelve a quedar debiéndolo como mensajero." : "La plata vuelve a la caja."}`, "Quitar")) return v.abrir(<QuitarAdelanto id={id} />, "centrada-ancha");
    try { await quitarAdelanto(id); v.avisar("Adelanto quitado"); } catch (e) { v.avisar("No se pudo quitar: " + motivoError(e)); }
  };
  return <div className="form-modal form-doble">
    <Cab sub={<span className="sub">{hora(c.fecha)} · {pesos(c.valor)}{Number(c.devuelto) ? " · ya devolvió " + pesos(c.devuelto || 0) : ""}{c.concepto ? " · " + c.concepto : ""}</span>}><h2>Adelanto de {m?.nombre || ""}</h2></Cab>
    <h2>Devolvió la plata</h2><p className="sub">Entra hoy a la caja y se le deja de descontar del sueldo.</p>
    <div className="linea2"><div className="campo"><label htmlFor="adVal">Valor que devolvió</label><input id="adVal" type="number" inputMode="numeric" min="0" step="1000" value={val} onChange={e => setVal(e.target.value)} /></div>
      <div className="campo"><label htmlFor="adMedio">Medio</label><select id="adMedio" value={medio} onChange={e => setMedio(e.target.value as Medio)}>{MEDIOS_K.map(k => <option key={k} value={k}>{MEDIOS[k]}</option>)}</select></div></div>
    <button className="btn form-guardar" id="adDev" disabled={guardando} onClick={devolver}>Registrar devolución</button>
    <h2>Se registró por error</h2><p className="sub">{liq ? "Salió de una liquidación: se borra y lo que quedó debiendo vuelve a su cuenta de mensajero." : "Se borra y la plata vuelve a la caja en la fecha del adelanto."}</p>
    <button className="btn peligro form-peligro" id="adDel" onClick={quitar}>Quitar adelanto</button>
  </div>;
}

/** Pago fijo por día (patinadores, oficina, JS): se guarda en Personal y se usa al marcar cada día. */
function PedirTarifa({ m, despues }: { m: Persona; despues?: () => Promise<unknown> }) {
  const v = useVentana(), ultimo = Object.values(S.jornadas).filter(j => j.personaId === m.id && !j.id.includes("_previo_")).sort((a, b) => b.dia.localeCompare(a.dia))[0];
  const [val, setVal] = useState(String(Number(m.tarifa) || Number(ultimo?.valor) || "")), [guardando, setGuardando] = useState(false);
  const guardar = async () => {
    const x = Number(val); if (!(x > 0)) return v.avisar("Escribe un valor mayor a cero");
    setGuardando(true);
    try { await guardarPersona(m.id, { tarifa: x }); v.cerrar(); v.avisar("Pago por día de " + m.nombre + ": " + pesos(x)); if (despues) await despues(); }
    catch (e) { setGuardando(false); fallo(v)(e); }
  };
  return <div className="form-modal">
    <Cab><h2>Pago por día de {m.nombre}</h2></Cab>
    <p className="sub">Es lo que se marca cada vez que tocas un día en Sueldos. Cambiarlo no modifica los días ya marcados.</p>
    <div className="campo"><label htmlFor="tfVal">Valor por día</label><input id="tfVal" type="number" inputMode="numeric" min="0" step="1000" autoFocus value={val} onFocus={e => e.target.select()} onChange={e => setVal(e.target.value)} /></div>
    <button className="btn form-guardar" id="tfGuardar" disabled={guardando} onClick={guardar}>Guardar{despues ? " y marcar el día" : ""}</button>
  </div>;
}

/** Lo que ya llevaba ganado esa semana antes de registrarlo en la app. */
function EditarPrevio({ m, sem, despues }: { m: Persona; sem: string; despues?: () => void }) {
  const v = useVentana(), actual = sueldoPrevio(m.id, sem);
  const [val, setVal] = useState(actual ? String(actual) : ""), [guardando, setGuardando] = useState(false);
  const guardar = async () => {
    const x = Number(val) || 0; setGuardando(true);
    try { if (x > 0 || actual) await ponerJornada(m.id, sem, x, true); if (despues) despues(); else v.cerrar(); v.avisar("Sueldo anterior de " + m.nombre + ": " + pesos(x)); }
    catch (e) { setGuardando(false); fallo(v)(e); }
  };
  return <div className="form-modal">
    <Cab sub={<span className="sub">Semana del {fechaLarga(sem)}</span>}><h2>Sueldo anterior de {m.nombre}</h2></Cab>
    <p className="sub">Lo que ya llevaba ganado esta semana antes de registrarlo en la app. Se suma al total de la semana. Déjalo en 0 para quitarlo.</p>
    <div className="campo"><label htmlFor="prVal">Valor</label><input id="prVal" type="number" inputMode="numeric" min="0" step="1000" autoFocus value={val} onFocus={e => e.target.select()} onChange={e => setVal(e.target.value)} /></div>
    <button className="btn form-guardar" id="prGuardar" disabled={guardando} onClick={guardar}>Guardar</button>
  </div>;
}

/** Días con un valor distinto al de siempre (medio día, horas extra…). Vacío o 0 = no trabajó. */
function OtroValor({ m, dias }: { m: Persona; dias: string[] }) {
  const v = useVentana();
  const [vals, setVals] = useState<Record<string, string>>(Object.fromEntries(dias.map(d => [d, jornada(m.id, d) ? String(jornada(m.id, d)) : ""])));
  const [guardando, setGuardando] = useState(false);
  const guardar = async () => {
    setGuardando(true);
    try { for (const d of dias) { const x = Number(vals[d]) || 0; if (x !== jornada(m.id, d)) await ponerJornada(m.id, d, x); } v.cerrar(); v.avisar("Días de " + m.nombre + " guardados"); }
    catch (e) { setGuardando(false); fallo(v)(e); }
  };
  return <div className="form-modal form-doble">
    <Cab sub={<span className="sub">Valor de cada día de la semana</span>}><h2>{m.nombre}</h2></Cab>
    <div className="linea2">{dias.map((d, i) => <div className="campo" style={{ minWidth: 120 }} key={d}><label htmlFor={"ov_" + d}>{DIAS_SEM[i]} {d.slice(8)}</label><input id={"ov_" + d} type="number" inputMode="numeric" min="0" step="1000" placeholder="No trabajó" value={vals[d]} onChange={e => setVals({ ...vals, [d]: e.target.value })} /></div>)}</div>
    <button className="btn form-guardar" id="ovGuardar" disabled={guardando} onClick={guardar}>Guardar</button>
  </div>;
}
