/* Modo demo: la caja del patinador vive en memoria (la usan su app y el bloque Patinadores de Caja). */
import type { PaginaSolicitudesRecogida, RegistroCajaPatinador, ResumenCajaPatinador, ResumenPatinador, SolicitudRecogida } from "../../api/tipos";
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

/** Solicitudes de recogida de la demo (las de la ficha del patinador de prueba). */
const BARRIOS = ["Granada", "San Fernando", "Ciudad Jardín", "Versalles", "El Peñón", "Tequendama", "Pance", "La Flora"];
const solicitudesDemo: SolicitudRecogida[] = BARRIOS.map((b, i) => ({
  guia: "JS-0" + (9100 + i), fecha: ahoraMenos(30 + i * 45), remitente: ["Tienda Aurora", "Moda Sol", "Panadería La Espiga", "Ferretería Central"][i % 4],
  direccionRecogida: `Cra ${10 + i} # ${5 + i}-2${i}, ${b}, Cali`, paquetes: 1 + (i % 3), destinatarioNombre: ["Pedro Ruiz", "Laura Gómez", "Marta Díaz"][i % 3], direccionEntrega: `Calle ${70 - i} # 1-1${i}, Cali`
}));
export function solicitudesRecogidaDemo(page: number, limit: number): PaginaSolicitudesRecogida {
  const totalPages = Math.max(1, Math.ceil(solicitudesDemo.length / limit)), p = Math.min(Math.max(1, page), totalPages);
  return { data: solicitudesDemo.slice((p - 1) * limit, p * limit), total: solicitudesDemo.length, page: p, totalPages };
}
