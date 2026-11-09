/* Carga diferida de pantallas, con precarga. */
import { createElement, lazy, type ComponentType } from "react";

/**
 * Como `lazy()`, pero si la pantalla ya se precargó la pinta de una vez, sin pasar por el "Cargando…".
 * (Con `lazy()` solo, React muestra el aviso de carga y espera unos 300 ms antes de pintar, aunque el archivo ya esté bajado.)
 * Cada pantalla elige una sola vez cómo pintarse, para no volver a montarla y perder lo que la persona estaba escribiendo.
 */
export function perezoso<P extends object>(cargar: () => Promise<{ default: ComponentType<P> }>) {
  let modulo: ComponentType<P> | undefined, conLazy = false;
  const precargar = () => cargar().then(m => { modulo = m.default; return m; });
  const Diferido = lazy(precargar);
  function Pantalla(props: P) {
    if (modulo && !conLazy) return createElement(modulo, props);
    conLazy = true;
    return createElement(Diferido, props);
  }
  return Object.assign(Pantalla, { precargar });
}
