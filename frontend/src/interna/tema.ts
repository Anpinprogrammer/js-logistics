/* Tema claro/oscuro de la app interna. Sin elección guardada se usa la preferencia del sistema;
   al tocar el botón se fija "light" o "dark" y se recuerda en este navegador. */
import { useCallback, useEffect, useLayoutEffect, useState } from "react";

export type Tema = "sistema" | "light" | "dark";

const CLAVE = "js_tema";
const prefiereOscuro = () =>
  typeof window !== "undefined" && !!window.matchMedia?.("(prefers-color-scheme: dark)").matches;

function temaGuardado(): Tema {
  try {
    const t = localStorage.getItem(CLAVE);
    return t === "light" || t === "dark" ? t : "sistema";
  } catch {
    return "sistema";
  }
}

export function useTema() {
  const [tema, setTema] = useState<Tema>(temaGuardado);
  const [sistemaOscuro, setSistemaOscuro] = useState(prefiereOscuro);

  // Mientras no haya una elección guardada, el icono sigue los cambios del sistema.
  useEffect(() => {
    const mq = window.matchMedia?.("(prefers-color-scheme: dark)");
    if (!mq) return;
    const alCambiar = (e: MediaQueryListEvent) => setSistemaOscuro(e.matches);
    mq.addEventListener("change", alCambiar);
    return () => mq.removeEventListener("change", alCambiar);
  }, []);

  const oscuro = tema === "dark" || (tema === "sistema" && sistemaOscuro);

  useLayoutEffect(() => {
    document.documentElement.classList.toggle("dark", oscuro);
    document.documentElement.style.colorScheme = oscuro ? "dark" : "light";
  }, [oscuro]);

  const cambiar = useCallback(() => {
    setTema(actual => {
      const efectivo = actual === "sistema" ? (sistemaOscuro ? "dark" : "light") : actual;
      const nuevo: Tema = efectivo === "dark" ? "light" : "dark";
      try { localStorage.setItem(CLAVE, nuevo); } catch { /* sin almacenamiento */ }
      return nuevo;
    });
  }, [sistemaOscuro]);

  return { tema, oscuro, cambiar };
}
