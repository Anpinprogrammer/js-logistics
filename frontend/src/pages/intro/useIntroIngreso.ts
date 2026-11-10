/* Reloj de la animación de entrada del ingreso: decide si se muestra, la hace avanzar y deja saltarla. */
import { useCallback, useEffect, useState } from "react";
import { FPS, TOTAL } from "./tiempos";

const SIN_MOVIMIENTO = "(prefers-reduced-motion: reduce)";
/** La marca blanca que nace en el choque: se pide antes de arrancar para que esté lista cuando le toca. */
export const MARCA_BLANCA = "/marca-blanca.webp";

/** Sale en cada carga del ingreso (no se guarda nada en el navegador), y nunca si la persona pidió reducir el movimiento. */
function debeMostrarse() {
  return typeof window !== "undefined" && !window.matchMedia?.(SIN_MOVIMIENTO).matches;
}

export function useIntroIngreso() {
  const [activa, setActiva] = useState(debeMostrarse);
  /** Cuadro actual (60 por segundo, con decimales). */
  const [cuadro, setCuadro] = useState(0);
  const saltar = useCallback(() => setActiva(false), []);

  useEffect(() => {
    if (!activa) return;
    let raf = 0, inicio = -1, vivo = true;
    const paso = (ahora: number) => {
      if (inicio < 0) inicio = ahora;
      const c = ((ahora - inicio) / 1000) * FPS;
      if (c >= TOTAL) { setActiva(false); return; }
      setCuadro(c);
      raf = requestAnimationFrame(paso);
    };
    // Arranca cuando la marca blanca ya bajó (o a los 400 ms, lo que pase primero).
    const arrancar = () => { if (vivo && !raf) raf = requestAnimationFrame(paso); };
    const img = new Image();
    img.onload = img.onerror = arrancar;
    img.src = MARCA_BLANCA;
    const espera = window.setTimeout(arrancar, 400);

    // Un clic, un toque, una tecla o el foco en un campo la terminan al instante.
    const fin = () => setActiva(false);
    const mq = window.matchMedia?.(SIN_MOVIMIENTO);
    window.addEventListener("pointerdown", fin, true);
    window.addEventListener("keydown", fin, true);
    window.addEventListener("focusin", fin, true);
    mq?.addEventListener?.("change", fin);
    return () => {
      vivo = false;
      cancelAnimationFrame(raf);
      window.clearTimeout(espera);
      window.removeEventListener("pointerdown", fin, true);
      window.removeEventListener("keydown", fin, true);
      window.removeEventListener("focusin", fin, true);
      mq?.removeEventListener?.("change", fin);
    };
  }, [activa]);

  return { activa, cuadro, saltar };
}
