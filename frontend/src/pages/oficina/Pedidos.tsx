/* Oficina: todas las guías, con filtros y paginación. */
import { useState } from "react";
import { useNavigate, useSearchParams } from "react-router";
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { mensajeros, pedidos, type FiltrosPedidos } from "../../api/servicios";
import { mensajeDe } from "../../api/cliente";
import type { EstadoPedido } from "../../api/tipos";
import { fechaHora, metodoTexto, pesos } from "../../lib/formato";
import { Aviso, Boton, Cargando, Dialogo, EtiquetaEstado, Selector, Titulo, Vacio } from "../../components/ui";
import TarjetaPedido from "../../components/TarjetaPedido";
import { useAviso } from "../../components/Avisos";
import { IcMas } from "../../components/Iconos";

export default function Pedidos() {
  const ir = useNavigate();
  const [params, setParams] = useSearchParams();
  const [buscar, setBuscar] = useState(params.get("q") ?? "");
  const filtros: FiltrosPedidos = {
    estado: (params.get("estado") as EstadoPedido) || undefined,
    mensajeroId: params.get("m") || undefined,
    buscar: params.get("q") || undefined,
    conDiferencia: params.get("dif") === "1" || undefined,
    limite: 50
  };
  const poner = (k: string, v: string) => { const n = new URLSearchParams(params); v ? n.set(k, v) : n.delete(k); setParams(n, { replace: true }); };

  const q = useInfiniteQuery({
    queryKey: ["pedidos", "lista", filtros],
    queryFn: ({ pageParam }) => pedidos.listar({ ...filtros, cursor: pageParam }),
    initialPageParam: undefined as number | undefined,
    getNextPageParam: ult => ult.siguiente ?? undefined
  });
  const mens = useQuery({ queryKey: ["mensajeros"], queryFn: () => mensajeros.listar() });
  const lista = q.data?.pages.flatMap(p => p.pedidos) ?? [];
  const [nueva, setNueva] = useState(false);

  return (
    <>
      <Titulo accion={<Boton onClick={() => setNueva(true)}><IcMas />Nueva guía</Boton>}>Pedidos</Titulo>
      <form className="caja mb-4 grid gap-3 p-4 md:grid-cols-4" onSubmit={e => { e.preventDefault(); poner("q", buscar.trim()); }}>
        <div className="md:col-span-2">
          <label htmlFor="buscar" className="etiqueta">Buscar guía o destinatario</label>
          <input id="buscar" className="entrada" type="search" value={buscar} onChange={e => setBuscar(e.target.value)} onBlur={() => poner("q", buscar.trim())} placeholder="JS-00123" />
        </div>
        <Selector etiqueta="Estado" value={params.get("estado") ?? ""} onChange={e => poner("estado", e.target.value)}>
          <option value="">Todos</option><option value="pendiente">En ruta</option><option value="entregado">Entregados</option><option value="devuelto">Devueltos</option>
        </Selector>
        <Selector etiqueta="Mensajero" value={params.get("m") ?? ""} onChange={e => poner("m", e.target.value)}>
          <option value="">Todos</option>
          {mens.data?.map(m => <option key={m.id} value={m.id}>{m.nombre}</option>)}
        </Selector>
        <label className="flex items-center gap-2 text-sm md:col-span-4">
          <input type="checkbox" className="size-4 accent-[var(--color-marca)]" checked={params.get("dif") === "1"} onChange={e => poner("dif", e.target.checked ? "1" : "")} />
          Solo entregas con diferencia sin revisar
        </label>
      </form>

      {q.isPending ? <Cargando /> : q.error ? <Aviso tipo="error">{mensajeDe(q.error)}</Aviso> : !lista.length ? <Vacio titulo="No hay guías con esos filtros" /> : <>
        {/* Celular: tarjetas */}
        <div className="grid grid-cols-1 gap-3 md:hidden">
          {lista.map(p => <TarjetaPedido key={p.guia} p={p} onClick={() => ir(`/pedidos/${p.guia}`)} />)}
        </div>
        {/* Computador: tabla */}
        <div className="caja hidden overflow-x-auto md:block">
          <table className="w-full text-sm">
            <thead className="border-b border-linea text-left text-suave">
              <tr><th className="p-3">Guía</th><th className="p-3">Salida</th><th className="p-3">Remitente</th><th className="p-3">Mensajero</th><th className="p-3">Estado</th><th className="p-3">Pago</th><th className="p-3 text-right">Domicilio</th><th className="p-3 text-right">A cobrar</th><th className="p-3 text-right">Cobrado</th></tr>
            </thead>
            <tbody className="divide-y divide-linea">
              {lista.map(p => (
                <tr key={p.guia} className="cursor-pointer hover:bg-hueco" onClick={() => ir(`/pedidos/${p.guia}`)}>
                  <td className="p-3 font-semibold whitespace-nowrap"><a href={`/pedidos/${p.guia}`} onClick={e => { e.preventDefault(); ir(`/pedidos/${p.guia}`); }}>{p.guia}</a></td>
                  <td className="p-3 whitespace-nowrap">{fechaHora(p.creado)}</td>
                  <td className={`p-3 whitespace-nowrap ${p.clienteNombre ? "" : "text-ambar"}`}>{p.clienteNombre || "Sin remitente"}</td>
                  <td className="p-3 whitespace-nowrap">{p.mensajeroNombre}</td>
                  <td className="p-3"><EtiquetaEstado p={p} /></td>
                  <td className="p-3 text-suave">{metodoTexto(p)}</td>
                  <td className="p-3 text-right whitespace-nowrap">{pesos(p.valorServicio)}</td>
                  <td className="p-3 text-right whitespace-nowrap">{pesos(p.aCobrar)}</td>
                  <td className="p-3 text-right whitespace-nowrap">{p.estado === "entregado" ? pesos(p.valorCobrado) : ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {q.hasNextPage && <div className="mt-4 text-center"><Boton variante="secundario" cargando={q.isFetchingNextPage} onClick={() => q.fetchNextPage()}>Ver más</Boton></div>}
      </>}
      {nueva && <NuevaGuia alCerrar={() => setNueva(false)} />}
    </>
  );
}

function NuevaGuia({ alCerrar }: { alCerrar: () => void }) {
  const qc = useQueryClient(), avisar = useAviso(), ir = useNavigate();
  const mens = useQuery({ queryKey: ["mensajeros"], queryFn: () => mensajeros.listar() });
  const [mid, setMid] = useState("");
  const m = useMutation({
    mutationFn: () => pedidos.crear({ mensajeroId: mid }),
    onSuccess: p => { avisar(`Guía ${p.guia} creada`); qc.invalidateQueries({ queryKey: ["pedidos"] }); ir(`/pedidos/${p.guia}`); }
  });
  return (
    <Dialogo abierto alCerrar={alCerrar} titulo="Nueva guía">
      <form className="space-y-4" onSubmit={e => { e.preventDefault(); m.mutate(); }}>
        <Selector etiqueta="Mensajero" value={mid} onChange={e => setMid(e.target.value)} required>
          <option value="">Elige…</option>
          {mens.data?.filter(x => x.tipo === "mensajero" || x.tipo === "patinador").map(x => <option key={x.id} value={x.id}>{x.nombre}</option>)}
        </Selector>
        <p className="text-sm text-suave">Después de crearla le pones el remitente y los valores.</p>
        {m.error && <Aviso tipo="error">{mensajeDe(m.error)}</Aviso>}
        <Boton type="submit" className="w-full" cargando={m.isPending} disabled={!mid}>Crear guía</Boton>
      </form>
    </Dialogo>
  );
}
