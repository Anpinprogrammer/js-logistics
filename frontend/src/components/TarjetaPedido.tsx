/* Tarjeta de un pedido para las listas del celular. */
import type { ReactNode } from "react";
import type { Pedido } from "../api/tipos";
import { fechaHora, metodoTexto, pesos } from "../lib/formato";
import { EtiquetaEstado } from "./ui";

export default function TarjetaPedido({ p, acciones, onClick }: { p: Pedido; acciones?: ReactNode; onClick?: () => void }) {
  const Cuerpo = onClick ? "button" : "div";
  return (
    <article className="caja overflow-hidden">
      <Cuerpo onClick={onClick} className="flex w-full gap-3 p-4 text-left">
        {p.mini
          ? <img src={p.mini} alt="" className="size-14 shrink-0 rounded-xl object-cover" />
          : <div className="grid size-14 shrink-0 place-items-center rounded-xl bg-hueco text-xs font-bold text-suave">{p.guia.slice(3)}</div>}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <b>{p.guia}</b><EtiquetaEstado p={p} />
          </div>
          <p className="truncate text-sm text-suave">{p.clienteNombre || "Sin remitente"} · {p.mensajeroNombre}</p>
          <p className="text-sm">
            {p.estado === "pendiente"
              ? <>Salió {fechaHora(p.creado)}{p.aCobrar > 0 && <> · cobrar <b>{pesos(p.aCobrar)}</b></>}</>
              : <>{fechaHora(p.entregado)} · {metodoTexto(p)}{p.estado === "entregado" && <> · <b>{pesos(p.valorCobrado)}</b></>}</>}
          </p>
          {p.intentos.length > 0 && p.estado === "pendiente" && <p className="text-xs text-ambar">{p.intentos.length} intento(s) fallido(s)</p>}
        </div>
      </Cuerpo>
      {acciones && <div className="flex gap-2 border-t border-linea p-3">{acciones}</div>}
    </article>
  );
}
