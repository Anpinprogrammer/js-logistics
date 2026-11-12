/* Devoluciones: dónde quedó el paquete y el reintento. El reintento es una guía NUEVA enlazada a la original, que conserva su
   devolución y su cobro; la nueva se cobra como cualquier domicilio. Lo usan el mensajero (Entrega.tsx) y la oficina (Pedidos.tsx). */
import { useState, type ReactNode } from "react";
import { S, yo, DESTINOS_DEV, cadenaGuias, hora, listaOrdenada, esRepartidor, pesos } from "../motor";
import { E } from "../estado";
import { Cab, EtqEstado, useVentana } from "../ui";
import { destinoDevolucion, reintentar } from "../acciones";
import { motivoError, useDatos } from "../datos";

/** Todas las guías de una misma entrega, para que nadie se pierda entre números distintos. */
export function CadenaGuias({ guia, abrirGuia }: { guia: string; abrirGuia: (g: string) => void }) {
  useDatos();
  const cadena = cadenaGuias(guia);
  if (cadena.length < 2) return null;
  return <div className="cadena" aria-label="Guías de esta entrega">
    <span className="lbl">Guías de esta entrega</span>
    <ol>{cadena.map(g => { const p = S.pedidos[g]; return <li key={g} className={g === guia ? "actual" : ""}>
      {g === guia ? <span className="guia">{g}</span> : <button type="button" className="guia enlace" onClick={() => abrirGuia(g)}>{g}</button>}
      {p ? <> <EtqEstado p={p} /> <span className="sub">{hora(p.creado)}</span></> : null}</li>; })}</ol>
  </div>;
}

/** Mensajero: ¿qué hiciste con el paquete devuelto? Oficina (`oficina`): corrige dónde está. */
export function DlgDestinoDev({ guia, oficina = false, volver }: { guia: string; oficina?: boolean; volver?: () => void }) {
  const v = useVentana(), p = S.pedidos[guia];
  const [trabajando, setTrabajando] = useState(false);
  if (!p) return null;
  const cerrar = () => (volver ? volver() : v.cerrar());
  const hecho = async (fn: () => Promise<string | void>, ok: (r: string | void) => string) => {
    setTrabajando(true);
    try { const r = await fn(); cerrar(); v.avisar(ok(r)); } catch (e) { setTrabajando(false); v.avisar("No se pudo guardar: " + motivoError(e) + "."); }
  };
  const reintento = async () => {
    if (!await v.confirmar("Hacer el reintento de " + guia, "Se crea una guía nueva en tu lista, enlazada a esta. Al cliente se le cobra el domicilio otra vez, igual que un pedido normal.", "Crear reintento")) return v.abrir(<DlgDestinoDev guia={guia} oficina={oficina} volver={volver} />, "centrada");
    await hecho(() => reintentar(guia), r => "Reintento creado: " + r + ". Está en tu lista, por entregar.");
  };
  return <>
    <Cab sub={<span className="sub">{p.clienteNombre || "Remitente sin asignar"}</span>}><h2>{oficina ? "Dónde está el paquete" : "¿Qué hiciste con el paquete?"} <span className="guia">{guia}</span></h2></Cab>
    <p className="sub">{oficina ? "Indica si el paquete quedó con el cliente o está en la oficina." : "Esta guía ya quedó como devuelta. Cuéntanos dónde quedó el paquete."}</p>
    <div className="destinos">
      <button type="button" className="btn" disabled={trabajando} onClick={() => hecho(() => destinoDevolucion(guia, "cliente"), () => "Anotado: el paquete de " + guia + " quedó con el cliente")}>{oficina ? "El paquete está con el cliente" : "Se lo entregué al cliente"}</button>
      <button type="button" className="btn" disabled={trabajando} onClick={() => hecho(() => destinoDevolucion(guia, "oficina"), () => "Anotado: el paquete de " + guia + " está en la oficina")}>{oficina ? "El paquete está en la oficina" : "Lo llevé a la oficina"}</button>
      {!oficina && <button type="button" className="btn ok" disabled={trabajando} onClick={reintento}>Haré el reintento<small>Normalmente porque administración te lo indicó</small></button>}
    </div>
    <button type="button" className="btn sec" style={{ width: "100%", marginTop: 10 }} disabled={trabajando} onClick={cerrar}>{oficina ? "Cancelar" : "Decidir después"}</button>
  </>;
}

/** Oficina: crea la guía del reintento y la asigna a un mensajero. Con el paquete en la oficina nace en ruta; con el cliente, por recoger. */
export function DlgReintentoOficina({ guia, volver }: { guia: string; volver: (nueva?: string) => void }) {
  const v = useVentana(), p = S.pedidos[guia];
  const mens = listaOrdenada(S.mensajeros, "nombre").filter(esRepartidor);
  const [mid, setMid] = useState(S.mensajeros[p?.mensajeroId || ""] && esRepartidor(S.mensajeros[p.mensajeroId]) ? p.mensajeroId : ""), [trabajando, setTrabajando] = useState(false);
  if (!p) return null;
  const conCliente = p.destinoDev === "cliente";
  const crear = async () => {
    if (!mid) return v.avisar("Elige quién hará el reintento");
    setTrabajando(true);
    try { const nueva = await reintentar(guia, mid); volver(nueva); v.avisar("Reintento creado: " + nueva); } catch (e) { setTrabajando(false); v.avisar("No se pudo crear: " + motivoError(e) + "."); }
  };
  return <>
    <Cab sub={<span className="sub">{p.clienteNombre || "Remitente sin asignar"}</span>}><h2>Reintentar la entrega <span className="guia">{guia}</span></h2></Cab>
    {p.reintentoPedido ? <div className="aviso">El cliente pidió este reintento el {hora(p.reintentoPedido)}.</div> : null}
    <p className="sub">Se crea una guía nueva enlazada a esta. {conCliente ? "El paquete está con el cliente: el mensajero lo ve en “Por recoger” y le toma la foto." : "El paquete está en la oficina: la guía queda en ruta."}</p>
    <div className="campo"><label htmlFor="rMens">Mensajero</label>
      <select id="rMens" value={mid} onChange={e => setMid(e.target.value)}><option value="">Elige…</option>{mens.map(m => <option key={m.id} value={m.id}>{m.nombre}</option>)}</select></div>
    <div className="aviso">La devolución de {guia} se sigue cobrando como está. El reintento se cobra aparte, como un domicilio normal{Number(p.valorServicio) ? " (" + pesos(p.valorServicio) + ")" : ""}, y al mensajero le cuenta como otro domicilio.</div>
    <button type="button" className="btn" style={{ width: "100%" }} disabled={trabajando} onClick={crear}>{trabajando ? "Creando…" : "Crear guía de reintento"}</button>
    <button type="button" className="btn sec" style={{ width: "100%", marginTop: 10 }} disabled={trabajando} onClick={() => volver()}>Cancelar</button>
  </>;
}

/** Lo que se ve de la devolución en el detalle de una guía: dónde quedó el paquete, la cadena de guías y las acciones. */
export function BloqueDevolucion({ guia, abrirGuia, volver, acciones }: { guia: string; abrirGuia: (g: string) => void; volver?: () => void; acciones?: boolean }) {
  useDatos();
  const v = useVentana(), p = S.pedidos[guia]; if (!p) return null;
  const devuelto = p.estado === "devuelto", tieneReintento = !!p.reintentos?.length, mia = !yo.esAdmin && !yo.esAsistente && p.mensajeroId === E.miMensajero;
  const oficina = yo.esAdmin || yo.esAsistente;
  const destino = p.destinoDev && p.destinoDev !== "por_definir" ? DESTINOS_DEV[p.destinoDev] : "";
  const acc: ReactNode[] = [];
  if (acciones !== false && devuelto && !tieneReintento) {
    if (mia && p.destinoDev === "por_definir") acc.push(<button key="d" type="button" className="btn" onClick={() => v.abrir(<DlgDestinoDev guia={guia} volver={volver} />, "centrada")}>Dónde quedó el paquete</button>);
    if (oficina && p.destinoDev !== "reintento") {
      acc.push(<button key="d" type="button" className="btn sec chico" id="pDestino" onClick={() => v.abrir(<DlgDestinoDev guia={guia} oficina volver={volver} />, "centrada")}>{destino ? "Cambiar dónde está el paquete" : "Indicar dónde está el paquete"}</button>);
      if (p.destinoDev === "cliente" || p.destinoDev === "oficina")
        acc.push(<button key="r" type="button" className="btn chico" id="pReintento" onClick={() => v.abrir(<DlgReintentoOficina guia={guia} volver={n => (n ? abrirGuia(n) : volver ? volver() : v.cerrar())} />, "centrada")}>Reintentar la entrega</button>);
    }
  }
  if (!devuelto && !p.reintentoDe && !tieneReintento) return null;
  return <div className="devolucion">
    {p.reintentoDe && <p className="sub">Reintento de <button type="button" className="guia enlace" onClick={() => abrirGuia(p.reintentoDe!)}>{p.reintentoDe}</button>. Se cobra como un domicilio normal.</p>}
    {devuelto && <dl className="datos">
      {p.destinoDev === "por_definir" && <><dt>Paquete</dt><dd>Falta que el mensajero diga dónde quedó</dd></>}
      {destino && <><dt>Paquete</dt><dd>{destino}</dd></>}
      {p.reintentoPedido && !tieneReintento ? <><dt>Reintento</dt><dd><b>El cliente lo pidió</b> el {hora(p.reintentoPedido)}{oficina ? ": asígnalo a un mensajero" : ""}</dd></> : null}
    </dl>}
    <CadenaGuias guia={guia} abrirGuia={abrirGuia} />
    {acc.length > 0 && <div className="acciones">{acc}</div>}
  </div>;
}
