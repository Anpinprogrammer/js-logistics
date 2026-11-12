/* Avisos en tiempo real del backend (GET /eventos). Cuando cambia una colección, se vuelve a pedir lo que usa esa
   pantalla. Si el navegador o el proxy no mantienen SSE, las consultas siguen con su sondeo normal. */
import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { BASE } from "../api/cliente";
import { DEMO } from "./demo";

export function useEventos() {
  const qc = useQueryClient();
  useEffect(() => {
    if (DEMO || typeof EventSource === "undefined") return;
    const es = new EventSource(`${BASE}/eventos`, { withCredentials: true });
    const alCambiar = (e: MessageEvent) => {
      try {
        const d = JSON.parse(e.data) as { cols?: string[] };
        if (d?.cols?.includes("solicitudes")) qc.invalidateQueries({ queryKey: ["solicitudes"] });
        if (d?.cols?.includes("pedidos")) qc.invalidateQueries({ queryKey: ["pedidos"] });
      } catch { /* un evento incompleto no debe romper la pantalla */ }
    };
    es.addEventListener("cambio", alCambiar);
    return () => { es.removeEventListener("cambio", alCambiar); es.close(); };
  }, [qc]);
}
