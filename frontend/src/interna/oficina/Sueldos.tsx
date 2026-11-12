/* Oficina → Sueldos: la planilla de la semana, el cálculo del sueldo de Javier y los adelantos (pintarSueldos del prototipo). */
import { useState } from "react";
import {
  S, hoy, hora, pesos, fechaLarga, resumenSemana, moverSemana, semanaDe, tipoDe, jornada, valorAdel, sueldoPrevio, yaContado, liquidacionesDe,
  MEDIOS, TIPOS, PAGO_FIJO, DIAS_SEM, DESC_SUELDO, type Medio, type Persona,
} from "../motor";
import { Cab, useVentana } from "../ui";
import { E } from "../estado";
import { devolverAdelanto, guardarPersona, ponerJornada, quitarAdelanto } from "../acciones";
import { motivoError } from "../datos";
import { MovCaja } from "./modales";

type Ventana = ReturnType<typeof useVentana>;
const MEDIOS_K = Object.keys(MEDIOS) as Medio[];
const fallo = (v: Ventana) => (e: unknown) => v.avisar("No se pudo guardar: " + motivoError(e));

export default function Sueldos({ pintar }: { pintar: () => void }) {
  const v = useVentana(), R = resumenSemana(E.semA), hoyS = hoy();
  const tot = R.filas.reduce((a, f) => ({ total: a.total + f.total, adel: a.adel + f.adel, pagado: a.pagado + f.pagado, neto: a.neto + f.neto }), { total: 0, adel: 0, pagado: 0, neto: 0 });
  const dueno = Object.values(S.mensajeros).find(m => tipoDe(m) === "dueno");
  const adelSem = R.filas.flatMap(f => f.adelantos.map(c => ({ ...c, nom: f.m.nombre }))).sort((a, b) => a.fecha - b.fecha);
  const [ocupado, setOcupado] = useState("");
  const sem = (w: string) => { E.semA = w; pintar(); };
  // Un toque marca el día con el pago por día de la persona; otro toque lo quita
  const tocarDia = async (m: Persona, dia: string) => {
    if (!Number(m.tarifa) && !jornada(m.id, dia)) return v.abrir(<PedirTarifa m={m} despues={() => ponerJornada(m.id, dia, Number(S.mensajeros[m.id]?.tarifa) || 0)} />, "centrada-ancha");
    setOcupado(m.id + dia);
    try { await ponerJornada(m.id, dia, jornada(m.id, dia) ? 0 : Number(m.tarifa)); } catch (e) { fallo(v)(e); }
    setOcupado("");
  };
  const enlace = (t: string, f: () => void) => <a href="#" className="enlace" onClick={e => { e.preventDefault(); f(); }}>{t}</a>;
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
    {R.filas.length ? <div className="tabla-env"><table><thead><tr><th>Persona</th>{R.dias.map((d, i) => <th className="n" key={d}>{DIAS_SEM[i]} {d.slice(8)}</th>)}<th className="n">Anterior</th><th className="n">Total</th><th className="n">Adelantos</th><th className="n">Pagado</th><th className="n">Neto</th><th></th></tr></thead><tbody>
      {R.filas.map(f => { const t = tipoDe(f.m), editable = PAGO_FIJO.includes(t); return <tr key={f.m.id}>
        <td><b>{f.m.nombre}</b><br /><span className="sub" style={{ fontSize: ".8rem" }}>{TIPOS[t]}</span>{editable && <><br /><span className="sub" style={{ fontSize: ".8rem" }}>{f.m.tarifa ? <>{pesos(f.m.tarifa)} por día · {enlace("cambiar", () => v.abrir(<PedirTarifa m={f.m} />, "centrada-ancha"))} · {enlace("otro valor", () => v.abrir(<OtroValor m={f.m} dias={R.dias} />, "centrada-ancha"))}</> : enlace("Poner pago por día", () => v.abrir(<PedirTarifa m={f.m} />, "centrada-ancha"))}</span></>}</td>
        {R.dias.map((d, i) => { const j = jornada(f.m.id, d); return <td className="n" key={d}>{editable ? <button className="dia-btn" aria-pressed={!!j} disabled={(d > hoyS && !j) || ocupado === f.m.id + d} aria-label={`${f.m.nombre} ${DIAS_SEM[i]} ${d.slice(8)}: ${j ? "trabajó" : "no trabajó"}`} onClick={() => tocarDia(f.m, d)}>{j ? "✓ " + pesos(j) : "—"}</button>
          : f.vals[i] ? <span className={f.vals[i] < 0 ? "neg" : ""}>{pesos(f.vals[i])}</span> : "—"}</td>; })}
        <td className="n"><a href="#" className="enlace" title="Sueldo que llevaba antes de la app" onClick={e => { e.preventDefault(); v.abrir(<EditarPrevio m={f.m} sem={R.sem} />, "centrada-ancha"); }}>{f.previo ? pesos(f.previo) : "+"}</a></td>
        <td className="n"><b>{pesos(f.total)}</b></td><td className="n">{f.adel ? pesos(f.adel) : "—"}</td><td className="n">{f.pagado ? pesos(f.pagado) : "—"}</td><td className="n"><b className={f.neto < 0 ? "neg" : ""}>{pesos(f.neto)}</b></td>
        <td><div className="acciones" style={{ margin: 0, flexWrap: "nowrap" }}><button className="btn sec chico" onClick={() => v.abrir(<MovCaja tipo="sale" pre={{ cat: "adelanto", personaId: f.m.id, semana: R.sem }} />, "centrada-ancha")}>Adelanto</button>{f.neto > 0 && <button className="btn ok chico" onClick={() => v.abrir(<MovCaja tipo="sale" pre={{ cat: "sueldo", personaId: f.m.id, valor: f.neto, semana: R.sem }} />, "centrada-ancha")}>Pagar</button>}</div></td></tr>; })}
      <tr><td><b>Total</b></td>{R.dias.map((d, i) => <td className="n" key={d}>{pesos(R.filas.reduce((a, f) => a + f.vals[i], 0))}</td>)}<td className="n">{pesos(R.filas.reduce((a, f) => a + f.previo, 0))}</td><td className="n"><b>{pesos(tot.total)}</b></td><td className="n">{pesos(tot.adel)}</td><td className="n">{pesos(tot.pagado)}</td><td className="n"><b>{pesos(tot.neto)}</b></td><td></td></tr>
    </tbody></table></div> : <div className="vacio">Registra tu personal en la pestaña Personal.</div>}
    <p className="sub" style={{ marginTop: 10 }}>Mensajeros: 70% de sus domicilios del día − {pesos(DESC_SUELDO)}. Patinadores, oficina y JS: toca cada día que trabajó (se marca con su pago por día); toca otra vez para quitarlo. Para un valor distinto, usa “otro valor”. Los domicilios de pedidos a nombre de oficina son 100% de JS y suman al sueldo de Javier.</p>
    {dueno && <><h2>Cálculo del sueldo de {dueno.nombre}</h2><div className="tabla-env"><table><thead><tr><th>Día</th><th className="n">30% domicilios mensajeros</th><th className="n">Domicilios propios y de oficina</th><th className="n">Ganancias ocasionales</th><th className="n">{pesos(DESC_SUELDO)} × mensajeros</th><th className="n">− Pagos fijos (patinadores, oficina, JS)</th><th className="n">Sueldo</th></tr></thead><tbody>
      {R.dias.some((_, i) => { const x = R.porDia[i]; return x.dom30 || x.propios || x.fijos || x.ganancias; })
        ? R.dias.map((d, i) => { const x = R.porDia[i]; if (!x.dom30 && !x.propios && !x.fijos && !x.ganancias) return null; return <tr key={d}><td>{DIAS_SEM[i]} {d.slice(8)}</td><td className="n">{pesos(x.dom30)}</td><td className="n">{pesos(x.propios)}</td><td className="n">{pesos(x.ganancias)}</td><td className="n">{pesos(x.desc)} ({x.nMens})</td><td className="n neg">{pesos(-x.fijos)}</td><td className="n"><b>{pesos(x.javier)}</b></td></tr>; })
        : <tr><td colSpan={7} className="sub">Sin movimiento esta semana.</td></tr>}
    </tbody></table></div></>}
    <h2>Adelantos de la semana</h2>
    {adelSem.length ? <div className="tabla-env"><table><thead><tr><th>Día</th><th>Persona</th><th>Medio</th><th>Detalle</th><th className="n">Valor</th><th></th></tr></thead><tbody>
      {adelSem.map(c => <tr key={c.id}><td>{hora(c.fecha)}</td><td>{c.nom}</td><td>{MEDIOS[c.medio as Medio] || ""}</td><td>{c.concepto || ""}</td><td className="n">{pesos(c.valor)}{Number(c.devuelto) ? <><br /><span className="sub" style={{ fontSize: ".8rem" }}>devolvió {pesos(c.devuelto || 0)}</span></> : null}</td>
        <td>{valorAdel(c) > 0 ? <button className="btn sec chico" onClick={() => v.abrir(<QuitarAdelanto id={c.id} />, "centrada-ancha")}>Devolvió / Quitar</button> : <span className="sub">Devuelto</span>}</td></tr>)}
    </tbody></table></div> : <div className="vacio">Sin adelantos esta semana. Usa el botón “Adelanto” en cada persona.</div>}
  </>;
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
function EditarPrevio({ m, sem }: { m: Persona; sem: string }) {
  const v = useVentana(), actual = sueldoPrevio(m.id, sem);
  const [val, setVal] = useState(actual ? String(actual) : ""), [guardando, setGuardando] = useState(false);
  const guardar = async () => {
    const x = Number(val) || 0; setGuardando(true);
    try { if (x > 0 || actual) await ponerJornada(m.id, sem, x, true); v.cerrar(); v.avisar("Sueldo anterior de " + m.nombre + ": " + pesos(x)); }
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
