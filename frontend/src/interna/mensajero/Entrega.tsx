/* Diálogos de entrega, "no se pudo entregar" y "ver entregado", igual al prototipo (abrirEntrega, abrirDevolucion, verEntregadoMens). */
import { useEffect, useRef, useState } from "react";
import { S, CUENTAS_JS, METODOS, MOTIVOS, hora, metodoTxt, nombreCliente, pesos, gastoDe, type Metodo, type Motivo } from "../motor";
import { Cab, EtqEstado, FotosGuia, IconoCamara, useVentana } from "../ui";
import { entregar, noEntregado } from "../acciones";
import { motivoError, useDatos } from "../datos";
import { comprimir } from "../../lib/imagen";
import { pedidos as apiPedidos } from "../../api/servicios";
import { DEMO } from "../demo";

type Ventana = ReturnType<typeof useVentana>;
export const abrirEntregaEn = (v: Ventana, guia: string) => v.abrir(<DlgEntrega guia={guia} />);

/** Foto elegida con la cámara o la galería, ya comprimida, con su vista previa. */
function useFoto() {
  const [foto, setFoto] = useState<Blob | null>(null), [vista, setVista] = useState("");
  const camara = useRef<HTMLInputElement>(null), galeria = useRef<HTMLInputElement>(null);
  useEffect(() => { if (!foto) return; const u = URL.createObjectURL(foto); setVista(u); return () => URL.revokeObjectURL(u); }, [foto]);
  const elegir = async (e: React.ChangeEvent<HTMLInputElement>) => { const f = e.target.files?.[0]; if (f) setFoto(await comprimir(f)); };
  const bloque = (pre: string) => <>
    <div className="foto-elegida"><img id={pre + "FotoPrev"} className={vista ? "" : "oculto"} src={vista || undefined} alt="" />
      <button className="btn sec" id={pre + "FotoBtn"} type="button" onClick={() => camara.current?.click()}><IconoCamara chico /> {foto && pre === "e" ? "Cambiar foto" : "Tomar foto"}</button>
      <button className="btn sec" id={pre + "FotoGalBtn"} type="button" onClick={() => galeria.current?.click()}>Desde galería</button></div>
    <input type="file" ref={camara} accept="image/*" capture="environment" className="oculto" onChange={elegir} /><input type="file" ref={galeria} accept="image/*" className="oculto" onChange={elegir} />
  </>;
  return { foto, bloque };
}

/** Recuadro para firmar con el dedo (prepararFirma del prototipo). */
function useFirma() {
  const cv = useRef<HTMLCanvasElement>(null), trazos = useRef(0), ant = useRef<{ x: number; y: number } | null>(null);
  useEffect(() => {
    const c = cv.current; if (!c) return;
    const r = c.getBoundingClientRect(), dpr = Math.min(2, window.devicePixelRatio || 1);
    c.width = r.width * dpr; c.height = r.height * dpr;
    const x = c.getContext("2d")!; x.scale(dpr, dpr); Object.assign(x, { lineWidth: 2.4, lineCap: "round", lineJoin: "round", strokeStyle: "#042A3A" });
  }, []);
  const pt = (e: React.PointerEvent) => { const b = cv.current!.getBoundingClientRect(); return { x: e.clientX - b.left, y: e.clientY - b.top }; };
  const limpiar = () => { const c = cv.current!; c.getContext("2d")!.clearRect(0, 0, c.width, c.height); trazos.current = 0; };
  const lienzo = <div className="firma-caja"><canvas id="firma" ref={cv}
    onPointerDown={e => { ant.current = pt(e); cv.current!.setPointerCapture(e.pointerId); trazos.current++; }}
    onPointerMove={e => { if (!ant.current) return; const p = pt(e), x = cv.current!.getContext("2d")!; x.beginPath(); x.moveTo(ant.current.x, ant.current.y); x.lineTo(p.x, p.y); x.stroke(); ant.current = p; }}
    onPointerUp={() => { ant.current = null; }} onPointerCancel={() => { ant.current = null; }} />
    <button className="btn sec chico" id="limpiar" type="button" onClick={limpiar}>Borrar</button></div>;
  return { lienzo, vacia: () => trazos.current === 0, canvas: () => cv.current };
}

function DlgEntrega({ guia }: { guia: string }) {
  useDatos();
  const v = useVentana(), p = S.pedidos[guia];
  const aC = Number(p?.aCobrar) || 0;
  const [nom, setNom] = useState(""), [valor, setValor] = useState(aC ? String(aC) : ""), [metodo, setMetodo] = useState<Metodo>("efectivo");
  const [cta, setCta] = useState(""), [gasto, setGasto] = useState(""), [gastoNota, setGastoNota] = useState(""), [cambio, setCambio] = useState(false);
  const [aceptoDif, setAceptoDif] = useState(false), [guardando, setGuardando] = useState(false);
  const { foto, bloque } = useFoto(), firma = useFirma();
  if (!p) return null;
  const reset = () => setAceptoDif(false);
  const v0 = Number(valor), esperado = metodo === "transf_cliente" ? 0 : aC, dif = aC ? v0 - esperado : 0;
  const guardar = async () => {
    if (!nom.trim()) return v.avisar("Escribe el nombre de quien recibe");
    if (firma.vacia()) return v.avisar("Falta la firma");
    if (!foto) return v.avisar("Falta la foto de entrega");
    if (valor === "" || v0 < 0) return v.avisar("Escribe el valor cobrado (0 si no cobró)");
    if (metodo === "transf_js" && !cta) return v.avisar("Elige a qué cuenta llegó la transferencia");
    const g = Number(gasto) || 0; if (g < 0) return v.avisar("El gasto no puede ser negativo");
    if (dif && !aceptoDif) { setAceptoDif(true); return; }
    setGuardando(true);
    try {
      await entregar(guia, { destinatario: nom.trim(), valorCobrado: v0, metodo, cuentaJs: metodo === "transf_js" ? (cta as "nequi") : "", cambio, gasto: g > 0 ? g : 0, gastoNota: g > 0 ? gastoNota.trim() : "" }, foto, firma.canvas());
      v.cerrar(); v.avisar("Entrega de " + guia + " registrada");
    } catch (e) { setGuardando(false); v.avisar("No se pudo guardar la entrega: " + motivoError(e) + "."); }
  };
  return <>
    <Cab sub={<span className="sub">{nombreCliente(p.clienteId) || p.clienteNombre || "Remitente sin asignar"}</span>}><h2>Entregar <span className="guia">{guia}</span></h2></Cab>
    <div className="foto-pedido" id="eFotoPed"><FotoSalida guia={guia} mini={p.mini} /></div>
    {aC ? <div className="cobrar-box"><span>Valor a cobrar</span><b>{pesos(aC)}</b></div> : null}
    {p.intentos.length ? <div className="aviso">Intentos anteriores: {p.intentos.map(i => hora(i.fecha) + " · " + (MOTIVOS[i.motivo as Motivo] || "") + (i.nota ? " (" + i.nota + ")" : "")).join("; ")}</div> : null}
    <div className="campo"><label htmlFor="eNom">Nombre de quien recibe</label><input id="eNom" autoComplete="off" value={nom} onChange={e => setNom(e.target.value)} /></div>
    <div className="campo"><span className="lbl">Firma</span>{firma.lienzo}</div>
    <div className="campo"><span className="lbl">Foto de entrega</span>{bloque("e")}</div>
    <div className="campo"><label htmlFor="eValor">Valor cobrado</label><input id="eValor" type="number" inputMode="numeric" min="0" step="100" placeholder="0" value={valor} onChange={e => { setValor(e.target.value); reset(); }} /></div>
    <div className="campo"><span className="lbl">Método de pago</span><div className="metodos">
      {(Object.keys(METODOS) as Metodo[]).map(k => <label key={k}><input type="radio" name="metodo" value={k} checked={metodo === k} onChange={() => { setMetodo(k); if (k === "transf_cliente") setValor("0"); else if (aC && valor === "0") setValor(String(aC)); reset(); }} /><span>{METODOS[k].t}<small>{METODOS[k].d}</small></span></label>)}
    </div></div>
    <div className={"campo" + (metodo === "transf_js" ? "" : " oculto")} id="eCtaC"><label htmlFor="eCta">¿A qué cuenta de JS llegó la transferencia?</label><select id="eCta" value={cta} onChange={e => setCta(e.target.value)}><option value="">Elige…</option>{Object.entries(CUENTAS_JS).map(([k, t]) => <option key={k} value={k}>{t}</option>)}</select></div>
    <div id="eDif">{aceptoDif && dif ? <div className="aviso alerta">Debías cobrar <b>{pesos(esperado)}</b> y escribiste <b>{pesos(v0)}</b> ({dif > 0 ? "sobran" : "faltan"} {pesos(Math.abs(dif))}). Revisa el valor. Si está bien, toca otra vez el botón.</div> : null}</div>
    <div className="linea2"><div className="campo"><label htmlFor="eGasto">Gasté en este envío (flete, bus…)</label><input id="eGasto" type="number" inputMode="numeric" min="0" step="1000" placeholder="0" value={gasto} onChange={e => setGasto(e.target.value)} /></div>
      <div className="campo"><label htmlFor="eGastoNota">Detalle del gasto (opcional)</label><input id="eGastoNota" placeholder="Ej: bus a Popayán" value={gastoNota} onChange={e => setGastoNota(e.target.value)} /></div></div>
    <label className="check"><input type="checkbox" id="eCambio" checked={cambio} onChange={e => setCambio(e.target.checked)} /> Recibí un cambio (prenda de vuelta para el remitente)</label>
    <button className="btn ok" id="eGuardar" style={{ width: "100%" }} disabled={guardando} onClick={guardar}>{guardando ? "Guardando…" : aceptoDif && dif ? "Sí, guardar con diferencia" : "Confirmar entrega"}</button>
    <button className="btn peligro" id="eNoEnt" style={{ width: "100%", marginTop: 10 }} onClick={() => v.abrir(<DlgDevolucion guia={guia} />)}>No se pudo entregar</button>
  </>;
}

/** Foto de salida del pedido: primero la miniatura y, cuando llega, la foto completa. */
function FotoSalida({ guia, mini }: { guia: string; mini: string }) {
  const [url, setUrl] = useState<string | null>(null), [listo, setListo] = useState(false);
  useEffect(() => {
    let vivo = true;
    if (DEMO) { setListo(true); return; }
    apiPedidos.archivos(guia).then(a => { if (vivo) { setUrl(a.find(x => x.tipo === "salida")?.url || null); setListo(true); } }).catch(() => vivo && setListo(true));
    return () => { vivo = false; };
  }, [guia]);
  if (url) return <><img src={url} alt="Foto del pedido" data-ampliar /><span className="sub">Toca la foto para verla completa</span></>;
  if (mini) return <img src={mini} alt="Foto del pedido" data-ampliar />;
  return <span className="sub">{listo ? "Sin foto del pedido." : "Cargando foto del pedido…"}</span>;
}

export function DlgDevolucion({ guia }: { guia: string }) {
  const v = useVentana(), p = S.pedidos[guia];
  const [motivo, setMotivo] = useState<Motivo>("no_contesta"), [nota, setNota] = useState(""), [guardando, setGuardando] = useState(false);
  const { foto, bloque } = useFoto();
  if (!p) return null;
  const guardar = async () => {
    if (motivo === "otro" && !nota.trim()) return v.avisar("Escribe qué pasó");
    setGuardando(true);
    try { await noEntregado(guia, motivo, nota.trim(), foto); v.cerrar(); v.avisar(motivo === "reprogramar" ? "Intento registrado. " + guia + " sigue en tu lista" : "Devolución de " + guia + " registrada"); }
    catch (e) { setGuardando(false); v.avisar("No se pudo guardar: " + motivoError(e) + "."); }
  };
  return <>
    <Cab sub={<span className="sub">{nombreCliente(p.clienteId) || p.clienteNombre || "Remitente sin asignar"}</span>}><h2>No se pudo entregar <span className="guia">{guia}</span></h2></Cab>
    <div className="campo"><span className="lbl">¿Qué pasó?</span><div className="metodos">{(Object.keys(MOTIVOS) as Motivo[]).map(k => <label key={k}><input type="radio" name="motivo" value={k} checked={motivo === k} onChange={() => setMotivo(k)} /><span>{MOTIVOS[k]}{k === "reprogramar" ? <small>El pedido sigue en tu lista para intentarlo después</small> : k === "otro" ? null : <small>El paquete vuelve al remitente</small>}</span></label>)}</div></div>
    <div className="campo"><label htmlFor="dNota">Detalle (opcional)</label><input id="dNota" placeholder="Ej: llamé 3 veces, el portero no lo recibió" value={nota} onChange={e => setNota(e.target.value)} /></div>
    <div className="campo"><span className="lbl">Foto de evidencia (opcional)</span>{bloque("d")}</div>
    <button className="btn" id="dGuardar" style={{ width: "100%" }} disabled={guardando} onClick={guardar}>{guardando ? "Guardando…" : "Registrar"}</button>
    <button className="btn sec" id="dVolver" style={{ width: "100%", marginTop: 10 }} onClick={() => abrirEntregaEn(v, guia)}>Volver a la entrega</button>
  </>;
}

/** Pedido entregado o devuelto visto por el mensajero: solo información y pruebas, sin acciones. */
export function VerEntregado({ guia }: { guia: string }) {
  useDatos();
  const p = S.pedidos[guia]; if (!p) return null;
  return <>
    <Cab sub={<EtqEstado p={p} />}><h2 className="guia">{guia}</h2></Cab>
    <dl className="datos">
      <dt>Remitente</dt><dd>{nombreCliente(p.clienteId) || p.clienteNombre || "Sin asignar"}</dd>
      <dt>Salió</dt><dd>{hora(p.creado)}</dd>
      {Number(p.aCobrar) ? <><dt>Valor a cobrar</dt><dd>{pesos(p.aCobrar)}</dd></> : null}
      {p.estado === "entregado" && <><dt>Entregado</dt><dd>{hora(p.entregado)}</dd><dt>Recibió</dt><dd>{p.destinatario}</dd><dt>Cobrado</dt><dd>{pesos(p.valorCobrado)}</dd><dt>Método</dt><dd>{metodoTxt(p)}</dd></>}
      {p.estado === "devuelto" && <><dt>Devuelto</dt><dd>{hora(p.entregado)}</dd><dt>Motivo</dt><dd>{MOTIVOS[p.motivoDev as Motivo] || ""}{p.notaDev ? " · " + p.notaDev : ""}</dd></>}
      {gastoDe(p) ? <><dt>Flete / gasto que pagaste</dt><dd>{pesos(gastoDe(p))}{p.gastoNota ? " · " + p.gastoNota : ""}</dd></> : null}
    </dl>
    <p className="sub">Si algo quedó mal, avísale a la oficina para que lo corrija.</p>
    <h2>Pruebas</h2><FotosGuia p={p} id="meFotos" firma="Firma de quien recibió" />
  </>;
}
