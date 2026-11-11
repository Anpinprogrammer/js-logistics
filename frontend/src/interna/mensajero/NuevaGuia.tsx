/* Ventana que se abre al tomar la foto de un pedido. La guía NO se crea al tomar la foto: solo cuando el mensajero
   pulsa "Crear guía". Descartar (o cerrar la ventana) no crea nada y no sube nada. El remitente es opcional:
   si no se elige, lo pone la oficina. */
import { useEffect, useId, useRef, useState } from "react";
import type { ClienteBreve } from "../../api/tipos";
import { useVentana } from "../ui";
import { buscarRemitentes, crearGuias, ponerRemitente } from "../acciones";
import { motivoError } from "../datos";

type Estado = { fase: "revisar" } | { fase: "creando" } | { fase: "lista"; guias: string[] } | { fase: "error"; msg: string };

export function DlgNuevaGuia({ fotos, mensajeroId, alCrear }: { fotos: File[]; mensajeroId: string; alCrear: (guias: string[]) => void }) {
  const v = useVentana(), idBuscar = useId();
  const [estado, setEstado] = useState<Estado>({ fase: "revisar" });
  const [avance, setAvance] = useState("");
  const [vista, setVista] = useState("");
  const [q, setQ] = useState(""), [resultados, setResultados] = useState<ClienteBreve[]>([]), [buscando, setBuscando] = useState(false);
  const [elegido, setElegido] = useState<ClienteBreve | null>(null), [guardando, setGuardando] = useState(false), [aplicado, setAplicado] = useState(false);
  const entrada = useRef<HTMLInputElement>(null), montado = useRef(true);
  const n = fotos.length;

  useEffect(() => { montado.current = true; return () => { montado.current = false; }; }, []);
  useEffect(() => { const u = URL.createObjectURL(fotos[0]); setVista(u); return () => URL.revokeObjectURL(u); }, [fotos]);

  // Recién aquí se crean las guías y se suben las fotos. El remitente elegido se pone en el mismo paso.
  const crear = async () => {
    if (estado.fase !== "revisar") return;
    setEstado({ fase: "creando" });
    const texto = (g: string[]) => (g.length === 1 ? "Guía " + g[0] : g.length + " guías");
    let guias: string[];
    try { guias = await crearGuias(fotos, mensajeroId, m => montado.current && setAvance(m)); }
    catch (e) {
      const msg = textoError(e);
      if (montado.current) setEstado({ fase: "error", msg }); else v.avisar(msg);
      return;
    }
    alCrear(guias);
    let aviso = texto(guias) + " creada" + (guias.length === 1 ? "" : "s");
    if (elegido) {
      try { await ponerRemitente(guias, elegido); if (montado.current) setAplicado(true); aviso = texto(guias) + " a nombre de " + elegido.nombre; }
      catch (e) { aviso += ", pero no se pudo poner el remitente: " + motivoError(e) + ". La oficina lo puede poner."; }
    }
    if (montado.current) setEstado({ fase: "lista", guias }); else v.avisar(aviso);
  };

  // Busca en el servidor un momento después de dejar de escribir.
  useEffect(() => {
    const t = q.trim();
    if (t.length < 2) { setResultados([]); setBuscando(false); return; }
    let vivo = true; setBuscando(true);
    const h = setTimeout(() => {
      buscarRemitentes(t).then(r => { if (vivo) { setResultados(r); setBuscando(false); } }, () => { if (vivo) { setResultados([]); setBuscando(false); } });
    }, 250);
    return () => { vivo = false; clearTimeout(h); };
  }, [q]);

  const guardar = async () => {
    if (!elegido) return;
    setGuardando(true);
    try {
      if (estado.fase !== "lista") return;
      const guias = estado.guias;
      await ponerRemitente(guias, elegido);
      v.cerrar();
      v.avisar((guias.length === 1 ? "Guía " + guias[0] : guias.length + " guías") + " a nombre de " + elegido.nombre);
    } catch (e) {
      setGuardando(false);
      v.avisar("No se pudo poner el remitente: " + motivoError(e) + ". La oficina lo puede poner.");
    }
  };

  const titulo = estado.fase === "revisar" ? (n === 1 ? "¿Crear la guía de esta foto?" : "¿Crear " + n + " guías?") : estado.fase === "lista" ? (estado.guias.length === 1 ? "Guía " + estado.guias[0] + " creada" : estado.guias.length + " guías creadas")
    : estado.fase === "error" ? "No se pudo crear la guía" : n === 1 ? "Creando la guía…" : "Creando " + n + " guías…";

  return <>
    <header><h2>{titulo}</h2><button className="cerrar" data-cerrar aria-label="Cerrar">×</button></header>
    <div className={"ng-subida ng-fase-" + estado.fase} role="status" aria-live="polite">
      <div className="ng-foto">
        {vista && <img src={vista} alt="Foto del pedido" />}
        {estado.fase === "creando" && <span className="ng-capa"><span className="ng-girador" aria-hidden="true" /></span>}
        {estado.fase === "lista" && <span className="ng-capa ok" aria-hidden="true"><svg viewBox="0 0 24 24" width="30" height="30" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg></span>}
        {n > 1 && <span className="ng-cuenta">{n}</span>}
      </div>
      <div className="ng-texto">
        {estado.fase === "revisar" && <><b>{n === 1 ? "Foto lista" : n + " fotos listas"}</b><span className="sub">Todavía no se crea nada. Elige el remitente si quieres y pulsa el botón de crear.</span></>}
        {estado.fase === "creando" && <><b>{avance || "Dándole número de guía…"}</b><span className="sub">No cierres la app hasta que termine.</span></>}
        {estado.fase === "lista" && <><b>Lista y por entregar{aplicado ? " · con remitente" : ""}</b><span className="sub">{estado.guias.length === 1 ? "Ya tiene número de guía." : "Del " + estado.guias[0] + " al " + estado.guias[estado.guias.length - 1] + "."}</span></>}
        {estado.fase === "error" && <><b>{estado.msg}</b><span className="sub">No se guardó nada. Cierra y vuelve a tomar la foto.</span></>}
      </div>
    </div>

    {(estado.fase === "revisar" || estado.fase === "lista") && <div className="ng-remitente">
      {elegido
        ? <div className="ng-elegido"><div className="ng-elegido-txt"><span className="sub">Remitente</span><b>{elegido.nombre}</b></div>
            {!aplicado && <button type="button" className="btn sec chico" onClick={() => { setElegido(null); setTimeout(() => entrada.current?.focus(), 0); }}>Cambiar</button>}</div>
        : <div className="campo">
            <label htmlFor={idBuscar}>Remitente <span className="sub">(opcional)</span></label>
            <input id={idBuscar} ref={entrada} type="search" inputMode="search" autoComplete="off" enterKeyHint="search" placeholder="Escribe el nombre del cliente"
              value={q} onChange={e => setQ(e.target.value)} aria-describedby={idBuscar + "-ayuda"} aria-controls={idBuscar + "-lista"} />
            <ul className="ng-lista" id={idBuscar + "-lista"} aria-label="Clientes encontrados">
              {resultados.map(c => <li key={c.id}><button type="button" onClick={() => { setElegido(c); setQ(""); setResultados([]); }}>{c.nombre}</button></li>)}
            </ul>
            <small id={idBuscar + "-ayuda"} className="sub ng-ayuda">
              {q.trim().length < 2 ? "Si no lo sabes, déjalo vacío: la oficina lo pone."
                : buscando ? "Buscando…" : resultados.length ? "" : "No hay un cliente con ese nombre. Déjalo vacío y la oficina lo pone."}
            </small>
          </div>}
    </div>}

    <div className="acciones ng-acciones">
      {estado.fase === "revisar" && <button type="button" className="btn" onClick={crear}>{n === 1 ? "Crear guía" : "Crear " + n + " guías"}</button>}
      {estado.fase === "lista" && !aplicado && <button type="button" className="btn" disabled={!elegido || guardando} onClick={guardar}>{guardando ? "Guardando…" : "Guardar remitente"}</button>}
      {estado.fase !== "creando" && <button type="button" className="btn sec" data-cerrar>{estado.fase === "revisar" ? "Descartar foto" : estado.fase === "error" ? "Cerrar" : "Listo"}</button>}
    </div>
  </>;
}

const textoError = (e: unknown) => navigator.onLine === false ? "Sin señal: la guía necesita conexión para darle número." : "No se pudo crear la guía: " + motivoError(e) + ".";
