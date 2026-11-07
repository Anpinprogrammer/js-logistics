/* Mensajero: sus entregas y devoluciones por día; puede corregir durante 24 horas. */
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { pedidos } from "../../api/servicios";
import { mensajeDe } from "../../api/cliente";
import type { Pedido } from "../../api/tipos";
import { corregible, hoy, inicioDia, moverDia, pesos } from "../../lib/formato";
import { Aviso, Boton, Cargando, Titulo, Vacio } from "../../components/ui";
import TarjetaPedido from "../../components/TarjetaPedido";
import { DialogoCorreccion } from "../../components/Entrega";

export default function Entregados() {
  const [dia, setDia] = useState(hoy());
  const [corregir, setCorregir] = useState<Pedido | null>(null);
  const q = useQuery({
    queryKey: ["pedidos", "entregados", dia],
    queryFn: () => pedidos.listar({ cerrados: true, entregadoDesde: inicioDia(dia), entregadoHasta: inicioDia(moverDia(dia, 1)), limite: 500 })
  });
  const lista = q.data?.pedidos ?? [];
  const cobrado = lista.filter(p => p.metodo === "efectivo").reduce((s, p) => s + p.valorCobrado, 0);

  return (
    <>
      <Titulo sub={`${lista.filter(p => p.estado === "entregado").length} entregados · ${lista.filter(p => p.estado === "devuelto").length} devueltos · ${pesos(cobrado)} en efectivo`}>
        Entregados
      </Titulo>
      <div className="mb-4 flex items-center gap-2">
        <Boton variante="secundario" chico onClick={() => setDia(moverDia(dia, -1))} aria-label="Día anterior">‹</Boton>
        <input type="date" className="entrada max-w-48" value={dia} max={hoy()} onChange={e => e.target.value && setDia(e.target.value)} aria-label="Día" />
        <Boton variante="secundario" chico onClick={() => setDia(moverDia(dia, 1))} disabled={dia >= hoy()} aria-label="Día siguiente">›</Boton>
      </div>
      {q.isPending ? <Cargando /> : q.error ? <Aviso tipo="error">{mensajeDe(q.error)}</Aviso> : !lista.length ? <Vacio titulo="Nada este día" /> : (
        <div className="grid gap-3 md:grid-cols-2">
          {lista.map(p => (
            <TarjetaPedido key={p.guia} p={p} acciones={corregible(p) ? <Boton variante="secundario" chico onClick={() => setCorregir(p)}>Corregir</Boton> : undefined} />
          ))}
        </div>
      )}
      {corregir && <DialogoCorreccion pedido={corregir} alCerrar={() => setCorregir(null)} />}
    </>
  );
}
