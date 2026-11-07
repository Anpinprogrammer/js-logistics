/* Utilidades para pasar entre filas de Postgres (snake_case) y objetos de la API (camelCase). */

export const aCamel = s => s.replace(/_([a-z])/g, (_, l) => l.toUpperCase());
export const aSnake = s => s.replace(/[A-Z]/g, l => "_" + l.toLowerCase());

/** Fila de la base → objeto con claves en camelCase. */
export const filaAObjeto = fila => {
  if (!fila) return null;
  const o = {};
  for (const [k, v] of Object.entries(fila)) o[aCamel(k)] = v;
  return o;
};

/**
 * Arma "col1 = $1, col2 = $2" solo con los campos permitidos que vengan definidos.
 * Los nombres de columna salen de la lista `permitidos` (escrita en el código), nunca del usuario.
 * `desde` es el número del primer parámetro. Devuelve { sql, valores } o null si no hay nada que cambiar.
 */
export function armarSet(datos, permitidos, desde = 1) {
  const cols = [], valores = [];
  for (const campo of permitidos) {
    if (datos[campo] === undefined) continue;
    valores.push(datos[campo]);
    cols.push(`${aSnake(campo)} = $${desde + valores.length - 1}`);
  }
  if (!cols.length) return null;
  return { sql: cols.join(", "), valores };
}
