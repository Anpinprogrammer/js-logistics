/* Oficina: ficha del cliente con sus pedidos y movimientos. */
import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { clientes, pedidos } from "../../api/servicios";
import { mensajeDe } from "../../api/cliente";
import { useUsuario } from "../../auth/Sesion";
import { MOVIMIENTOS, fechaHora, pesos } from "../../lib/formato";
import { Aviso, Boton, Cargando, Dialogo, Vacio } from "../../components/ui";
import TarjetaPedido from "../../components/TarjetaPedido";
import { useAviso } from "../../components/Avisos";
import { FormCliente } from "./Clientes";

export default function ClienteDetalle() {
  const { id = "" } = useParams();
  const u = useUsuario(), ir = useNavigate(), qc = useQueryClient(), avisar = useAviso();
  const [pestana, setPestana] = useState<"pedidos" | "movimientos">("pedidos");
  const [editar, setEditar] = useState(false);
  const [borrar, setBorrar] = useState(false);
  const c = useQuery({ queryKey: ["clientes", id], queryFn: () => clientes.obtener(id) });
  const ps = useQuery({ queryKey: ["pedidos", "cliente", id], queryFn: () => pedidos.listar({ clienteId: id, limite: 100 }) });
  const movs = useQuery({ queryKey: ["clientes", id, "movimientos"], queryFn: () => clientes.movimientos(id), enabled: pestana === "movimientos" });
  const eliminar = useMutation({
    mutationFn: () => clientes.eliminar(id),
    onSuccess: () => { avisar("Cliente enviado a la papelera"); qc.invalidateQueries({ queryKey: ["clientes"] }); ir("/clientes"); }
  });

  if (c.isPending) return <Cargando />;
  if (c.error) return <Aviso tipo="error">{mensajeDe(c.error)}</Aviso>;

  const pestanaCls = (k: string) => `rounded-xl px-4 py-2 text-sm font-semibold ${pestana === k ? "bg-marca text-white" : "text-suave hover:bg-hueco"}`;

  return (
    <>
      <Link to="/clientes" className="text-sm text-marca">‹ Clientes</Link>
      <div className="mb-4 mt-1 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">{c.data.nombre}</h1>
          <p className="text-sm text-suave">{c.data.telefono || "Sin teléfono"} · Domicilio {pesos(c.data.tarifa)}</p>
        </div>
        <div className="flex gap-2">
          <Boton variante="secundario" chico onClick={() => setEditar(true)}>Editar</Boton>
          {u.rol === "admin" && <Boton variante="peligro" chico onClick={() => setBorrar(true)}>Eliminar</Boton>}
        </div>
      </div>
      <Aviso>El saldo del cliente se mostrará aquí cuando el backend calcule las cuentas (módulo de saldos pendiente).</Aviso>
      <div className="my-4 flex gap-2" role="tablist">
        <button role="tab" aria-selected={pestana === "pedidos"} className={pestanaCls("pedidos")} onClick={() => setPestana("pedidos")}>Pedidos</button>
        <button role="tab" aria-selected={pestana === "movimientos"} className={pestanaCls("movimientos")} onClick={() => setPestana("movimientos")}>Movimientos</button>
      </div>

      {pestana === "pedidos" ? (
        ps.isPending ? <Cargando /> : ps.error ? <Aviso tipo="error">{mensajeDe(ps.error)}</Aviso> : !ps.data.pedidos.length ? <Vacio titulo="Sin pedidos" /> : (
          <div className="grid gap-3 md:grid-cols-2">{ps.data.pedidos.map(p => <TarjetaPedido key={p.guia} p={p} onClick={() => ir(`/pedidos/${p.guia}`)} />)}</div>
        )
      ) : (
        movs.isPending ? <Cargando /> : movs.error ? <Aviso tipo="error">{mensajeDe(movs.error)}</Aviso> : !movs.data.length ? <Vacio titulo="Sin movimientos" /> : (
          <ul className="caja divide-y divide-linea">
            {movs.data.map(m => (
              <li key={m.id} className="flex items-center justify-between gap-3 px-4 py-3 text-sm">
                <span><b className="block">{MOVIMIENTOS[m.tipo].t}</b><span className="text-suave">{fechaHora(m.fecha)}{m.medio && ` · ${m.medio}`}{m.nota && ` · ${m.nota}`}</span></span>
                <b className={MOVIMIENTOS[m.tipo].signo > 0 ? "text-verde" : "text-rojo"}>{MOVIMIENTOS[m.tipo].signo > 0 ? "+" : "−"} {pesos(m.valor)}</b>
              </li>
            ))}
          </ul>
        )
      )}

      {editar && <FormCliente cliente={c.data} alCerrar={() => setEditar(false)} />}
      <Dialogo abierto={borrar} alCerrar={() => setBorrar(false)} titulo={`Eliminar ${c.data.nombre}`}>
        <p className="text-sm">Solo se puede eliminar un cliente sin pedidos ni movimientos. Queda copia en la papelera.</p>
        {eliminar.error && <div className="mt-3"><Aviso tipo="error">{mensajeDe(eliminar.error)}</Aviso></div>}
        <div className="mt-5 flex gap-2">
          <Boton variante="secundario" className="flex-1" onClick={() => setBorrar(false)}>Cancelar</Boton>
          <Boton variante="peligro" className="flex-1" cargando={eliminar.isPending} onClick={() => eliminar.mutate()}>Eliminar</Boton>
        </div>
      </Dialogo>
    </>
  );
}
