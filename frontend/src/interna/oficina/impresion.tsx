/* Impresión de tiquetes de la pestaña Clientes (imprimirTicket y recibosVarios de app/js/app.js): la vista previa
   con el ancho del papel, "Pagar e imprimir" con su "Reversar los pagos", y la ventana para elegir los clientes
   de los recibos. El tiquete sale por la impresión normal del navegador (tiquete.ts). */
import { useState } from "react";
import { MEDIOS, hoy, fechaLarga, pesos, saldoCliente, sinTildes, type Medio } from "../motor";
import { Cab, pl, useVentana } from "../ui";
import { motivoError } from "../datos";
import { pagarSaldos, reversarPagos } from "../acciones";
import { armarRecibo, armarReciboDia, guardarPapel, imprimirTiquetes, letraTiquete, papelGuardado, textosTiquete, type Armar, type Papel } from "../tiquete";

/** Algo que se guarda una sola vez al tocar Imprimir (pagar los saldos). Si falla, no se imprime. */
interface Antes { texto: string; fn: () => Promise<{ hechos: string[]; total: number }> }

export function VentanaTiquete({ titulo, lista, antes: antes0 }: { titulo: string; lista: Armar[]; antes?: Antes | null }) {
  const v = useVentana();
  const [mm, setMm] = useState<Papel>(papelGuardado);
  const [antes, setAntes] = useState(antes0 ?? null);
  const [guardando, setGuardando] = useState(false);
  const [hechos, setHechos] = useState<{ ids: string[]; total: number } | null>(null);
  const [impreso, setImpreso] = useState(false);
  const elegirPapel = (x: Papel) => { setMm(x); guardarPapel(x); };
  const varios = lista.length > 1;

  const imprimir = async () => {
    if (antes) {
      setGuardando(true);
      try {
        const r = await antes.fn();
        setAntes(null);
        if (r.hechos.length) { setHechos({ ids: r.hechos, total: r.total }); v.avisar(`Pagados ${pesos(r.total)} a ${r.hechos.length} ${pl(r.hechos.length, "cliente")}`); }
      } catch (e) { setGuardando(false); return v.avisar("No se pudo guardar el pago. No se imprimió. " + motivoError(e)); }
      setGuardando(false);
    }
    imprimirTiquetes(titulo, lista, mm);
    setImpreso(true);
  };
  // Por si se pagó por error: deshace los pagos que se acaban de registrar.
  const reversar = async () => {
    if (!hechos) return;
    if (!await v.confirmar("Reversar los pagos", `Se quitan ${hechos.ids.length} ${pl(hechos.ids.length, "pago")} por ${pesos(hechos.total)}: la plata vuelve a la caja y los clientes vuelven a quedar con su saldo a favor.`, "Reversar")) return;
    try { await reversarPagos(hechos.ids); v.avisar(`Pagos reversados: ${pesos(hechos.total)}`); v.cerrar(); }
    catch (e) { v.avisar("No se pudieron reversar los pagos: " + motivoError(e) + " Revisa en Cuentas."); }
  };

  const textos = textosTiquete(lista, mm);
  return <div className="tiquete-ventana">
    <Cab sub={<span className="sub">Impresora de tickets SAT-16TU</span>}><h2>{titulo}</h2></Cab>
    <div className="filtros" role="group" aria-label="Ancho del papel">{([[80, "Papel de 80 mm"], [58, "Papel de 58 mm"]] as const).map(([x, t]) =>
      <button key={x} type="button" aria-pressed={mm === x} onClick={() => elegirPapel(x)}>{t}</button>)}</div>
    <p className="sub">En la ventana de impresión elige la SAT-16TU, márgenes “Ninguno” y escala 100 %.{varios ? ` Son ${lista.length} recibos, uno detrás de otro.` : ""}</p>
    <div className="tiquete-previa" aria-label="Vista previa del tiquete">
      {textos.map((x, i) => <pre key={i} style={{ fontSize: letraTiquete(x.cols, mm) }}>{x.txt}</pre>)}
    </div>
    {antes ? <div className="aviso" style={{ marginTop: 10 }}>{antes.texto}</div> : null}
    <button type="button" className="btn" style={{ width: "100%", marginTop: 10 }} disabled={guardando} onClick={imprimir}>
      {guardando ? "Guardando…" : antes ? "Pagar e imprimir" : impreso ? "Imprimir otra vez" : "Imprimir"}{!guardando && varios ? ` ${lista.length} recibos` : ""}
    </button>
    {hechos ? <button type="button" className="btn peligro" style={{ width: "100%", marginTop: 8 }} onClick={reversar}>Reversar los pagos</button> : null}
  </div>;
}

/** Recibos de varios clientes de la lista que se está viendo. Sin día elegido sale el recibo de cuenta; con día,
 *  el recibo de cuadre de ese día. Si es hoy (o no hay día), se les puede pagar el saldo a favor y dejarlos en $ 0. */
export function RecibosVarios({ clientes, k, dia }: { clientes: { id: string; nombre: string; telefono: string }[]; k: (id: string) => number; dia: string }) {
  const v = useVentana();
  const pasado = !!dia && dia !== hoy(); // de un día anterior solo se imprimen: el saldo que se paga es el de hoy
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [buscar, setBuscar] = useState("");
  const [pagar, setPagar] = useState(!pasado);
  const [medio, setMedio] = useState<Medio>("efectivo");
  const q = sinTildes(buscar.trim());
  const vis = clientes.filter(c => !q || sinTildes(c.nombre + " " + (c.telefono || "")).includes(q));
  const aPagar = pagar && !pasado ? [...sel].map(id => [id, Math.round(saldoCliente(id))] as const).filter(([, x]) => x > 0) : [];
  const totalPago = aPagar.reduce((a, [, x]) => a + x, 0), deben = [...sel].filter(id => saldoCliente(id) < 0).length;
  const cambiar = (id: string, si: boolean) => setSel(s => { const n = new Set(s); if (si) n.add(id); else n.delete(id); return n; });

  const imprimir = () => {
    const ids = clientes.map(c => c.id).filter(id => sel.has(id)), pagos = new Map(aPagar);
    const fns = ids.map(id => dia ? armarReciboDia(id, dia, pagos.has(id) ? { medio, valor: pagos.get(id)! } : null) : armarRecibo(id, pagos.has(id) ? { medio } : null))
      .filter((x): x is Armar => !!x);
    if (!fns.length) return v.avisar(dia ? "Ninguno de los elegidos tuvo entregas ni pagos ese día" : "No se pudo armar ningún recibo");
    // El pago se guarda al tocar "Pagar e imprimir", con el saldo de ese momento (si ya quedó en 0, no se paga dos veces).
    const antes: Antes | null = aPagar.length ? {
      texto: `Al imprimir se registra el pago de ${pesos(totalPago)} en ${MEDIOS[medio]} a ${aPagar.length} ${pl(aPagar.length, "cliente")} y quedan en $ 0.`,
      fn: () => pagarSaldos(aPagar.map(([id]) => id), medio),
    } : null;
    v.abrir(<VentanaTiquete titulo={`${fns.length} ${pl(fns.length, "recibo")}`} lista={fns} antes={antes} />);
  };

  return <>
    <Cab sub={<span className="sub">{dia ? "Recibo de cuadre del " + fechaLarga(dia) : "Elige los clientes"}</span>}><h2>Imprimir recibos</h2></Cab>
    <div className="campo"><input type="search" placeholder="Buscar cliente…" autoComplete="off" aria-label="Buscar cliente" value={buscar} onChange={e => setBuscar(e.target.value)} /></div>
    <div className="acciones" style={{ margin: "0 0 8px" }}>
      <button type="button" className="btn sec chico" onClick={() => setSel(s => new Set([...s, ...vis.map(c => c.id)]))}>Marcar todos</button>
      <button type="button" className="btn sec chico" onClick={() => setSel(new Set())}>Ninguno</button>
    </div>
    <div className="recibos-lista">
      {vis.length ? <table><tbody>{vis.map(c => { const x = k(c.id); return <tr key={c.id}>
        <td style={{ width: 32 }}><input type="checkbox" id={"rv-" + c.id} checked={sel.has(c.id)} onChange={e => cambiar(c.id, e.target.checked)} style={{ width: "auto" }} /></td>
        <td><label htmlFor={"rv-" + c.id} style={{ cursor: "pointer" }}><b>{c.nombre}</b></label></td>
        <td className={"n " + (x < 0 ? "neg" : x > 0 ? "pos" : "")}>{pesos(Math.abs(x))}</td>
      </tr>; })}</tbody></table> : <div className="vacio">{clientes.length ? "Ningún cliente con ese nombre." : "No hay clientes en esta lista."}</div>}
    </div>
    {pasado ? <p className="sub" style={{ marginTop: 10 }}>Son recibos de un día anterior: solo se imprimen. Para pagar saldos, elige hoy o quita el filtro de día.</p>
      : <label style={{ display: "flex", gap: 8, alignItems: "flex-start", marginTop: 10 }}><input type="checkbox" checked={pagar} onChange={e => setPagar(e.target.checked)} style={{ width: "auto", marginTop: 3 }} /><span>Pagarles su saldo a favor y dejarlos en $ 0 (sale de la caja)</span></label>}
    {pagar && !pasado ? <div className="campo" style={{ marginTop: 6 }}><label htmlFor="rvMedio">Les pagas en</label>
      <select id="rvMedio" value={medio} onChange={e => setMedio(e.target.value as Medio)}>{Object.entries(MEDIOS).map(([x, t]) => <option key={x} value={x}>{t}</option>)}</select></div> : null}
    {pagar && !pasado && sel.size ? <p className="sub" aria-live="polite">{aPagar.length ? `Se les pagan ${pesos(totalPago)} a ${aPagar.length} ${pl(aPagar.length, "cliente")}.` : "Ninguno de los elegidos tiene saldo a favor."}{deben ? ` ${deben} que te ${deben === 1 ? "debe no cambia" : "deben no cambian"}.` : ""}</p> : null}
    <button type="button" className="btn" style={{ width: "100%", marginTop: 6 }} disabled={!sel.size} onClick={imprimir}>{sel.size ? `Imprimir ${sel.size} ${pl(sel.size, "recibo")}` : "Imprimir"}</button>
  </>;
}
