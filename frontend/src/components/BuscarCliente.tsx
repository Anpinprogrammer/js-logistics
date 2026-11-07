/* Selector de remitente con búsqueda por nombre o teléfono. */
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { clientes } from "../api/servicios";
import type { Cliente } from "../api/tipos";

export default function BuscarCliente({ valor, nombreActual, onElegir }: { valor: string | null; nombreActual?: string | null; onElegir: (c: Cliente | null) => void }) {
  const [texto, setTexto] = useState("");
  const [abierto, setAbierto] = useState(false);
  const q = useQuery({ queryKey: ["clientes", "buscar", texto], queryFn: () => clientes.listar(texto), enabled: abierto, staleTime: 30_000 });

  return (
    <div className="relative">
      <label htmlFor="bc" className="etiqueta">Remitente</label>
      <input
        id="bc" className="entrada" autoComplete="off" role="combobox" aria-expanded={abierto} aria-controls="bc-lista"
        placeholder={valor ? nombreActual ?? "" : "Escribe el nombre o el teléfono"}
        value={abierto ? texto : valor ? nombreActual ?? "" : ""}
        onFocus={() => setAbierto(true)}
        onBlur={() => setTimeout(() => setAbierto(false), 150)}
        onChange={e => setTexto(e.target.value)}
      />
      {abierto && (
        <ul id="bc-lista" role="listbox" className="caja absolute inset-x-0 top-full z-20 mt-1 max-h-64 overflow-y-auto p-1">
          {q.isPending && <li className="p-3 text-sm text-suave">Buscando…</li>}
          {q.data?.length === 0 && <li className="p-3 text-sm text-suave">Ningún cliente con ese nombre. Créalo en Clientes.</li>}
          {q.data?.slice(0, 50).map(c => (
            <li key={c.id} role="option" aria-selected={c.id === valor}>
              <button type="button" className="flex w-full justify-between gap-3 rounded-lg px-3 py-2 text-left text-sm hover:bg-hueco"
                onMouseDown={e => e.preventDefault()} onClick={() => { onElegir(c); setAbierto(false); setTexto(""); }}>
                <span className="font-medium">{c.nombre}</span><span className="text-suave">{c.telefono}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
