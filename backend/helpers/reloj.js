/* Reloj del servidor. Se puede fijar en las pruebas para que "hoy" y las horas sean siempre las mismas. */
let fijo = null;
export const ahora = () => (fijo ?? Date.now());
export function fijarReloj(ms) { fijo = ms; }
export function soltarReloj() { fijo = null; }
