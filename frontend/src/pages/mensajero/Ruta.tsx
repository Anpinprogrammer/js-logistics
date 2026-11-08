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
import { ElegirFoto } from "../../components/Fotos";
import { comprimir, MINI } from "../../lib/imagen";

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
      {creada && <GuiaCreada pedido={creada} alCerrar={() => setCreada(null)} />}
    </>
  );
}

/** Número de la guía nueva y foto del paquete (con su miniatura para la lista). */
function GuiaCreada({ pedido, alCerrar }: { pedido: Pedido; alCerrar: () => void }) {
  const qc = useQueryClient();
  const [foto, setFoto] = useState<Blob | null>(null);
  const subir = useMutation({
    mutationFn: async (f: Blob) => {
      await pedidos.subirArchivo(pedido.guia, "salida", f);
      await pedidos.subirArchivo(pedido.guia, "mini", await comprimir(f, MINI));
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["pedidos"] }); alCerrar(); }
  });
  return (
    <Dialogo abierto alCerrar={alCerrar} titulo="Guía creada">
      <p className="text-center text-4xl font-bold tracking-wide text-marca">{pedido.guia}</p>
      <p className="mt-2 text-center text-sm text-suave">Escribe este número en el paquete. La oficina pondrá el remitente y los valores.</p>
      <div className="mt-5 space-y-4">
        <ElegirFoto etiqueta="Foto del paquete" foto={foto} onFoto={setFoto} />
        {subir.error && <Aviso tipo="error">{mensajeDe(subir.error)}</Aviso>}
        {foto
          ? <Boton className="w-full" cargando={subir.isPending} onClick={() => subir.mutate(foto)}>Guardar foto</Boton>
          : <Boton variante="secundario" className="w-full" onClick={alCerrar}>Seguir sin foto</Boton>}
      </div>
    </Dialogo>
  );
}
