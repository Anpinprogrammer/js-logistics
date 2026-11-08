/* Fotos y firma: tomar o elegir una foto (se comprime aquí), firmar con el dedo y ver las fotos de una guía. */
import { useEffect, useRef, useState, type Ref } from "react";
import { useQuery } from "@tanstack/react-query";
import { pedidos } from "../api/servicios";
import { mensajeDe } from "../api/cliente";
import type { Archivo, EstadoPedido } from "../api/tipos";
import { comprimir } from "../lib/imagen";
import { fechaHora } from "../lib/formato";
import { Aviso, Boton } from "./ui";

/** URL temporal para mostrar un Blob, que se libera al cambiarlo o al salir. */
function useUrlDe(b: Blob | null) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!b) { setUrl(null); return; }
    const u = URL.createObjectURL(b);
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [b]);
  return url;
}

/** Botones de cámara y galería. Entrega la foto ya comprimida (~100 KB). */
export function ElegirFoto({ etiqueta, foto, onFoto }: { etiqueta: string; foto: Blob | null; onFoto: (b: Blob | null) => void }) {
  const camara = useRef<HTMLInputElement>(null), galeria = useRef<HTMLInputElement>(null);
  const [error, setError] = useState("");
  const [preparando, setPreparando] = useState(false);
  const vista = useUrlDe(foto);

  const elegir = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    e.target.value = ""; // para poder elegir la misma foto otra vez
    if (!f) return;
    setError(""); setPreparando(true);
    try { onFoto(await comprimir(f)); } catch (x) { setError(mensajeDe(x)); } finally { setPreparando(false); }
  };

  return (
    <div>
      <span className="etiqueta">{etiqueta}</span>
      {vista && <img src={vista} alt={etiqueta} className="mb-2 max-h-56 w-full rounded-xl border border-linea object-contain" />}
      <div className="flex gap-2">
        <Boton type="button" variante="secundario" className="flex-1" cargando={preparando} onClick={() => camara.current?.click()}>
          {foto ? "Tomar otra" : "Tomar foto"}
        </Boton>
        <Boton type="button" variante="secundario" className="flex-1" onClick={() => galeria.current?.click()}>De la galería</Boton>
      </div>
      <input ref={camara} type="file" accept="image/*" capture="environment" className="hidden" onChange={elegir} aria-hidden tabIndex={-1} />
      <input ref={galeria} type="file" accept="image/*" className="hidden" onChange={elegir} aria-hidden tabIndex={-1} />
      {error && <p className="mt-1 text-sm text-rojo">{error}</p>}
    </div>
  );
}

/** Recuadro para firmar con el dedo. `lienzo` da acceso al canvas para sacar la imagen al guardar. */
export function Firma({ lienzo, onCambio }: { lienzo: Ref<HTMLCanvasElement>; onCambio: (hayFirma: boolean) => void }) {
  const ref = useRef<HTMLCanvasElement | null>(null);
  const anterior = useRef<{ x: number; y: number } | null>(null);

  // El tamaño se fija al primer trazo: dentro de un <dialog> que se está abriendo el canvas todavía mide 0.
  const preparar = () => {
    const c = ref.current!, r = c.getBoundingClientRect(), dpr = window.devicePixelRatio || 1;
    if (c.width === Math.round(r.width * dpr)) return;
    c.width = Math.round(r.width * dpr); c.height = Math.round(r.height * dpr);
    const x = c.getContext("2d")!;
    x.scale(dpr, dpr);
    Object.assign(x, { lineWidth: 2.4, lineCap: "round", lineJoin: "round", strokeStyle: "#042A3A" }); // tinta oscura: la firma se guarda sobre blanco
  };

  const punto = (e: React.PointerEvent) => { const b = ref.current!.getBoundingClientRect(); return { x: e.clientX - b.left, y: e.clientY - b.top }; };
  const limpiar = () => { const c = ref.current!; c.getContext("2d")!.clearRect(0, 0, c.width, c.height); onCambio(false); };

  return (
    <div>
      <div className="flex items-center justify-between">
        <span className="etiqueta">Firma de quien recibe</span>
        <Boton type="button" variante="fantasma" chico onClick={limpiar}>Borrar</Boton>
      </div>
      <canvas
        ref={c => { ref.current = c; if (typeof lienzo === "function") lienzo(c); else if (lienzo) lienzo.current = c; }}
        aria-label="Recuadro para firmar con el dedo"
        className="h-40 w-full touch-none rounded-xl border border-linea bg-[#fff]"
        onPointerDown={e => { preparar(); anterior.current = punto(e); e.currentTarget.setPointerCapture(e.pointerId); }}
        onPointerMove={e => {
          if (!anterior.current) return;
          const p = punto(e), x = ref.current!.getContext("2d")!;
          x.beginPath(); x.moveTo(anterior.current.x, anterior.current.y); x.lineTo(p.x, p.y); x.stroke();
          anterior.current = p;
          onCambio(true);
        }}
        onPointerUp={() => { anterior.current = null; }}
        onPointerCancel={() => { anterior.current = null; }}
      />
    </div>
  );
}

const NOMBRES: Record<Archivo["tipo"], string> = {
  salida: "Foto del paquete", mini: "Miniatura", entrega: "Foto de entrega", firma: "Firma de quien recibió", previa: "Entrega anterior"
};

const ORDEN: Archivo["tipo"][] = ["salida", "entrega", "firma", "previa"];

/** Fotos y firma de una guía, con las URL firmadas que da el servidor. Tocar una la abre completa. */
export function FotosPedido({ guia, estado, solo }: { guia: string; estado?: EstadoPedido; solo?: Archivo["tipo"][] }) {
  const q = useQuery({ queryKey: ["pedidos", "detalle", guia, "archivos"], queryFn: () => pedidos.archivos(guia), staleTime: 30 * 60_000 });
  if (q.isPending) return <p className="text-sm text-suave">Cargando fotos…</p>;
  if (q.error) return <Aviso tipo="error">{mensajeDe(q.error)}</Aviso>;
  const lista = (solo ? q.data.filter(a => solo.includes(a.tipo)) : q.data)
    .slice().sort((a, b) => ORDEN.indexOf(a.tipo) - ORDEN.indexOf(b.tipo)); // en el orden del recorrido
  if (!lista.length) return <p className="text-sm text-suave">Esta guía no tiene fotos.</p>;
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
      {lista.map(a => {
        const nombre = a.tipo === "entrega" && estado === "devuelto" ? "Evidencia de la devolución" : NOMBRES[a.tipo];
        return (
          <a key={a.url} href={a.url} target="_blank" rel="noreferrer" className="group block">
            <img src={a.url} alt={nombre} loading="lazy"
              className="aspect-square w-full rounded-xl border border-linea bg-hueco object-cover group-hover:brightness-95" />
            <span className="mt-1 block text-xs font-medium">{nombre}</span>
            <span className="block text-xs text-suave">{fechaHora(a.creado)}</span>
          </a>
        );
      })}
    </div>
  );
}
