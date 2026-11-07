/* Mensajes cortos que aparecen abajo y se van solos ("Guía JS-00012 entregada"). */
import { createContext, useCallback, useContext, useState, type ReactNode } from "react";

type Tipo = "ok" | "error";
const Ctx = createContext<(texto: string, tipo?: Tipo) => void>(() => {});
export const useAviso = () => useContext(Ctx);

export function ProveedorAvisos({ children }: { children: ReactNode }) {
  const [lista, setLista] = useState<{ id: number; texto: string; tipo: Tipo }[]>([]);
  const avisar = useCallback((texto: string, tipo: Tipo = "ok") => {
    const id = Date.now() + Math.random();
    setLista(l => [...l, { id, texto, tipo }]);
    setTimeout(() => setLista(l => l.filter(x => x.id !== id)), 3500);
  }, []);
  return (
    <Ctx.Provider value={avisar}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 bottom-20 z-50 flex flex-col items-center gap-2 px-4 md:bottom-6" aria-live="polite">
        {lista.map(a => (
          <div key={a.id} role="status"
            className={`pointer-events-auto max-w-md rounded-xl px-4 py-3 text-sm font-medium text-white shadow-lg ${a.tipo === "error" ? "bg-rojo" : "bg-noche"}`}>
            {a.texto}
          </div>
        ))}
      </div>
    </Ctx.Provider>
  );
}
