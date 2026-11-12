/*
 * Caché en memoria con vencimiento (TTL) y deduplicación, para las colecciones que la app interna carga completas
 * (datos.tsx). Si una pestaña pide algo que se trajo hace menos de `ttl`, no se vuelve a ir al servidor; si dos
 * pantallas lo piden a la vez, se hace una sola petición. Después de guardar algo se invalida (invalidar) y lo que
 * está en pantalla se vuelve a pedir.
 * Las listas paginadas (Pedidos, Clientes, Historial…) usan TanStack Query, que ya hace esto mismo con `staleTime`.
 * Vive solo en memoria: al recargar la página empieza vacía. No guarda nada en el navegador.
 */
interface Entrada<T> { valor?: T; hasta: number; enCurso?: Promise<T>; cargado: boolean }

export function crearCacheConsultas<K extends string>(ttlMs: number) {
  const entradas = new Map<K, Entrada<unknown>>();
  const entrada = (k: K) => { let e = entradas.get(k); if (!e) { e = { hasta: 0, cargado: false }; entradas.set(k, e); } return e; };

  return {
    /** ¿Se trajo hace menos del TTL (y no se invalidó)? */
    fresco: (k: K) => (entradas.get(k)?.hasta ?? 0) > Date.now(),
    /** ¿Se trajo alguna vez? (aunque ya esté vencido: se puede mostrar mientras llega lo nuevo) */
    cargado: (k: K) => !!entradas.get(k)?.cargado,
    /**
     * Devuelve lo guardado si está fresco; si no, llama `cargar()` una sola vez aunque lo pidan varios a la vez.
     * Con `forzar` siempre va al servidor (la recarga periódica y después de guardar).
     */
    obtener<T>(k: K, cargar: () => Promise<T>, { forzar = false } = {}): Promise<T> {
      const e = entrada(k) as Entrada<T>;
      // Una petición en curso sirve a quien pide lo mismo, salvo que se fuerce: entonces pudo salir antes de un cambio
      // recién guardado, y se pide otra vez cuando termine.
      if (e.enCurso && !forzar) return e.enCurso;
      if (!forzar && e.cargado && e.hasta > Date.now()) return Promise.resolve(e.valor as T);
      const previa = e.enCurso?.catch(() => undefined) ?? Promise.resolve();
      const p: Promise<T> = previa.then(cargar).then(v => { e.valor = v; e.cargado = true; e.hasta = Date.now() + ttlMs; return v; })
        .finally(() => { if (e.enCurso === p) e.enCurso = undefined; });
      e.enCurso = p;
      return p;
    },
    /** Marca como vencido (una clave, o todas). Lo ya cargado se sigue mostrando hasta que llegue lo nuevo. */
    invalidar(k?: K) {
      if (k) { const e = entradas.get(k); if (e) e.hasta = 0; }
      else entradas.forEach(e => { e.hasta = 0; });
    },
    /** Olvida una clave: hasta que se vuelva a traer, `cargado` es false. */
    olvidar: (k: K) => { const e = entradas.get(k); if (e && !e.enCurso) entradas.delete(k); else if (e) e.hasta = 0; },
    /** Olvida todo (al cambiar de cuenta). */
    vaciar: () => entradas.clear(),
  };
}
