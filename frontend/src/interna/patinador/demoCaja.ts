/* Modo demo: la caja del patinador vive en memoria (la usan su app y el bloque Patinadores de Caja). */
import type { RegistroCajaPatinador, ResumenCajaPatinador, ResumenPatinador } from "../../api/tipos";
import { diaDe, hoy, S } from "../motor";

const ahoraMenos = (min: number) => new Date(Date.now() - min * 60_000).toISOString();
export const registrosDemo: RegistroCajaPatinador[] = [
  { id: "demo-p1", mensajeroId: "m-pat", clienteId: "demo-c1", clienteNombre: "Tienda Aurora", concepto: "Domicilios de la semana", valor: 24000, fecha: ahoraMenos(180) },
  { id: "demo-p2", mensajeroId: "m-pat", clienteId: "demo-c2", clienteNombre: "Moda Sol", concepto: "Envío", valor: 8000, fecha: ahoraMenos(90) },
];

/** `mensajeroId` es la ficha: lo entregado sale de las entregas de dinero (S.recaudos), como en el servidor. */
export function resumenDe(rs: RegistroCajaPatinador[], mensajeroId: string): ResumenCajaPatinador {
  const h = hoy(), deHoy = rs.filter(r => diaDe(Date.parse(r.fecha)) === h);
  const es = Object.values(S.recaudos).filter(r => r.mensajeroId === mensajeroId), v = (r: { valor?: unknown }) => Number(r.valor) || 0;
  const total = rs.reduce((a, r) => a + r.valor, 0), entregado = es.reduce((a, r) => a + v(r), 0);
  return { total, registros: rs.length, totalHoy: deHoy.reduce((a, r) => a + r.valor, 0), registrosHoy: deHoy.length,
    entregado, entregadoHoy: es.filter(r => diaDe(r.fecha) === h).reduce((a, r) => a + v(r), 0), enCaja: total - entregado };
}

/** Como GET /patinador/resumen: lo entregado sale de las entregas de dinero (S.recaudos), igual que en el servidor. */
export function resumenPatinadoresDemo(): ResumenPatinador[] {
  const h = hoy();
  return Object.values(S.mensajeros).filter(m => m.tipo === "patinador").map(m => {
    const rs = registrosDemo.filter(r => r.mensajeroId === m.id), es = Object.values(S.recaudos).filter(r => r.mensajeroId === m.id);
    const recibido = rs.reduce((a, r) => a + r.valor, 0), entregado = es.reduce((a, r) => a + (Number(r.valor) || 0), 0);
    return { mensajeroId: m.id, nombre: m.nombre, activo: true, recibido, registros: rs.length, entregado, debe: recibido - entregado,
      recibidoHoy: rs.filter(r => diaDe(Date.parse(r.fecha)) === h).reduce((a, r) => a + r.valor, 0),
      entregadoHoy: es.filter(r => diaDe(r.fecha) === h).reduce((a, r) => a + (Number(r.valor) || 0), 0) };
  });
}
