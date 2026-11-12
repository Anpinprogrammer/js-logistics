/* Oficina → Cuentas: cuentas internas (JS Envíos, MT, Base de JS) y pagos, compras y ganancias de clientes, igual al prototipo. */
import { useRef, useState } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import {
  S, yo, hoy, hora, pesos, diaDe, listaOrdenada, textoCuenta, yaContado, mueveCaja, esPago, nombreCliente, saldoCliente, sinTildes, cajaOficina, puedoCambiarMedio,
  fechaCaja, fechaDia, diaMinCaja, MEDIOS, MOVS, MOVS_OFICINA, TIPOS_CUENTA, resumenCaja, MEDIOS_CAJA, type Medio, type Movimiento, type TipoMov, type CajaMov,
} from "../motor";
import { Cab, FiltroDia, Icono, Paginador, useVentana } from "../ui";
import { RangoFechas } from "../Calendario";
import { E, guardarLocal } from "../estado";
import { borrarDe, crearCuenta, guardarMovimiento, movCaja } from "../acciones";
import { aCaja, aMov, motivoError, useDatos } from "../datos";
import { DEMO } from "../demo";
import { caja as apiCaja, movimientos as apiMovimientos } from "../../api/servicios";
import { usePorPaginaCuentas, usePorPaginaInternos } from "../../lib/pantalla";
import type { GananciaCliente, PaginaCajaMovimientos, PaginaGanancias, PaginaMovimientos } from "../../api/tipos";
import { avisoContado } from "./Pedidos";
import { diaAntesDelArqueo, FormCliente } from "./Clientes";
import { CambiarMedio } from "./Caja";

type Ventana = ReturnType<typeof useVentana>;
type FiltrosCuentas = { tipo: string; buscar: string; desde: string; hasta: string };
/** La página que usa la pantalla: los movimientos ya vienen con las fechas en milisegundos. */
type PaginaMovsUI = Omit<PaginaMovimientos, "movimientos"> & { movimientos: Movimiento[] };
type PaginaInternosUI = Omit<PaginaCajaMovimientos, "movimientos"> & { movimientos: CajaMov[] };

const delTipo = (tipo: string, filtro: string) => filtro === "todos" || (filtro === "pagos" ? tipo === "pago_de_cliente" || tipo === "pago_a_cliente" : filtro === "compras" ? tipo === "compra_cliente" : tipo === "ganancia");
const cortar = <T,>(lista: T[], pagina: number, porPagina: number) => {
  const paginas = Math.max(1, Math.ceil(lista.length / porPagina)), actual = Math.min(Math.max(1, pagina), paginas);
  return { items: lista.slice((actual - 1) * porPagina, actual * porPagina), pagina: actual, total: lista.length, paginas };
};
const dentro = (m: Movimiento, f: FiltrosCuentas) => { const d = diaDe(m.fecha); return (!f.desde || d >= f.desde) && (!f.hasta || d <= f.hasta); };
const busca = (m: Movimiento, q: string) => !q || sinTildes(nombreCliente(m.clienteId) + " " + (m.nota || "")).includes(q);

/** La misma página que arma el servidor, con los datos en memoria (modo demo). */
function paginaMovsDemo(f: FiltrosCuentas, pagina: number, porPagina: number): PaginaMovsUI {
  const q = sinTildes(f.buscar.trim());
  const lista = Object.values(S.movimientos).filter(m => MOVS_OFICINA.includes(m.tipo)).filter(m => dentro(m, f)).filter(m => delTipo(m.tipo, f.tipo)).filter(m => busca(m, q)).sort((a, b) => b.fecha - a.fecha);
  const suma = (t: TipoMov) => lista.filter(m => m.tipo === t).reduce((a, m) => a + (Number(m.valor) || 0), 0);
  const p = cortar(lista, pagina, porPagina);
  return { movimientos: p.items, pagina: p.pagina, porPagina, total: p.total, paginas: p.paginas, totales: { recibido: suma("pago_de_cliente"), pagado: suma("pago_a_cliente"), compras: suma("compra_cliente"), ganancia: suma("ganancia") } };
}

/** Movimientos de las cuentas internas en memoria (modo demo). */
function paginaInternosDemo(f: { dia: string; medio: string }, pagina: number, porPagina: number): PaginaInternosUI {
  const lista = Object.values(S.cajamovs).filter(m => m.cat === "interna").filter(m => !f.dia || diaDe(m.fecha) === f.dia).filter(m => !f.medio || m.medio === f.medio).sort((a, b) => b.fecha - a.fecha);
  const p = cortar(lista, pagina, porPagina);
  return { movimientos: p.items, pagina: p.pagina, porPagina, total: p.total, paginas: p.paginas };
}

/** Ganancias por cliente en memoria (modo demo). */
function paginaGananciasDemo(f: FiltrosCuentas, pagina: number, porPagina: number): PaginaGanancias {
  const q = sinTildes(f.buscar.trim());
  const filtrados = Object.values(S.movimientos).filter(m => MOVS_OFICINA.includes(m.tipo)).filter(m => dentro(m, f)).filter(m => busca(m, q));
  const por = new Map<string, GananciaCliente>();
  for (const m of filtrados) {
    if (!m.clienteId) continue;
    const x = por.get(m.clienteId) ?? { clienteId: m.clienteId, nombre: nombreCliente(m.clienteId) || "(eliminado)", recibido: 0, compras: 0, ganancia: 0 };
    const val = Number(m.valor) || 0;
    if (m.tipo === "pago_de_cliente") x.recibido += val; else if (m.tipo === "compra_cliente") x.compras += val; else if (m.tipo === "ganancia") x.ganancia += val;
    por.set(m.clienteId, x);
  }
  const lista = [...por.values()].sort((a, b) => b.ganancia - a.ganancia || b.compras - a.compras || b.recibido - a.recibido);
  const totalGanancia = filtrados.filter(m => m.tipo === "ganancia").reduce((a, m) => a + (Number(m.valor) || 0), 0);
  const p = cortar(lista, pagina, porPagina);
  return { clientes: p.items, pagina: p.pagina, porPagina, total: p.total, paginas: p.paginas, totalGanancia };
}
const MEDIOS_K = Object.keys(MEDIOS) as Medio[];
const medioAntes = (x: { medio: string; medioAntes?: string }) => x.medioAntes && x.medioAntes !== x.medio ? <> <span className="sub" style={{ fontSize: ".8rem" }}>(antes {MEDIOS[x.medioAntes as Medio] || x.medioAntes})</span></> : null;

/** Un pago ya contado en un arqueo no se borra: se registra hoy un pago contrario por el mismo valor. */
const reversarPago = (m: Movimiento) => yaContado(m.fecha) ? guardarMovimiento(null, { clienteId: m.clienteId, tipo: m.tipo === "pago_a_cliente" ? "pago_de_cliente" : "pago_a_cliente", valor: Number(m.valor) || 0, medio: m.medio || "efectivo", nota: "Reverso del pago del " + hora(m.fecha), fecha: Date.now() }) : borrarDe("movimientos", m.id);

export default function Cuentas({ pintar }: { pintar: () => void }) {
  const v = useVentana();
  const cs = listaOrdenada(S.cuentas, "nombre");
  const R = resumenCaja();
  const [creando, setCreando] = useState(false);
  const poner = (cambio: Partial<typeof E>) => { Object.assign(E, cambio); pintar(); };
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

  const tabs = [["cuentas", "Cuentas"], ["movimientos", "Movimientos"], ["ganancias", "Ganancias"]] as const;
  const ir = (t: typeof E.tabCuentas) => { E.tabCuentas = t; guardarLocal("js_cuentas", t); pintar(); };
  // Flechas, Inicio y Fin para pasar de pestaña.
  const alTeclear = (e: React.KeyboardEvent) => {
    const i = tabs.findIndex(([k]) => k === E.tabCuentas);
    const j = e.key === "ArrowRight" ? (i + 1) % tabs.length : e.key === "ArrowLeft" ? (i - 1 + tabs.length) % tabs.length : e.key === "Home" ? 0 : e.key === "End" ? tabs.length - 1 : -1;
    if (j < 0) return;
    e.preventDefault();
    ir(tabs[j][0]);
    requestAnimationFrame(() => document.getElementById("tabCue-" + tabs[j][0])?.focus());
  };

  // El servidor filtra, cuenta y corta; en demo se imita con los datos en memoria.
  const porPagina = usePorPaginaCuentas();
  const { version } = useDatos();
  const [buscar, setBuscar] = useState(E.buscarCue);
  const [buscarGan, setBuscarGan] = useState(E.buscarGan);
  const tBuscar = useRef<number>(0), tBuscarGan = useRef<number>(0);
  const arribaMovs = useRef<HTMLDivElement>(null), arribaGan = useRef<HTMLDivElement>(null);
  const alBuscar = (x: string) => { setBuscar(x); clearTimeout(tBuscar.current); tBuscar.current = window.setTimeout(() => poner({ buscarCue: x, paginaCue: 1 }), 300); };
  const alBuscarGan = (x: string) => { setBuscarGan(x); clearTimeout(tBuscarGan.current); tBuscarGan.current = window.setTimeout(() => poner({ buscarGan: x, paginaGan: 1 }), 300); };
  const qMovs = useQuery({
    queryKey: ["movimientos", "cuentas", E.tipoCue, E.buscarCue, E.desdeCue, E.hastaCue, E.paginaCue, porPagina, version],
    enabled: E.tabCuentas === "movimientos",
    placeholderData: keepPreviousData,
    queryFn: (): Promise<PaginaMovsUI> => DEMO
      ? Promise.resolve(paginaMovsDemo({ tipo: E.tipoCue, buscar: E.buscarCue, desde: E.desdeCue, hasta: E.hastaCue }, E.paginaCue, porPagina))
      : apiMovimientos.pagina({ tipo: E.tipoCue, buscar: E.buscarCue, desde: E.desdeCue, hasta: E.hastaCue }, E.paginaCue, porPagina).then(r => ({ ...r, movimientos: r.movimientos.map(aMov) }))
  });
  const pag = qMovs.data, filas = pag?.movimientos ?? [];
  const tot = pag?.totales ?? { recibido: 0, pagado: 0, compras: 0, ganancia: 0 };
  const qGan = useQuery({
    queryKey: ["movimientos", "ganancias", E.buscarGan, E.desdeCue, E.hastaCue, E.paginaGan, porPagina, version],
    enabled: E.tabCuentas === "ganancias",
    placeholderData: keepPreviousData,
    queryFn: () => DEMO
      ? Promise.resolve(paginaGananciasDemo({ tipo: "todos", buscar: E.buscarGan, desde: E.desdeCue, hasta: E.hastaCue }, E.paginaGan, porPagina))
      : apiMovimientos.ganancias({ buscar: E.buscarGan, desde: E.desdeCue, hasta: E.hastaCue }, E.paginaGan, porPagina)
  });
  const pagGan = qGan.data, ganFilas = pagGan?.clientes ?? [];
  const porPaginaInt = usePorPaginaInternos();
  const arribaInt = useRef<HTMLDivElement>(null);
  const qInt = useQuery({
    queryKey: ["cajamovs", "interna", E.diaInternos, E.medioInternos, E.paginaInternos, porPaginaInt, version],
    enabled: E.tabCuentas === "cuentas",
    placeholderData: keepPreviousData,
    queryFn: (): Promise<PaginaInternosUI> => DEMO
      ? Promise.resolve(paginaInternosDemo({ dia: E.diaInternos, medio: E.medioInternos }, E.paginaInternos, porPaginaInt))
      : apiCaja.movimientosPagina({ dia: E.diaInternos, medio: E.medioInternos }, E.paginaInternos, porPaginaInt).then(r => ({ ...r, movimientos: r.movimientos.map(aCaja) }))
  });
  const pagInt = qInt.data, movs = pagInt?.movimientos ?? [];
  const irInt = (n: number) => { poner({ paginaInternos: n }); arribaInt.current?.scrollIntoView({ block: "start", behavior: "smooth" }); };
  const irMovs = (n: number) => { poner({ paginaCue: n }); arribaMovs.current?.scrollIntoView({ block: "start", behavior: "smooth" }); };
  const irGan = (n: number) => { poner({ paginaGan: n }); arribaGan.current?.scrollIntoView({ block: "start", behavior: "smooth" }); };
  const conRango = E.desdeCue || E.hastaCue;
  return <>
    <h1>Cuentas</h1>
    <p className="sub">Entradas y salidas de JS Envíos, MT y la base de JS. Mueven la caja; no tocan clientes ni sueldos.</p>
    <div className="cab-cuentas">
      <div className="seg subtabs subtabs-cuentas" role="tablist" aria-label="Secciones de Cuentas">
        {tabs.map(([k, t]) => <button key={k} id={"tabCue-" + k} type="button" role="tab" aria-selected={E.tabCuentas === k} aria-controls={"panelCue-" + k} tabIndex={E.tabCuentas === k ? 0 : -1} onClick={() => ir(k)} onKeyDown={alTeclear}>{t}</button>)}
      </div>
      {yo.esAdmin && <button type="button" className="btn agregar" id="cuNueva" onClick={() => v.abrir(<NuevaCuenta />, "centrada")}>+ Nueva cuenta</button>}
    </div>

    <div role="tabpanel" id="panelCue-cuentas" aria-labelledby="tabCue-cuentas" hidden={E.tabCuentas !== "cuentas"}>
      <div className="cifras cifras-cuentas">
        <div className="cifra fuerte"><span>Total en caja</span><b>{pesos(R.total)}</b><span>{Object.entries(R.porMedio).filter(([, x]) => Math.round(x)).map(([m, x]) => `${MEDIOS_CAJA[m] || m}: ${pesos(x)}`).join(" · ") || "Sin movimientos"}</span></div>
        {(["efectivo", "nequi", "bancolombia"] as const).map(k => <div className="cifra" key={k}><span>{MEDIOS_CAJA[k] || k}</span><b>{pesos(R.porMedio[k] || 0)}</b></div>)}
        <div className="cifra"><span>Disponible de JS</span><b className={R.disponible < 0 ? "neg" : ""}>{pesos(R.disponible)}</b><span>Caja − clientes − sueldos</span></div>
      </div>
      <div className="mgrid mgrid-cuentas">
        {cs.map(cu => { const t = textoCuenta(cu); return <div className="mcard mcard-cuenta" key={cu.id}><div className="mcard-top"><b>{cu.nombre}</b><span className="acciones"><button className="btn ok chico" onClick={() => v.abrir(<MovCuenta id={cu.id} tipo="entra" />, "centrada")}>Entrada</button><button className="btn sec chico" onClick={() => v.abrir(<MovCuenta id={cu.id} tipo="sale" />, "centrada")}>Salida</button></span></div>
          <span className="sub mcard-cuenta-sub">{TIPOS_CUENTA[cu.tipo] || ""}</span><dl className="datos"><dt>{t.txt}</dt><dd className={t.cls}>{t.val}</dd></dl></div>; })}
      </div>
      {!cs.length ? <div className="vacio">{yo.esAdmin ? <>Todavía no hay cuentas. <button className="btn chico" id="cuSemilla" disabled={creando} onClick={semilla}>Crear JS Envíos, MT y Base de JS</button></> : "El administrador todavía no ha creado las cuentas."}</div> : null}
      <div className="cab-mov-cuentas">
        <h2>Movimientos de las cuentas</h2>
        <div className="filtros-mov">
          <FiltroDia compacto id="diaInternos" d={E.diaInternos} poner={d => poner({ diaInternos: d, paginaInternos: 1 })} />
          <select className="sel-medio" aria-label="Filtrar por medio" value={E.medioInternos} onChange={e => poner({ medioInternos: e.target.value as typeof E.medioInternos, paginaInternos: 1 })}>
            <option value="">Todos los medios</option><option value="efectivo">Efectivo</option><option value="nequi">Nequi</option><option value="bancolombia">Bancolombia</option>
          </select>
        </div>
      </div>
      <div ref={arribaInt} style={{ scrollMarginTop: 90 }} />
      {qInt.isError ? <div className="aviso alerta">No se pudieron traer los movimientos: {motivoError(qInt.error)} <button className="btn chico" onClick={() => qInt.refetch()}>Intentar otra vez</button></div>
        : !pagInt ? <div className="vacio">Cargando movimientos…</div>
        : movs.length ? <>
          <div className="tabla-env con-acciones" aria-busy={qInt.isFetching} style={qInt.isPlaceholderData ? { opacity: .6 } : undefined}><table className="tabla-internas"><thead><tr><th className="col-fecha">Fecha</th><th>Cuenta</th><th>Motivo</th><th>Medio</th><th className="n">Valor</th>{yo.esAdmin && <th className="col-acciones">Acciones</th>}</tr></thead><tbody>
            {movs.map(c => <tr key={c.id}><td className="col-fecha">{hora(c.fecha)}</td><td>{S.cuentas[c.cuentaId || ""]?.nombre || "—"}</td><td>{c.concepto || ""}</td><td>{MEDIOS[c.medio as Medio] || ""}</td><td className={"n " + (c.tipo === "entra" ? "pos" : "neg")}>{c.tipo === "entra" ? "+ " : "− "}{pesos(c.valor)}</td>
              {yo.esAdmin && <td className="col-acciones"><div className="acciones-celda">
                <span className="accion-icono peligro">
                  <button type="button" onClick={() => quitarCu(c.id)} aria-label="Quitar movimiento"><Icono n="papelera" /></button>
                  <span className="accion-tip" role="tooltip"><i /><span>Quitar movimiento</span></span>
                </span>
              </div></td>}</tr>)}
          </tbody></table></div>
          <Paginador pagina={pagInt.pagina} paginas={pagInt.paginas} total={pagInt.total} porPagina={pagInt.porPagina} ir={irInt} cargando={qInt.isPlaceholderData} />
        </> : <div className="vacio">Sin movimientos con esos filtros.</div>}
    </div>

    <div role="tabpanel" id="panelCue-movimientos" aria-labelledby="tabCue-movimientos" hidden={E.tabCuentas !== "movimientos"}>
      <div className="toolbar-cuentas">
        <div className="campo"><input id="buscarCue" type="search" placeholder="Buscar cliente o detalle…" value={buscar} aria-label="Buscar por cliente o detalle"
          onChange={e => alBuscar(e.target.value)} /></div>
        <div className="seg seg-tipo" role="group" aria-label="Tipo de movimiento">
          {([["todos", "Todos"], ["pagos", "Pagos"], ["compras", "Compras"], ["ganancias", "Ganancias"]] as const).map(([k, t]) => <button key={k} aria-pressed={E.tipoCue === k} onClick={() => poner({ tipoCue: k, paginaCue: 1 })}>{t}</button>)}
        </div>
        <div className="rango-cuentas">
          <RangoFechas id="rangoCue" desde={E.desdeCue} hasta={E.hastaCue} alCambiar={r => poner({ desdeCue: r.desde, hastaCue: r.hasta, paginaCue: 1, paginaGan: 1 })} />
          {conRango ? <button type="button" className="btn sec chico" onClick={() => poner({ desdeCue: "", hastaCue: "", paginaCue: 1, paginaGan: 1 })}>Ver todo</button> : null}
        </div>
      </div>
      <div className="cifras cifras-cuentas">
        <div className="cifra fuerte"><span>Pagos recibidos</span><b className="pos">{pesos(tot.recibido)}</b></div>
        <div className="cifra"><span>Compras registradas</span><b>{pesos(tot.compras)}</b></div>
        <div className="cifra"><span>Pagos a clientes</span><b>{pesos(tot.pagado)}</b></div>
        <div className="cifra"><span>Ganancia neta</span><b className="pos">{pesos(tot.ganancia)}</b><span>Ganancia ocasional del rango</span></div>
      </div>
      <div className="acciones acciones-cuentas"><button className="btn ok" id="cuPago" onClick={() => v.abrir(<MovClienteOficina tipo="pago_de_cliente" />, "centrada")}>Pago de un cliente</button><button className="btn" id="cuPagoA" onClick={() => v.abrir(<MovClienteOficina tipo="pago_a_cliente" />, "centrada")}>Pagarle a un cliente</button><button className="btn" id="cuCompra" onClick={() => v.abrir(<MovClienteOficina tipo="compra_cliente" />, "centrada")}>Compra para un cliente</button><button className="btn sec" id="cuGanancia" onClick={() => v.abrir(<MovClienteOficina tipo="ganancia" />, "centrada")}>Ganancia ocasional</button></div>
      <details className="ayuda-cuentas"><summary>Cómo se calculan los pagos, compras y ganancias</summary>
        <p className="sub">El pago de un cliente entra a la caja (efectivo, Nequi o Bancolombia) y se descuenta de lo que debe. Pagarle a un cliente es entregarle su saldo a favor: sale de la caja. La compra sale de la caja y queda como deuda del cliente; al entregar se compensa con lo cobrado. La ganancia ocasional se le carga al cliente y suma al sueldo de JS.</p></details>
      <div ref={arribaMovs} style={{ scrollMarginTop: 90 }} />
      {qMovs.isError ? <div className="aviso alerta">No se pudieron traer los movimientos: {motivoError(qMovs.error)} <button className="btn chico" onClick={() => qMovs.refetch()}>Intentar otra vez</button></div>
        : !pag ? <div className="vacio">Cargando movimientos…</div>
        : filas.length ? <>
          <div className="tabla-env" aria-busy={qMovs.isFetching} style={qMovs.isPlaceholderData ? { opacity: .6 } : undefined}><table><thead><tr><th>Fecha</th><th>Cliente</th><th>Tipo</th><th>Detalle</th><th>Registró</th><th className="n">Valor</th><th></th></tr></thead><tbody>
            {filas.map(m => <tr key={m.id}><td>{hora(m.fecha)}</td><td>{nombreCliente(m.clienteId) || "—"}</td><td>{tipoTxt(m)}{medioAntes(m)}</td><td>{m.nota || ""}</td><td>{m.porNombre || ""}</td><td className="n">{pesos(m.valor)}</td>
              {yo.esAdmin ? <td style={{ whiteSpace: "nowrap" }}><button className="btn sec chico" onClick={() => editar(v, m)}>Editar</button> <button className="btn peligro chico" onClick={() => quitarMx(m)}>Quitar</button></td>
                : <td>{m.tipo !== "ganancia" && puedoCambiarMedio(m) ? <button className="btn sec chico" onClick={() => (yaContado(m.fecha) ? avisoContado(v) : v.abrir(<CambiarMedio col="movimientos" id={m.id} />, "centrada"))}>Cambiar medio</button> : null}</td>}</tr>)}
          </tbody></table></div>
          <Paginador pagina={pag.pagina} paginas={pag.paginas} total={pag.total} porPagina={pag.porPagina} ir={irMovs} cargando={qMovs.isPlaceholderData} />
        </> : <div className="vacio">No hay movimientos con esos filtros.</div>}
    </div>

    <div role="tabpanel" id="panelCue-ganancias" aria-labelledby="tabCue-ganancias" hidden={E.tabCuentas !== "ganancias"}>
      <div className="cab-ganancias">
        <div><h2>Ganancias por cliente</h2><p className="sub">Ganancia ocasional cargada a cada cliente, con el rango de fechas de Movimientos.</p></div>
        <div className="campo"><input id="buscarGan" type="search" placeholder="Buscar cliente…" value={buscarGan} aria-label="Buscar cliente"
          onChange={e => alBuscarGan(e.target.value)} /></div>
      </div>
      <div className="cifras cifras-cuentas">
        <div className="cifra fuerte"><span>Ganancia neta</span><b className="pos">{pesos(pagGan?.totalGanancia ?? 0)}</b><span>{pagGan?.total ?? 0} {(pagGan?.total ?? 0) === 1 ? "cliente" : "clientes"} con movimientos</span></div>
      </div>
      <div ref={arribaGan} style={{ scrollMarginTop: 90 }} />
      {qGan.isError ? <div className="aviso alerta">No se pudieron traer las ganancias: {motivoError(qGan.error)} <button className="btn chico" onClick={() => qGan.refetch()}>Intentar otra vez</button></div>
        : !pagGan ? <div className="vacio">Cargando ganancias…</div>
        : ganFilas.length ? <>
          <div className="tabla-env" aria-busy={qGan.isFetching} style={qGan.isPlaceholderData ? { opacity: .6 } : undefined}><table><thead><tr><th>Cliente</th><th className="n">Pagos recibidos</th><th className="n">Compras</th><th className="n">Ganancia neta</th></tr></thead><tbody>
            {ganFilas.map(x => <tr key={x.clienteId}><td><b>{x.nombre || nombreCliente(x.clienteId) || "(eliminado)"}</b></td><td className="n">{pesos(x.recibido)}</td><td className="n">{pesos(x.compras)}</td><td className="n pos">{pesos(x.ganancia)}</td></tr>)}
          </tbody></table></div>
          <Paginador pagina={pagGan.pagina} paginas={pagGan.paginas} total={pagGan.total} porPagina={pagGan.porPagina} ir={irGan} cargando={qGan.isPlaceholderData} />
        </> : <div className="vacio">No hay ganancias con ese rango de fechas.</div>}
    </div>
  </>;
}
const editar = (v: Ventana, m: Movimiento) => { if (mueveCaja(m) && yaContado(m.fecha)) return avisoContado(v); v.abrir(<MovClienteOficina tipo={m.tipo} mov={m} />, "centrada"); };

function NuevaCuenta() {
  const v = useVentana(), [nombre, setNombre] = useState(""), [tipo, setTipo] = useState<"socio" | "base">("socio");
  const guardar = async () => { const n = nombre.trim(); if (!n) return v.avisar("Escribe el nombre");
    try { await crearCuenta(n, tipo); v.cerrar(); v.avisar("Cuenta creada"); } catch (e) { v.avisar("No se pudo crear: " + motivoError(e)); } };
  return <div className="form-modal">
    <Cab><h2>Nueva cuenta</h2></Cab>
    <div className="campo"><label htmlFor="ncNom">Nombre</label><input id="ncNom" placeholder="Ej: JS Envíos" autoFocus value={nombre} onChange={e => setNombre(e.target.value)} /></div>
    <div className="campo"><label htmlFor="ncTipo">Tipo</label><select id="ncTipo" value={tipo} onChange={e => setTipo(e.target.value as "socio" | "base")}>{Object.entries(TIPOS_CUENTA).map(([k, t]) => <option key={k} value={k}>{t}</option>)}</select></div>
    <button className="btn form-guardar" id="ncGuardar" onClick={guardar}>Crear cuenta</button>
  </div>;
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
  return <div className="form-modal">
    <Cab sub={<span className="sub">{t.txt}: {t.val}</span>}><h2>{tipo === "entra" ? "Entrada de" : "Salida a"} {cu.nombre}</h2></Cab>
    <p className="sub">{tipo === "entra" ? "Dinero que entra a la caja desde esta cuenta." : "Dinero que sale de la caja hacia esta cuenta."}</p>
    <div className="linea2"><div className="campo"><label htmlFor="mcVal">Valor</label><input id="mcVal" type="number" inputMode="numeric" min="0" step="1000" autoFocus value={val} onChange={e => setVal(e.target.value)} /></div>
      <div className="campo"><label htmlFor="mcMedio">Medio</label><select id="mcMedio" value={medio} onChange={e => setMedio(e.target.value as Medio)}>{MEDIOS_K.map(k => <option key={k} value={k}>{MEDIOS[k]}</option>)}</select></div></div>
    <div className="linea2"><div className="campo"><label htmlFor="mcDia">Día</label><input id="mcDia" type="date" value={dia} min={diaMinCaja()} max={hoy()} onChange={e => setDia(e.target.value)} /></div>
      <div className="campo"><label htmlFor="mcMot">Motivo</label><input id="mcMot" placeholder={tipo === "entra" ? "Ej: devolución del préstamo" : "Ej: préstamo para nómina"} value={mot} onChange={e => setMot(e.target.value)} /></div></div>
    <button className="btn form-guardar" id="mcGuardar" disabled={guardando} onClick={guardar}>Registrar {tipo === "entra" ? "entrada" : "salida"}</button>
  </div>;
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
  const nuevoCli = () => v.abrir(<FormCliente nombre={bus.trim()} alGuardar={cid => v.abrir(<MovClienteOficina tipo={tipo} mov={mov} pre={{ ...x, cid }} />, "centrada")} />, "centrada");
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
  return <div className="form-modal">
    <Cab><h2>{titulo}</h2></Cab>
    {mov && <div className="campo"><label htmlFor="mxTipo">Tipo</label><select id="mxTipo" value={tipo} onChange={e => v.abrir(<MovClienteOficina tipo={e.target.value as TipoMov} mov={mov} pre={x} />, "centrada")}>{MOVS_OFICINA.map(k => <option key={k} value={k}>{MOVS[k].t}</option>)}</select></div>}
    <p className="sub">{pago ? "El dinero entra a la caja en el medio que elijas y se descuenta de lo que el cliente debe." : pagoA ? "Le entregas al cliente su saldo a favor: sale de la caja en el medio que elijas y se descuenta de lo que JS le debe." + (miCaja ? ` Tienes ${MEDIOS_K.map(k => MEDIOS[k] + " " + pesos(miCaja[k])).join(" · ")}.` : "") : compra ? "Sale de la caja y queda como deuda del cliente. En el pedido pon el domicilio y en “a cobrar” lo que se le cobra al destinatario; al entregar se compensa." : "Se le carga al cliente (queda por cobrar) y suma 100% al sueldo de JS ese día. Ej: $4.000 por punto extra."}</p>
    <div className="campo"><label htmlFor="mxCli">Cliente</label><div style={{ display: "flex", gap: 6, marginBottom: 6 }}><input id="mxBus" type="search" placeholder="Buscar cliente…" autoComplete="off" style={{ flex: 1 }} value={bus} onChange={e => buscar(e.target.value)} /><button className="btn sec chico" id="mxNuevoCli" type="button" onClick={nuevoCli}>+ Cliente nuevo</button></div>
      <select id="mxCli" value={x.cid} onChange={e => elegir(e.target.value)}><option value="">{vis.length ? "Elige…" : "Ningún cliente con ese nombre"}</option>{(x.cid && !vis.some(c => c.id === x.cid) && S.clientes[x.cid] ? [S.clientes[x.cid], ...vis] : vis).map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}</select>
      <span className="sub" id="mxSaldo" style={{ display: "block", marginTop: 4 }}>{!x.cid ? "" : s < 0 ? <b className="neg">Debe {pesos(-s)}</b> : s > 0 ? <b className="pos">Tiene {pesos(s)} a favor</b> : "Está a paz y salvo"}</span></div>
    <div className="linea2"><div className="campo"><label htmlFor="mxVal">{pago ? "Valor que pagó" : pagoA ? "Valor que le entregas" : "Valor"}</label><input id="mxVal" type="number" inputMode="numeric" min="0" step="100" value={x.val} onChange={e => setX({ ...x, val: e.target.value })} /></div>
      {conMedio && <div className="campo"><label htmlFor="mxMedio">{pago ? "¿Cómo pagó?" : pagoA ? "¿Cómo le pagas?" : "Pagado con"}</label><select id="mxMedio" value={x.medio} onChange={e => setX({ ...x, medio: e.target.value })}>{pago || pagoA ? <option value="">Elige…</option> : null}{MEDIOS_K.map(k => <option key={k} value={k}>{MEDIOS[k]}</option>)}</select></div>}</div>
    <div className="linea2">{!soloHoy && <div className="campo"><label htmlFor="mxDia">Día</label><input id="mxDia" type="date" value={x.dia || hoy()} max={hoy()} onChange={e => setX({ ...x, dia: e.target.value })} /></div>}
      <div className="campo"><label htmlFor="mxNota">Detalle</label><input id="mxNota" value={x.nota} onChange={e => setX({ ...x, nota: e.target.value })} placeholder={pago ? "Ej: comprobante Nequi 4521" : pagoA ? "Ej: entregado en oficina" : compra ? "Ej: compra en almacén · guía JS-00120" : "Ej: 3 puntos extra · guía JS-00120"} /></div></div>
    <button className="btn form-guardar" id="mxGuardar" disabled={guardando} onClick={guardar}>{mov ? "Guardar cambios" : pago || pagoA ? "Registrar pago" : "Registrar"}</button>
  </div>;
}
