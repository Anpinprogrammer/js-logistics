/* Control de la intro del ingreso: sale en cada carga del login, saltable y respeta "reducir movimiento". */
import { useCallback, useEffect, useState } from "react";
import { useReducedMotion } from "motion/react";
import { FIN } from "./tiempos";

export interface ControlIntro { activa: boolean; saltar: () => void }

export function useIntroIngreso(): ControlIntro {
  const reducir = useReducedMotion();
  const [activa, setActiva] = useState(() => !reducir);

  const saltar = useCallback(() => setActiva(false), []);

  // Si el sistema cambia a "reducir movimiento", se corta de inmediato.
  useEffect(() => { if (reducir) setActiva(false); }, [reducir]);

  // Cada visita o recarga del formulario de ingreso vuelve a mostrar la animación.
  useEffect(() => {
    if (!activa) return;
    const reloj = window.setTimeout(() => setActiva(false), FIN * 1000);
    return () => window.clearTimeout(reloj);
  }, [activa]);

  // Clic, toque, tecla, foco en un campo o envío: todo salta al estado final.
  useEffect(() => {
    if (!activa) return;
    const saltarEvento = () => saltar();
    const opciones: AddEventListenerOptions = { capture: true };
    document.addEventListener("pointerdown", saltarEvento, opciones);
    document.addEventListener("keydown", saltarEvento, opciones);
    document.addEventListener("focusin", saltarEvento, opciones);
    document.addEventListener("submit", saltarEvento, opciones);
    return () => {
      document.removeEventListener("pointerdown", saltarEvento, opciones);
      document.removeEventListener("keydown", saltarEvento, opciones);
      document.removeEventListener("focusin", saltarEvento, opciones);
      document.removeEventListener("submit", saltarEvento, opciones);
    };
  }, [activa, saltar]);

  return { activa, saltar };
}
