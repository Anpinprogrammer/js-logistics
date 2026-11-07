/* Mensajero: lo que tiene en ruta, crear guías y registrar entregas. */
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { pedidos } from "../../api/servicios";
import { mensajeDe } from "../../api/cliente";
import type { Pedido } from "../../api/tipos";
import { pesos } from "../../lib/formato";
import { Aviso, Boton, Cargando, Dialogo, Titulo, Vacio } from "../../components/ui";
import TarjetaPedido from "../../components/TarjetaPedido";
import { DialogoEntrega, DialogoNoEntregado } from "../../components/Entrega";
import { IcMas } from "../../components/Iconos";

export default function Ruta() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["pedidos", "ruta"], queryFn: () => pedidos.listar({ estado: "pendiente", limite: 200 }) });
  const [entregar, setEntregar] = useState<Pedido | null>(null);
  const [noEntregar, setNoEntregar] = useState<Pedido | null>(null);
  const [creada, setCreada] = useState<Pedido | null>(null);

  const crear = useMutation({
    mutationFn: () => pedidos.crear(),
    onSuccess: p => { setCreada(p); qc.invalidateQueries({ queryKey: ["pedidos"] }); }
  });

  const lista = q.data?.pedidos ?? [];
  const porCobrar = lista.reduce((s, p) => s + p.aCobrar, 0);

  return (
    <>
      <Titulo sub={lista.length ? `${lista.length} en ruta · ${pesos(porCobrar)} por cobrar` : undefined}
        accion={<Boton onClick={() => crear.mutate()} cargando={crear.isPending}><IcMas />Nueva guía</Boton>}>
        Mi ruta
      </Titulo>
      {crear.error && <div className="mb-4"><Aviso tipo="error">{mensajeDe(crear.error)}</Aviso></div>}
      {q.isPending ? <Cargando /> : q.error ? <Aviso tipo="error">{mensajeDe(q.error)}</Aviso> : !lista.length ? (
        <Vacio titulo="No tienes pedidos en ruta">Toca “Nueva guía” cuando recojas un paquete.</Vacio>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {lista.map(p => (
            <TarjetaPedido key={p.guia} p={p} acciones={<>
              <Boton className="flex-1" onClick={() => setEntregar(p)}>Entregar</Boton>
              <Boton variante="secundario" className="flex-1" onClick={() => setNoEntregar(p)}>No se pudo</Boton>
            </>} />
          ))}
        </div>
      )}
      {entregar && <DialogoEntrega pedido={entregar} alCerrar={() => setEntregar(null)} />}
      {noEntregar && <DialogoNoEntregado pedido={noEntregar} alCerrar={() => setNoEntregar(null)} />}
      <Dialogo abierto={!!creada} alCerrar={() => setCreada(null)} titulo="Guía creada">
        <p className="text-center text-4xl font-bold tracking-wide text-marca">{creada?.guia}</p>
        <p className="mt-2 text-center text-sm text-suave">Escribe este número en el paquete. La oficina pondrá el remitente y los valores.</p>
        <Boton className="mt-5 w-full" onClick={() => setCreada(null)}>Listo</Boton>
      </Dialogo>
    </>
  );
}
