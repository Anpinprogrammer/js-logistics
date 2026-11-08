/* Formularios de entrega, no entregado y corrección. Los usan el mensajero y la oficina. */
import { useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { pedidos } from "../api/servicios";
import { mensajeDe } from "../api/cliente";
import type { MetodoEntrega, Motivo, Pedido } from "../api/tipos";
import { METODOS, MOTIVOS, aPesos, pesos } from "../lib/formato";
import { Aviso, Boton, Campo, Casilla, Dialogo, cx } from "./ui";
import { useAviso } from "./Avisos";
import { ElegirFoto, Firma, FotosPedido } from "./Fotos";
import { firmaABlob } from "../lib/imagen";
import { useUsuario } from "../auth/Sesion";

const useRefrescar = () => {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: ["pedidos"] });
};

function Opciones<T extends string>({ nombre, valor, opciones, onChange }: { nombre: string; valor: T; opciones: Record<T, string>; onChange: (v: T) => void }) {
  return (
    <fieldset className="space-y-2">
      {(Object.keys(opciones) as T[]).map(k => (
        <label key={k} className={cx("flex min-h-11 cursor-pointer items-center gap-3 rounded-xl border px-3 text-sm",
          valor === k ? "border-marca bg-marca-claro" : "border-linea")}>
          <input type="radio" name={nombre} className="size-4 accent-[var(--color-marca)]" checked={valor === k} onChange={() => onChange(k)} />
          {opciones[k]}
        </label>
      ))}
    </fieldset>
  );
}

const CUENTAS = { nequi: "Nequi", bancolombia: "Bancolombia" } as const;

export function DialogoEntrega({ pedido, alCerrar }: { pedido: Pedido; alCerrar: () => void }) {
  const avisar = useAviso(), refrescar = useRefrescar();
  const [destinatario, setDestinatario] = useState("");
  const [valor, setValor] = useState(pedido.aCobrar ? String(pedido.aCobrar) : "");
  const [metodo, setMetodo] = useState<MetodoEntrega>("efectivo");
  const [cuentaJs, setCuentaJs] = useState<"" | "nequi" | "bancolombia">("");
  const [cambio, setCambio] = useState(false);
  const [gasto, setGasto] = useState("");
  const [gastoNota, setGastoNota] = useState("");
  const [aceptoDif, setAceptoDif] = useState(false);
  const [foto, setFoto] = useState<Blob | null>(null);
  const [hayFirma, setHayFirma] = useState(false);
  const lienzo = useRef<HTMLCanvasElement | null>(null);
  const [paso, setPaso] = useState("");
  // El mensajero entrega con foto y firma, como en la app actual. La oficina puede registrar sin ellas.
  const pideEvidencia = useUsuario().rol === "mensajero";

  const v = metodo === "transf_cliente" ? 0 : aPesos(valor);
  const esperado = metodo === "transf_cliente" ? 0 : pedido.aCobrar;
  const dif = pedido.aCobrar ? v - esperado : 0;

  const m = useMutation({
    mutationFn: async () => {
      // Primero las fotos: si la señal se cae aquí, la guía sigue en ruta y se puede intentar otra vez.
      if (foto) { setPaso("Subiendo la foto…"); await pedidos.subirArchivo(pedido.guia, "entrega", foto); }
      if (hayFirma && lienzo.current) { setPaso("Subiendo la firma…"); await pedidos.subirArchivo(pedido.guia, "firma", await firmaABlob(lienzo.current)); }
      setPaso("Guardando…");
      return entregar();
    },
    onSettled: () => setPaso(""),
    onSuccess: () => { avisar(`Guía ${pedido.guia} entregada`); refrescar(); alCerrar(); }
  });
  const entregar = () => pedidos.entregar(pedido.guia, {
      destinatario: destinatario.trim(), valorCobrado: v, metodo,
      ...(metodo === "transf_js" ? { cuentaJs: cuentaJs as "nequi" | "bancolombia" } : {}),
      cambio, gasto: aPesos(gasto), gastoNota: gastoNota.trim()
    });
  const falta = pideEvidencia && (!foto ? "Falta la foto de entrega" : !hayFirma ? "Falta la firma" : "");

  const enviar = (e: React.FormEvent) => {
    e.preventDefault();
    if (dif !== 0 && !aceptoDif) { setAceptoDif(true); return; }
    m.mutate();
  };

  return (
    <Dialogo abierto alCerrar={alCerrar} titulo={`Entregar ${pedido.guia}`}>
      <form onSubmit={enviar} className="space-y-4">
        {pedido.aCobrar > 0 && <Aviso>Debes cobrar <b>{pesos(pedido.aCobrar)}</b>.</Aviso>}
        <FotosPedido guia={pedido.guia} solo={["salida"]} />
        <Campo etiqueta="¿Quién recibió?" value={destinatario} onChange={e => setDestinatario(e.target.value)} required maxLength={120} autoComplete="off" />
        <div><span className="etiqueta">¿Cómo pagó?</span><Opciones nombre="metodo" valor={metodo} opciones={METODOS} onChange={v => { setMetodo(v); setAceptoDif(false); }} /></div>
        {metodo === "transf_js" && <div><span className="etiqueta">¿A qué cuenta llegó?</span><Opciones nombre="cuenta" valor={cuentaJs as "nequi"} opciones={CUENTAS} onChange={setCuentaJs} /></div>}
        {metodo !== "transf_cliente" && (
          <Campo etiqueta="Valor cobrado" inputMode="numeric" value={valor} onChange={e => { setValor(e.target.value); setAceptoDif(false); }}
            required ayuda="Escribe 0 si no cobró nada" />
        )}
        <details className="rounded-xl border border-linea px-3 py-2">
          <summary className="cursor-pointer py-1 text-sm font-medium">Flete o prenda de cambio</summary>
          <div className="mt-3 space-y-3">
            <Campo etiqueta="Flete que pagaste (bus, terminal)" inputMode="numeric" value={gasto} onChange={e => setGasto(e.target.value)} />
            {aPesos(gasto) > 0 && <Campo etiqueta="Detalle del flete" value={gastoNota} onChange={e => setGastoNota(e.target.value)} maxLength={200} />}
            <Casilla etiqueta="Recibí una prenda de cambio para devolver al remitente" checked={cambio} onChange={setCambio} />
          </div>
        </details>
        {aceptoDif && dif !== 0 && (
          <Aviso tipo="alerta">Debías cobrar <b>{pesos(esperado)}</b> y escribiste <b>{pesos(v)}</b> ({dif > 0 ? "sobran" : "faltan"} {pesos(Math.abs(dif))}). Si está bien, toca otra vez el botón.</Aviso>
        )}
        {m.error && <Aviso tipo="error">{mensajeDe(m.error)}</Aviso>}
        <ElegirFoto etiqueta={pideEvidencia ? "Foto de entrega" : "Foto de entrega (opcional)"} foto={foto} onFoto={setFoto} />
        <Firma lienzo={lienzo} onCambio={setHayFirma} />
        {falta && <p className="text-center text-sm text-suave">{falta}</p>}
        <Boton type="submit" className="w-full" cargando={m.isPending} disabled={(metodo === "transf_js" && !cuentaJs) || !!falta}>
          {m.isPending && paso ? paso : aceptoDif && dif !== 0 ? "Sí, guardar con diferencia" : "Guardar entrega"}
        </Boton>
      </form>
    </Dialogo>
  );
}

export function DialogoNoEntregado({ pedido, alCerrar }: { pedido: Pedido; alCerrar: () => void }) {
  const avisar = useAviso(), refrescar = useRefrescar();
  const [motivo, setMotivo] = useState<Motivo>("no_contesta");
  const [nota, setNota] = useState("");
  const [foto, setFoto] = useState<Blob | null>(null);
  const m = useMutation({
    mutationFn: async () => {
      if (foto && motivo !== "reprogramar") await pedidos.subirArchivo(pedido.guia, "entrega", foto); // evidencia de la devolución
      return pedidos.noEntregado(pedido.guia, { motivo, nota: nota.trim() });
    },
    onSuccess: p => { avisar(p.estado === "pendiente" ? `Intento anotado: ${pedido.guia} sigue en ruta` : `Guía ${pedido.guia} devuelta`); refrescar(); alCerrar(); }
  });
  return (
    <Dialogo abierto alCerrar={alCerrar} titulo={`No se pudo entregar ${pedido.guia}`}>
      <form onSubmit={e => { e.preventDefault(); m.mutate(); }} className="space-y-4">
        <Opciones nombre="motivo" valor={motivo} opciones={MOTIVOS} onChange={setMotivo} />
        <Campo etiqueta={motivo === "otro" ? "¿Qué pasó?" : "Detalle (opcional)"} value={nota} onChange={e => setNota(e.target.value)}
          required={motivo === "otro"} maxLength={300} placeholder="Ej: llamé 3 veces y no contestaron" />
        {motivo !== "reprogramar" && <>
          <ElegirFoto etiqueta="Foto de evidencia (opcional)" foto={foto} onFoto={setFoto} />
          <Aviso tipo="alerta">La guía queda como <b>devuelta</b>.</Aviso>
        </>}
        {m.error && <Aviso tipo="error">{mensajeDe(m.error)}</Aviso>}
        <Boton type="submit" className="w-full" cargando={m.isPending}>Registrar</Boton>
      </form>
    </Dialogo>
  );
}

/** El mensajero corrige lo que registró (24 horas). */
export function DialogoCorreccion({ pedido, alCerrar }: { pedido: Pedido; alCerrar: () => void }) {
  const avisar = useAviso(), refrescar = useRefrescar();
  const entregado = pedido.estado === "entregado";
  const [destinatario, setDestinatario] = useState(pedido.destinatario);
  const [valor, setValor] = useState(String(pedido.valorCobrado));
  const [metodo, setMetodo] = useState<MetodoEntrega>(pedido.metodo && pedido.metodo !== "devuelto" ? pedido.metodo : "efectivo");
  const [cuentaJs, setCuentaJs] = useState<"" | "nequi" | "bancolombia">(pedido.cuentaJs);
  const [motivo, setMotivo] = useState<Motivo>(pedido.motivoDev || "no_contesta");
  const [nota, setNota] = useState(pedido.notaDev);
  const [gasto, setGasto] = useState(pedido.gasto ? String(pedido.gasto) : "");
  const m = useMutation({
    mutationFn: () => pedidos.corregir(pedido.guia, entregado
      ? { destinatario: destinatario.trim(), valorCobrado: metodo === "transf_cliente" ? 0 : aPesos(valor), metodo, ...(metodo === "transf_js" && cuentaJs ? { cuentaJs } : {}), gasto: aPesos(gasto) }
      : { motivoDev: motivo, notaDev: nota.trim(), gasto: aPesos(gasto) }),
    onSuccess: () => { avisar(`Guía ${pedido.guia} corregida`); refrescar(); alCerrar(); }
  });
  const { reprogramar: _, ...motivosDev } = MOTIVOS;
  return (
    <Dialogo abierto alCerrar={alCerrar} titulo={`Corregir ${pedido.guia}`}>
      <form onSubmit={e => { e.preventDefault(); m.mutate(); }} className="space-y-4">
        {entregado ? <>
          <Campo etiqueta="¿Quién recibió?" value={destinatario} onChange={e => setDestinatario(e.target.value)} required />
          <Opciones nombre="metodo" valor={metodo} opciones={METODOS} onChange={setMetodo} />
          {metodo === "transf_js" && <Opciones nombre="cuenta" valor={cuentaJs as "nequi"} opciones={CUENTAS} onChange={setCuentaJs} />}
          {metodo !== "transf_cliente" && <Campo etiqueta="Valor cobrado" inputMode="numeric" value={valor} onChange={e => setValor(e.target.value)} required />}
        </> : <>
          <Opciones nombre="motivo" valor={motivo} opciones={motivosDev as Record<Motivo, string>} onChange={setMotivo} />
          <Campo etiqueta="Detalle" value={nota} onChange={e => setNota(e.target.value)} required={motivo === "otro"} />
        </>}
        <Campo etiqueta="Flete que pagaste" inputMode="numeric" value={gasto} onChange={e => setGasto(e.target.value)} />
        {m.error && <Aviso tipo="error">{mensajeDe(m.error)}</Aviso>}
        <Boton type="submit" className="w-full" cargando={m.isPending}>Guardar corrección</Boton>
      </form>
    </Dialogo>
  );
}
