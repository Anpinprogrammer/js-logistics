/* Oficina: clientes (remitentes), con búsqueda, alta y aviso de repetidos. */
import { useState } from "react";
import { useNavigate } from "react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { clientes } from "../../api/servicios";
import { FalloApi, mensajeDe } from "../../api/cliente";
import type { Cliente } from "../../api/tipos";
import { aPesos, pesos } from "../../lib/formato";
import { Aviso, Boton, Campo, Cargando, Dialogo, Titulo, Vacio } from "../../components/ui";
import { useAviso } from "../../components/Avisos";
import { IcMas } from "../../components/Iconos";

export default function Clientes() {
  const ir = useNavigate();
  const [buscar, setBuscar] = useState("");
  const [nuevo, setNuevo] = useState(false);
  const q = useQuery({ queryKey: ["clientes", "buscar", buscar], queryFn: () => clientes.listar(buscar), placeholderData: p => p });

  return (
    <>
      <Titulo accion={<Boton onClick={() => setNuevo(true)}><IcMas />Nuevo cliente</Boton>}>Clientes</Titulo>
      <div className="mb-4">
        <label htmlFor="bcl" className="sr-only">Buscar cliente</label>
        <input id="bcl" type="search" className="entrada" placeholder="Buscar por nombre o teléfono" value={buscar} onChange={e => setBuscar(e.target.value)} />
      </div>
      {q.isPending ? <Cargando /> : q.error ? <Aviso tipo="error">{mensajeDe(q.error)}</Aviso> : !q.data.length ? <Vacio titulo="Ningún cliente con ese nombre" /> : (
        <ul className="caja divide-y divide-linea">
          {q.data.map(c => (
            <li key={c.id}>
              <button className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left hover:bg-hueco" onClick={() => ir(`/clientes/${c.id}`)}>
                <span><b className="block">{c.nombre}</b><span className="text-sm text-suave">{c.telefono || "Sin teléfono"}</span></span>
                <span className="text-sm text-suave">Domicilio {pesos(c.tarifa)}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {nuevo && <FormCliente alCerrar={() => setNuevo(false)} alGuardar={c => ir(`/clientes/${c.id}`)} />}
    </>
  );
}

/** Crear o editar un cliente. Al crear, si el servidor avisa de un parecido, se muestra y se puede crear igual. */
export function FormCliente({ cliente, alCerrar, alGuardar }: { cliente?: Cliente; alCerrar: () => void; alGuardar?: (c: Cliente) => void }) {
  const qc = useQueryClient(), avisar = useAviso();
  const [nombre, setNombre] = useState(cliente?.nombre ?? "");
  const [telefono, setTelefono] = useState(cliente?.telefono ?? "");
  const [tarifa, setTarifa] = useState(cliente ? String(cliente.tarifa) : "");
  const [parecidos, setParecidos] = useState<Cliente[] | null>(null);

  const m = useMutation({
    mutationFn: (confirmarRepetido: boolean) => {
      const d = { nombre: nombre.trim(), telefono: telefono.trim(), tarifa: aPesos(tarifa) };
      return cliente ? clientes.actualizar(cliente.id, d) : clientes.crear({ ...d, confirmarRepetido });
    },
    onSuccess: c => { avisar(cliente ? "Cliente actualizado" : `Cliente ${c.nombre} creado`); qc.invalidateQueries({ queryKey: ["clientes"] }); alCerrar(); alGuardar?.(c); },
    onError: e => { if (e instanceof FalloApi && e.code === "POSIBLE_REPETIDO") setParecidos((e.datos as { parecidos: Cliente[] }).parecidos); }
  });

  return (
    <Dialogo abierto alCerrar={alCerrar} titulo={cliente ? "Editar cliente" : "Nuevo cliente"}>
      <form className="space-y-4" onSubmit={e => { e.preventDefault(); m.mutate(!!parecidos); }}>
        <Campo etiqueta="Nombre" value={nombre} onChange={e => { setNombre(e.target.value); setParecidos(null); }} required maxLength={120} />
        <Campo etiqueta="Teléfono" type="tel" value={telefono} onChange={e => { setTelefono(e.target.value); setParecidos(null); }} maxLength={30} />
        <Campo etiqueta="Domicilio por defecto" inputMode="numeric" value={tarifa} onChange={e => setTarifa(e.target.value)} />
        {parecidos ? (
          <Aviso tipo="alerta">
            Ya hay {parecidos.length === 1 ? "un cliente parecido" : "clientes parecidos"}:{" "}
            <b>{parecidos.map(c => `${c.nombre}${c.telefono ? " (" + c.telefono + ")" : ""}`).join(", ")}</b>. Si de verdad es otro, toca “Crear de todos modos”.
          </Aviso>
        ) : m.error && <Aviso tipo="error">{mensajeDe(m.error)}</Aviso>}
        <Boton type="submit" className="w-full" cargando={m.isPending}>{parecidos ? "Crear de todos modos" : "Guardar"}</Boton>
      </form>
    </Dialogo>
  );
}
