/* Ventana "Recoger": para las guías que salieron de una solicitud (estado "aceptado"). El mensajero toma la foto del
   paquete y se asocia a esa misma guía (no se crea otra). Al confirmar pasa a en ruta y ya aparece "Entregar".
   Usa las mismas piezas visuales de la ventana de la foto de salida (NuevaGuia.tsx, clases ng-*). */
import { useEffect, useRef, useState } from "react";
import { S, nombreCliente } from "../motor";
import { IconoCamara, useVentana } from "../ui";
import { recoger } from "../acciones";
import { motivoError } from "../datos";
import { abrirEntregaEn } from "./Entrega";

type Fase = "foto" | "guardando" | "lista" | "error";

export function DlgRecoger({ guia }: { guia: string }) {
  const v = useVentana(), p = S.pedidos[guia];
  const [foto, setFoto] = useState<File | null>(null), [vista, setVista] = useState("");
  const [fase, setFase] = useState<Fase>("foto"), [error, setError] = useState("");
  const camara = useRef<HTMLInputElement>(null), galeria = useRef<HTMLInputElement>(null), montado = useRef(true);

  useEffect(() => { montado.current = true; return () => { montado.current = false; }; }, []);
  useEffect(() => { if (!foto) return; const u = URL.createObjectURL(foto); setVista(u); return () => URL.revokeObjectURL(u); }, [foto]);

  if (!p) return <><header><h2>Recoger</h2><button className="cerrar" data-cerrar aria-label="Cerrar">×</button></header><div className="vacio">Esa guía ya no está en tu lista.</div></>;
  const s = p.solicitud, remitente = nombreCliente(p.clienteId) || p.clienteNombre || "";

  const elegir = (e: React.ChangeEvent<HTMLInputElement>) => { const f = e.target.files?.[0]; if (f && f.type.startsWith("image/")) { setFoto(f); setError(""); setFase("foto"); } };
  const abrirCamara = () => { if (camara.current) { camara.current.value = ""; camara.current.click(); } };
  const abrirGaleria = () => { if (galeria.current) { galeria.current.value = ""; galeria.current.click(); } };

  const confirmar = async () => {
    if (!foto || fase === "guardando") return;
    setFase("guardando"); setError("");
    try {
      await recoger(guia, foto);
      if (montado.current) setFase("lista"); else v.avisar(guia + " recogido: ya está en ruta.");
    } catch (e) {
      const msg = navigator.onLine === false ? "Sin señal: la foto necesita conexión para subirse." : "No se pudo recoger: " + motivoError(e) + ".";
      if (montado.current) { setError(msg); setFase("error"); } else v.avisar(msg);
    }
  };

  const titulo = fase === "lista" ? guia + " en ruta" : fase === "guardando" ? "Recogiendo " + guia + "…" : "Recoger " + guia;
  return <>
    <header><h2>{titulo}</h2><button className="cerrar" data-cerrar aria-label="Cerrar">×</button></header>
    <dl className="datos rec-datos">
      {remitente && <div><dt>Remitente</dt><dd>{remitente}</dd></div>}
      {s?.direccionRecogida && <div><dt>Recoger en</dt><dd>{s.direccionRecogida}</dd></div>}
      {s && <div><dt>Entregar a</dt><dd>{s.destinatarioNombre}{s.destinatarioTelefono ? " · " + s.destinatarioTelefono : ""}<br />{s.direccionEntrega}</dd></div>}
      {s && s.paquetes > 1 ? <div><dt>Paquetes</dt><dd>{s.paquetes}</dd></div> : null}
    </dl>

    {foto ? <div className={"ng-subida ng-fase-" + (fase === "guardando" ? "creando" : fase)} role="status" aria-live="polite">
      <div className="ng-foto">
        {vista && <img src={vista} alt="Foto del paquete" />}
        {fase === "guardando" && <span className="ng-capa"><span className="ng-girador" aria-hidden="true" /></span>}
        {fase === "lista" && <span className="ng-capa ok" aria-hidden="true"><svg viewBox="0 0 24 24" width="30" height="30" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg></span>}
      </div>
      <div className="ng-texto">
        {fase === "foto" && <><b>Foto lista</b><span className="sub">Todavía no se guarda nada. Pulsa “Recoger” para asociarla a la guía.</span></>}
        {fase === "guardando" && <><b>Subiendo la foto…</b><span className="sub">No cierres la app hasta que termine.</span></>}
        {fase === "lista" && <><b>Recogido y en ruta</b><span className="sub">Escribe {guia} en el paquete. Ya lo puedes entregar.</span></>}
        {fase === "error" && <><b>{error}</b><span className="sub">La guía sigue por recoger. Vuelve a intentarlo.</span></>}
      </div>
    </div>
      : <button type="button" className="camara rec-camara" onClick={abrirCamara}><IconoCamara />Tomar foto del paquete<small>Se asocia a la guía {guia} y pasa a “Por entregar”</small></button>}
    <input type="file" ref={camara} accept="image/*" capture="environment" className="oculto" onChange={elegir} />
    <input type="file" ref={galeria} accept="image/*" className="oculto" onChange={elegir} />

    <div className="acciones ng-acciones">
      {(fase === "foto" || fase === "error") && foto && <button type="button" className="btn" onClick={confirmar}>Recoger y pasar a en ruta</button>}
      {fase === "lista" && <button type="button" className="btn ok" onClick={() => { v.cerrar(); abrirEntregaEn(v, guia); }}>Entregar ahora</button>}
      {(fase === "foto" || fase === "error") && <button type="button" className="btn sec" onClick={foto ? abrirCamara : abrirGaleria}>{foto ? "Tomar otra foto" : "Subir de la galería"}</button>}
      {fase !== "guardando" && <button type="button" className="btn sec" data-cerrar>{fase === "lista" ? "Listo" : foto ? "Descartar foto" : "Cancelar"}</button>}
    </div>
  </>;
}
