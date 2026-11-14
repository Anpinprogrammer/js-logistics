/*
 * Reglas y cálculos de la app interna, portados de app/js/app.js (el prototipo) casi línea por línea, para que
 * las pantallas muestren exactamente las mismas cifras. Trabajan sobre el almacén `S`, que llena datos.tsx con lo
 * que devuelve el backend: las fechas ya vienen convertidas a milisegundos, como en el prototipo.
 *
 * Si cambia una regla en el prototipo, cámbiala aquí igual. Cuando el backend calcule algo (saldos, caja), esa
 * función se reemplaza por el valor del servidor.
 */

import type { SolicitudDePedido } from "../api/tipos";

/* ---------- tipos del almacén (forma del prototipo) ---------- */
export type Medio = "efectivo" | "nequi" | "bancolombia";
export type Metodo = "efectivo" | "transf_js" | "transf_cliente";
export type Motivo = "no_contesta" | "direccion" | "rechazo" | "reprogramar" | "otro";
export type TipoPersonal = "mensajero" | "dueno" | "oficina" | "patinador" | "empresa";
export type TipoMov = "cargo" | "abono" | "pago_a_cliente" | "pago_de_cliente" | "compra_cliente" | "ganancia";

export interface Intento { fecha: number; motivo: Motivo | ""; nota: string }
export interface Pedido {
  /** aceptado = por recoger (guía de una solicitud sin foto); pendiente = en ruta, por entregar. */
  guia: string; n: number; estado: "aceptado" | "pendiente" | "entregado" | "devuelto";
  creado: number; entregado: number | null;
  mensajeroId: string; clienteId: string; clienteNombre: string;
  valorServicio: number; aCobrar: number;
  destinatario: string; valorCobrado: number; metodo: Metodo | "devuelto" | "";
  cuentaJs: "" | "nequi" | "bancolombia"; difCobro: number; difRevisada: boolean;
  motivoDev: Motivo | ""; notaDev: string; cobrarDev: boolean;
  /** Devuelto: dónde quedó el paquete ("por_definir" hasta que el mensajero lo diga; "" = devuelto de antes del cambio). */
  destinoDev?: "" | "por_definir" | "cliente" | "oficina" | "reintento";
  /** Enlaces entre guías: la que esta reintenta, las que la reintentan y cuándo el cliente pidió el reintento. */
  reintentoDe?: string; reintentos?: { guia: string; estado: "aceptado" | "pendiente" | "entregado" | "devuelto" }[]; reintentoPedido?: number | null;
  cambio: boolean; cambioRecibido: number | null;
  gasto: number; gastoNota: string;
  domiPagado: boolean; domiPagoMedio: Medio | ""; domiPagoValor: number | null; domiPagoFecha: number; domiPagoUid: string;
  intentos: Intento[]; mini: string;
  /** Dónde recoger y a quién entregar, si la guía salió de una solicitud. */
  solicitud?: SolicitudDePedido | null;
}
export interface Cliente { id: string; nombre: string; telefono: string; tarifa: number }
export interface Persona { id: string; nombre: string; telefono: string; tipo: TipoPersonal; tarifa: number }
export interface Movimiento { id: string; clienteId: string; tipo: TipoMov; valor: number; medio: Medio | ""; nota: string; fecha: number; porUid: string; porNombre: string; medioAntes?: string; mensajeroId?: string }
export interface Recaudo { id: string; mensajeroId: string; valor: number; medio: Medio; nota: string; fecha: number; porUid: string; porNombre: string; medioAntes?: string }
export interface Liquidacion {
  id: string; mensajeroId: string; fecha: number; desde: number; guias?: string[];
  entregas: number; efectivo: number; transfJs: number; transfCli: number; gastos: number; base: number;
  recibido: number; anterior: number; ajuste: number; debe: number; sueldo: number; nota?: string;
  recibidoAntes?: number; entregaFinal?: number; adelanto?: number; enRuta?: number; dia?: string; cobros?: number;
}
export interface Jornada { id: string; personaId: string; dia: string; valor: number }
export interface CajaMov {
  id: string; tipo: "entra" | "sale" | "base" | "marca"; cat: string; valor: number; medio: Medio | "";
  concepto: string; fecha: number; personaId: string; personaUid?: string; cuentaId?: string; semana?: string;
  porUid?: string; porNombre?: string; devuelto?: number; adelantoId?: string; deLiquidacion?: string; inicial?: boolean;
  nivel?: boolean; arqueoId?: string; esperado?: Record<string, number>; contado?: Record<string, number>; medioAntes?: string;
}
export interface Cuenta { id: string; nombre: string; tipo: "socio" | "base" }
export interface UsuarioS { uid: string; email: string; nombre: string; rol: string; clienteId: string; mensajeroId: string; activo: boolean; status?: "pending_activation" | "active" | "disabled" }
export interface Vinculo { uid: string; mensajeroId: string }

export interface Almacen {
  pedidos: Record<string, Pedido>; clientes: Record<string, Cliente>; mensajeros: Record<string, Persona>;
  movimientos: Record<string, Movimiento>; recaudos: Record<string, Recaudo>; liquidaciones: Record<string, Liquidacion>;
  jornadas: Record<string, Jornada>; cajamovs: Record<string, CajaMov>; vinculos: Record<string, Vinculo>;
  usuarios: Record<string, UsuarioS>; cuentas: Record<string, Cuenta>;
}

export const S: Almacen = { pedidos: {}, clientes: {}, mensajeros: {}, movimientos: {}, recaudos: {}, liquidaciones: {}, jornadas: {}, cajamovs: {}, vinculos: {}, usuarios: {}, cuentas: {} };
/** Quién usa la app. Lo llena datos.tsx con la sesión. */
export const yo = { uid: "", nombre: "", esAdmin: false, esAsistente: false, corteRemoto: 0 };

/* ---------- utilidades ---------- */
const ZONA = "America/Bogota";
export const pesos = (n: number | null | undefined) => "$ " + Math.round(Number(n) || 0).toLocaleString("es-CO");
export const diaDe = (ts: number) => new Date(ts).toLocaleDateString("en-CA", { timeZone: ZONA });
export const hoy = () => diaDe(Date.now());
export const hora = (ts: number | null | undefined) =>
  new Date(Number(ts) || 0).toLocaleString("es-CO", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", timeZone: ZONA });
export const horaCorta = (ts: number) => new Date(ts).toLocaleTimeString("es-CO", { hour: "2-digit", minute: "2-digit", timeZone: ZONA });
/** Mediodía de un día AAAA-MM-DD en hora de Colombia: para mover días sin que el huso cambie la fecha. */
const mediodia = (d: string) => new Date(d + "T12:00:00-05:00");
export const horaActual = () => Number(new Date().toLocaleString("en-US", { hour: "numeric", hour12: false, timeZone: ZONA })) % 24;
export const sinTildes = (s: string) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
export const fechaDia = (f: string) => (f === hoy() ? Date.now() : mediodia(f).getTime());
export const fechaLarga = (d: string) => mediodia(d).toLocaleDateString("es-CO", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: ZONA });
export const diaCorto = (d: string) => mediodia(d).toLocaleDateString("es-CO", { weekday: "short", day: "numeric", month: "short", timeZone: ZONA });
export function moverDia(d: string, n: number) { const x = mediodia(d || hoy()); x.setUTCDate(x.getUTCDate() + n); return diaDe(x.getTime()); }
export const pct = (a: number, b: number) => (b ? Math.round((a * 100) / b) : 0);
export const listaOrdenada = <T extends object>(obj: Record<string, T>, campo: keyof T, desc?: boolean): T[] =>
  Object.values(obj).sort((a, b) => desc
    ? (Number(b[campo]) || 0) - (Number(a[campo]) || 0)
    : String(a[campo] ?? "").localeCompare(String(b[campo] ?? ""), "es"));
export const normNom = (x: string) => sinTildes(x).replace(/[^a-z0-9]/g, "");
export const normTel = (x: string) => String(x || "").replace(/\D/g, "").slice(-10);
export function telWhatsApp(t: string) { let d = String(t || "").replace(/\D/g, ""); if (d.length === 10 && d[0] === "3") d = "57" + d; return d; }

/* ---------- constantes del negocio ---------- */
export const METODOS: Record<Metodo, { t: string; d: string }> = {
  efectivo: { t: "Efectivo", d: "El mensajero recibe el dinero en mano" },
  transf_js: { t: "Transferencia a JS", d: "El destinatario le transfiere a la empresa" },
  transf_cliente: { t: "Transferencia al cliente", d: "Le pagaron directo al remitente: el remitente queda debiendo el domicilio" },
};
export const MOTIVOS: Record<Motivo, string> = {
  no_contesta: "No contestan", direccion: "Dirección errada", rechazo: "Lo rechazaron", reprogramar: "Reprogramar (sigue en ruta)", otro: "Otro motivo",
};
/** Devolución: dónde quedó el paquete. */
export const DESTINOS_DEV = { cliente: "Con el cliente", oficina: "En la oficina de JS", reintento: "En reintento" } as const;
/** Todas las guías de una misma entrega, de la primera a la última: la original y sus reintentos (en orden). */
export function cadenaGuias(guia: string): string[] {
  let g = guia; const vistos = new Set<string>();
  while (S.pedidos[g]?.reintentoDe && !vistos.has(g)) { vistos.add(g); g = S.pedidos[g].reintentoDe!; }
  const cadena = [g];
  for (let p = S.pedidos[g]; p?.reintentos?.length;) { const sig = p.reintentos[p.reintentos.length - 1].guia; if (cadena.includes(sig)) break; cadena.push(sig); p = S.pedidos[sig]; }
  return cadena;
}
export const CUENTAS_JS = { nequi: "Nequi", bancolombia: "Bancolombia" } as const;
export const MEDIOS: Record<Medio, string> = { efectivo: "Efectivo", nequi: "Nequi", bancolombia: "Bancolombia" };
export const MEDIOS_CAJA: Record<string, string> = { ...MEDIOS, cuentas: "Cuentas JS (transferencias)" };
export const MOVS: Record<TipoMov, { t: string; corto: string; s: 1 | -1; pago?: boolean; caja?: boolean }> = {
  cargo: { t: "Cargo al cliente (queda debiendo)", corto: "Cargo", s: -1 },
  abono: { t: "Abono a favor del cliente", corto: "A favor", s: 1 },
  pago_a_cliente: { t: "JS le paga al cliente", corto: "Pago al cliente", s: -1, pago: true },
  pago_de_cliente: { t: "El cliente le paga a JS", corto: "Pago del cliente", s: 1, pago: true },
  compra_cliente: { t: "Compra por encargo del cliente (sale de la caja)", corto: "Compra por encargo", s: -1, caja: true },
  ganancia: { t: "Ganancia ocasional de JS (se le carga al cliente)", corto: "Servicio adicional", s: -1 },
};
export const MOVS_OFICINA: TipoMov[] = ["pago_de_cliente", "pago_a_cliente", "compra_cliente", "ganancia"];
export const CATS: Record<string, string> = {
  devolucion: "Devolución de adelanto", arqueo: "Arqueo", interna: "Cuenta interna", inicial: "Caja inicial", otro_entra: "Otra entrada",
  sobrante: "Sobrante de caja", gasto: "Gasto", base: "Base para vueltos", arriendo: "Arriendo", adelanto: "Adelanto", sueldo: "Pago de sueldo", otro: "Otra salida",
};
export const CATS_TIPO = { entra: ["otro_entra"], sale: ["gasto", "base", "arriendo", "adelanto", "sueldo", "otro"] };
/** Movimientos de caja a nombre de una persona, y los que se descuentan del sueldo de la semana que se elige. */
export const CATS_PERSONA = ["adelanto", "sueldo", "base"];
export const CATS_SEMANA = ["adelanto", "sueldo"];
export const SUBMAS: [string, string][] = [["resultados", "Resultados"], ["personal", "Personal"], ["historial", "Historial"], ["papelera", "Papelera"], ["respaldo", "Respaldo y espacio"]];
export const TIPOS: Record<TipoPersonal, string> = { mensajero: "Mensajero", dueno: "Dueño (Javier)", oficina: "Oficina (JS)", patinador: "Patinador", empresa: "Empresa (JS)" };
export const TIPOS_CUENTA = { socio: "Empresa o tienda (presta y devuelve)", base: "Base de la empresa" };
export const ROLES: Record<string, string> = { mensajero: "Mensajero", asistente: "Asistente", admin: "Administración", cliente: "Cliente", patinador: "Patinador" };
export const ESTADOS: Record<string, string> = { pendiente: "por entregar", entregado: "entregado", devuelto: "devuelto" };
export const EMPRESA = { nombre: "JS LOGISTICS CALI", lema: "¡SERVIR ES NUESTRA LABOR!", tel: "TEL: 316 493 3854", ig: "IG: @JS.LOGISTICS.CALI" };
export const PAGOS_TEXTO = ["💳 *Opciones de pago – Transferencias*", "", "Para tu comodidad, puedes realizar tu pago a cualquiera de nuestras cuentas:", "",
  "📱 *NEQUI*", "Número: 316 493 3854", "Titular: Javier Salazar", "",
  "🇨🇴 *Bancolombia – Cuenta de Ahorros*", "Número: 815 13203390", "Titular: Javier Salazar"];
export const DIAS_SEM = ["Sáb", "Dom", "Lun", "Mar", "Mié", "Jue", "Vie"];
export const PCT_SUELDO = 0.7, DESC_SUELDO = 25000;
export const PAGO_FIJO: TipoPersonal[] = ["patinador", "oficina", "empresa"];
export const ORDEN_TIPO: TipoPersonal[] = ["mensajero", "oficina", "patinador", "empresa", "dueno"];
export const SUELDO_POR_SALIDA = "2026-10-31";
export const COLOR_ESTADO = { entregado: "var(--verde)", ruta: "var(--mango)", devuelto: "var(--rojo)" };

/* ---------- pedidos ---------- */
export const cerrado = (p: Pedido) => p.estado === "entregado" || p.estado === "devuelto";
export const servicio = (p: Pick<Pedido, "estado" | "cobrarDev" | "valorServicio">) => (p.estado === "devuelto" && !p.cobrarDev ? 0 : Number(p.valorServicio) || 0);
export const metodoTxt = (p: Pick<Pedido, "estado" | "motivoDev" | "metodo">) => p.estado === "devuelto"
  ? "Devolución" + (p.motivoDev ? " (" + (MOTIVOS[p.motivoDev] || "").toLowerCase() + ")" : "")
  : (METODOS[p.metodo as Metodo]?.t || "");
export const gastoDe = (p: Pick<Pedido, "gasto">) => Number(p.gasto) || 0;
export const pagoDomi = (p: Pedido) => !p.domiPagado ? 0 : p.domiPagoValor != null ? (Number(p.domiPagoValor) || 0) : servicio(p);
export const cargoEnvio = (p: Pedido) => servicio(p) + gastoDe(p);
export function saldoPedido(p: Pedido) {
  if (!cerrado(p)) return 0;
  const cob = p.metodo === "transf_cliente" || p.estado === "devuelto" ? 0 : (Number(p.valorCobrado) || 0);
  return cob - cargoEnvio(p) + pagoDomi(p);
}
export const textoDomi = (p: Pedido) => (p.domiPagado ? "pagó domicilio " + pesos(pagoDomi(p)) : "domicilio " + pesos(servicio(p))) + (gastoDe(p) ? " · flete " + pesos(gastoDe(p)) : "");
export const tipoCuenta = (s: number) => (s > 0 ? "Por pagar" : s < 0 ? "Por cobrar" : "Paz y salvo");
export const cambioPendiente = (p: Pedido) => !!p.cambio && !p.cambioRecibido;
export const sinServicio = (p: Pedido) => p.estado === "entregado" && !!p.clienteId && !Number(p.valorServicio);
export const ultimaActividad = (p: Pedido) => Math.max(p.creado || 0, p.entregado || 0);
export const delDia = (p: Pedido, d: string) => !d || diaDe(p.creado) === d || (!!p.entregado && diaDe(p.entregado) === d);
export function totales(ps: Pedido[]) {
  const t = { efectivo: 0, transfJs: 0, transfCli: 0, servicio: 0 };
  for (const p of ps) {
    const v = Number(p.valorCobrado) || 0;
    if (p.metodo === "efectivo") t.efectivo += v; else if (p.metodo === "transf_js") t.transfJs += v; else t.transfCli += v;
    t.servicio += servicio(p);
  }
  return t;
}
export function entregasPorDia(ps: Pedido[], n: number) {
  const h = hoy(), porDia: Record<string, number> = {};
  ps.forEach(p => { if (p.estado === "entregado" && p.entregado) { const d = diaDe(p.entregado); porDia[d] = (porDia[d] || 0) + 1; } });
  return [...Array(n)].map((_, i) => { const d = moverDia(h, i - n + 1), k = porDia[d] || 0; return { l: String(Number(d.slice(8))), n: k, tip: `${diaCorto(d)}: ${k} entrega${k === 1 ? "" : "s"}`, hoy: d === h }; });
}

/* ---------- clientes ---------- */
export const signoMov = (m: Movimiento) => (MOVS[m.tipo]?.s || -1) * (Number(m.valor) || 0);
export const esPago = (m: { tipo: string }) => !!MOVS[m.tipo as TipoMov]?.pago;
/** Pago que recibió un mensajero en la calle en efectivo: abona al cliente pero no mueve la caja hasta que él lo entrega
    (recaudo) y mientras tanto suma a lo que debe (periodoMensajero). Por Nequi o Bancolombia ya está en la cuenta de JS:
    mueve la caja como cualquier pago. Igual que helpers/calculos.js del backend. */
export const enManoDeMensajero = (m: { mensajeroId?: string; medio?: string }) => !!m.mensajeroId && (m.medio || "efectivo") === "efectivo";
export const mueveCaja = (m: { tipo: string; mensajeroId?: string; medio?: string }) => !enManoDeMensajero(m) && (esPago(m) || !!MOVS[m.tipo as TipoMov]?.caja);
/** Pagos en efectivo de clientes que tiene el mensajero `mid` (+ lo que le dieron, − si se le devolvió al cliente). */
export const esCobroMensajero = (m: Movimiento, mid: string) => enManoDeMensajero(m) && m.mensajeroId === mid && esPago(m);
/* Pedidos y movimientos agrupados por cliente, armados una vez por pintada. Antes cada saldo recorría todas las guías:
   el Panel, la Caja y Cuentas suman el saldo de todos los clientes y eso era clientes × guías en cada pintada.
   El grupo dura hasta el final de la tarea actual (queueMicrotask) o hasta que cambie S.pedidos o S.movimientos,
   así que un cambio guardado después siempre se ve. El orden dentro de cada grupo es el de S, igual que antes. */
let grupos: { pedidos: typeof S.pedidos; movimientos: typeof S.movimientos; ps: Map<string, Pedido[]>; ms: Map<string, Movimiento[]>; saldos: Map<string, number> } | null = null;
function porCliente() {
  if (grupos && grupos.pedidos === S.pedidos && grupos.movimientos === S.movimientos) return grupos;
  const ps = new Map<string, Pedido[]>(), ms = new Map<string, Movimiento[]>(), saldos = new Map<string, number>();
  for (const p of Object.values(S.pedidos)) { const g = ps.get(p.clienteId); if (g) g.push(p); else ps.set(p.clienteId, [p]); saldos.set(p.clienteId, (saldos.get(p.clienteId) || 0) + saldoPedido(p)); }
  for (const m of Object.values(S.movimientos)) { const g = ms.get(m.clienteId); if (g) g.push(m); else ms.set(m.clienteId, [m]); saldos.set(m.clienteId, (saldos.get(m.clienteId) || 0) + signoMov(m)); }
  const g = grupos = { pedidos: S.pedidos, movimientos: S.movimientos, ps, ms, saldos };
  queueMicrotask(() => { if (grupos === g) grupos = null; });
  return g;
}
export function saldoCliente(cid: string) {
  return porCliente().saldos.get(cid) || 0;
}
export const nombreCliente = (id: string) => S.clientes[id]?.nombre || (id && Object.values(S.pedidos).find(p => p.clienteId === id && p.clienteNombre)?.clienteNombre) || "";
export interface FilaCuenta { fecha: number; det: string; v: number; pid?: string; dp?: boolean; mid?: string; nom: string }
export function filasCuenta(cid: string): FilaCuenta[] {
  const g = porCliente();
  const ps = (g.ps.get(cid) || []).filter(p => cerrado(p)).map(p => ({
    fecha: p.entregado || 0, det: `${p.guia} · ${p.destinatario || ""} · ${metodoTxt(p)} · cobró ${pesos(p.valorCobrado)} · ${textoDomi(p)}`,
    v: saldoPedido(p), pid: p.guia, dp: !!p.domiPagado, nom: p.destinatario || (p.estado === "devuelto" ? "Devolucion" : ""),
  }));
  const ms = (g.ms.get(cid) || []).map(m => ({
    fecha: m.fecha, det: (MOVS[m.tipo]?.corto || "Movimiento") + (m.nota ? " · " + m.nota : ""), v: signoMov(m), mid: m.id,
    nom: (MOVS[m.tipo]?.corto || "Movimiento") + (m.nota ? " " + m.nota : ""),
  }));
  return [...ps, ...ms].sort((a, b) => b.fecha - a.fecha);
}
export function parecidos(nombre: string, tel: string, excluir?: string) {
  const nn = normNom(nombre), nt = normTel(tel);
  return Object.values(S.clientes).filter(c => c.id !== excluir).map(c => {
    const mismoNom = !!nn && normNom(c.nombre) === nn, mismoTel = nt.length >= 7 && normTel(c.telefono) === nt;
    return { c, mismoNom, mismoTel, igual: mismoNom && mismoTel };
  }).filter(d => d.mismoNom || d.mismoTel).sort((a, b) => Number(b.igual) - Number(a.igual));
}
export function gruposRepetidos() {
  const cs = Object.values(S.clientes), padre: Record<string, string> = {};
  const raiz = (x: string): string => (padre[x] === x ? x : (padre[x] = raiz(padre[x])));
  cs.forEach(c => (padre[c.id] = c.id));
  const juntar = (clave: (c: Cliente) => string) => { const vistos: Record<string, string> = {}; cs.forEach(c => { const k = clave(c); if (!k) return; if (vistos[k]) padre[raiz(c.id)] = raiz(vistos[k]); else vistos[k] = c.id; }); };
  juntar(c => normNom(c.nombre)); juntar(c => { const t = normTel(c.telefono); return t.length >= 7 ? t : ""; });
  const g: Record<string, Cliente[]> = {}; cs.forEach(c => (g[raiz(c.id)] = g[raiz(c.id)] || []).push(c));
  return Object.values(g).filter(x => x.length > 1);
}
export function cuadreDia(dia: string) {
  type Linea = { t: string; guia?: string; p?: Pedido; v: number; f: number };
  type R = { cid: string; anterior: number; lineas: Linea[]; delDia: number; pagos: number };
  const res: Record<string, R> = {};
  const get = (cid: string) => (res[cid] = res[cid] || { cid, anterior: 0, lineas: [], delDia: 0, pagos: 0 });
  for (const p of Object.values(S.pedidos)) {
    if (!cerrado(p) || !p.clienteId) continue;
    const d = diaDe(p.entregado || 0), s = saldoPedido(p), dev = p.estado === "devuelto";
    if (d < dia) get(p.clienteId).anterior += s;
    else if (d === dia) { const r = get(p.clienteId); r.lineas.push({ t: (dev ? "Devolución" : "") + (dev && p.destinatario ? " · " : "") + (p.destinatario || (dev ? "" : p.guia)), guia: p.guia, p, v: s, f: p.entregado || 0 }); r.delDia += s; }
  }
  for (const m of Object.values(S.movimientos)) {
    const d = diaDe(m.fecha), s = signoMov(m);
    if (d < dia) get(m.clienteId).anterior += s;
    else if (d === dia) { const r = get(m.clienteId); if (esPago(m)) r.pagos += s; else { r.lineas.push({ t: (MOVS[m.tipo]?.corto || "Ajuste") + (m.nota ? ": " + m.nota : ""), v: s, f: m.fecha }); r.delDia += s; } }
  }
  return Object.values(res).filter(r => S.clientes[r.cid] && (r.lineas.length || r.pagos))
    .map(r => { r.lineas.sort((a, b) => a.f - b.f); return { ...r, nombre: nombreCliente(r.cid), total: r.anterior + r.delDia, queda: r.anterior + r.delDia + r.pagos }; })
    .sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));
}

/* ---------- personal y sueldos ---------- */
export const tipoDe = (m: Persona | undefined): TipoPersonal => m?.tipo || "mensajero";
export const esRepartidor = (m: Persona | undefined) => ["mensajero", "dueno", "oficina"].includes(tipoDe(m));
export const ganaPorcentaje = (m: Persona | undefined) => tipoDe(m) === "mensajero";
export const sueldoDe = (domicilios: number) => domicilios * PCT_SUELDO - DESC_SUELDO;
export const diaSueldo = (p: Pedido) => { const s = diaDe(p.creado || p.entregado || 0); return s >= SUELDO_POR_SALIDA ? s : diaDe(p.entregado || 0); };
export const sueldoPedidos = (ps: Pedido[]) => { const g: Record<string, number> = {}; ps.forEach(p => { const d = diaSueldo(p); g[d] = (g[d] || 0) + servicio(p); }); return Object.values(g).reduce((a, x) => a + sueldoDe(x), 0); };
export const sueldoTexto = (mid: string, ps: Pedido[]) => tipoDe(S.mensajeros[mid]) === "dueno" ? "Ver “Mi sueldo”" : tipoDe(S.mensajeros[mid]) === "oficina" ? "Pago por día" : pesos(sueldoPedidos(ps));
export const vinculosDe = (mid: string) => Object.values(S.vinculos).filter(v => v.mensajeroId === mid);

export function semanaDe(dia: string) { const d = mediodia(dia); d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 1) % 7)); return diaDe(d.getTime()); }
export function diasSemana(sem: string) { return [...Array(7)].map((_, i) => { const d = mediodia(sem); d.setUTCDate(d.getUTCDate() + i); return diaDe(d.getTime()); }); }
export function moverSemana(sem: string, n: number) { const d = mediodia(sem); d.setUTCDate(d.getUTCDate() + 7 * n); return diaDe(d.getTime()); }
export const jornada = (pid: string, dia: string) => Number(S.jornadas[pid + "_" + dia]?.valor) || 0;
export const previoId = (pid: string, sem: string) => pid + "_previo_" + sem;
export const sueldoPrevio = (pid: string, sem: string) => Number(S.jornadas[previoId(pid, sem)]?.valor) || 0;
export function sueldosDia(dia: string) {
  const ent = Object.values(S.pedidos).filter(p => cerrado(p) && diaSueldo(p) === dia);
  const res: Record<string, number> = {}, porM: Record<string, Pedido[]> = {};
  ent.forEach(p => (porM[p.mensajeroId] = porM[p.mensajeroId] || []).push(p));
  let dom30 = 0, propios = 0, desc = 0, fijos = 0, nMens = 0;
  for (const [mid, ps] of Object.entries(porM)) {
    const dom = ps.reduce((a, p) => a + servicio(p), 0);
    if (["dueno", "oficina"].includes(tipoDe(S.mensajeros[mid]))) propios += dom;
    else { res[mid] = sueldoDe(dom); dom30 += dom * (1 - PCT_SUELDO); desc += DESC_SUELDO; nMens++; }
  }
  for (const m of Object.values(S.mensajeros)) if (PAGO_FIJO.includes(tipoDe(m))) { const x = jornada(m.id, dia); if (x) { res[m.id] = x; fijos += x; } }
  const ganancias = Object.values(S.movimientos).filter(m => m.tipo === "ganancia" && diaDe(m.fecha) === dia).reduce((a, m) => a + (Number(m.valor) || 0), 0);
  const javier = dom30 + propios + desc + ganancias - fijos;
  const dueno = Object.values(S.mensajeros).find(m => tipoDe(m) === "dueno");
  if (dueno && (ent.length || fijos || ganancias)) res[dueno.id] = javier;
  return { res, dom30, propios, desc, ganancias, fijos, nMens, javier };
}
export const valorAdel = (c: CajaMov) => Math.max(0, (Number(c.valor) || 0) - (Number(c.devuelto) || 0));
const esDeSemana = (c: CajaMov, sem: string, dias: string[]) => (c.semana ? c.semana === sem : dias.includes(diaDe(c.fecha)));
export function resumenSemana(sem: string) {
  const dias = diasSemana(sem), porDia = dias.map(sueldosDia);
  const personas = listaOrdenada(S.mensajeros, "nombre").sort((a, b) => ORDEN_TIPO.indexOf(tipoDe(a)) - ORDEN_TIPO.indexOf(tipoDe(b)));
  const filas = personas.map(m => {
    const vals = porDia.map(x => x.res[m.id] || 0), previo = sueldoPrevio(m.id, sem), total = vals.reduce((a, x) => a + x, 0) + previo;
    const movs = Object.values(S.cajamovs).filter(c => c.personaId === m.id);
    const adelantos = movs.filter(c => c.cat === "adelanto" && esDeSemana(c, sem, dias));
    const adel = adelantos.reduce((a, c) => a + valorAdel(c), 0);
    const pagado = movs.filter(c => c.cat === "sueldo" && c.semana === sem).reduce((a, c) => a + (Number(c.valor) || 0), 0);
    return { m, vals, previo, total, adel, adelantos, pagado, neto: total - adel - pagado };
  });
  return { sem, dias, porDia, filas };
}
export function sueldoPersonaSemana(mid: string, sem: string) {
  const dias = diasSemana(sem), porDia = dias.map(sueldosDia), vals = porDia.map(x => x.res[mid] || 0), previo = sueldoPrevio(mid, sem), total = vals.reduce((a, x) => a + x, 0) + previo;
  const movs = Object.values(S.cajamovs).filter(c => c.personaId === mid);
  const adelantos = movs.filter(c => c.cat === "adelanto" && esDeSemana(c, sem, dias));
  const pagos = movs.filter(c => c.cat === "sueldo" && c.semana === sem);
  const adel = adelantos.reduce((a, c) => a + valorAdel(c), 0), pagado = pagos.reduce((a, c) => a + (Number(c.valor) || 0), 0);
  return { sem, dias, vals, previo, total, adelantos, pagos, adel, pagado, neto: total - adel - pagado };
}
export function pendienteAnterior(mid: string, sem: string) {
  const out = []; for (let i = 1; i <= 12; i++) { const w = moverSemana(sem, -i), r = sueldoPersonaSemana(mid, w); if (Math.round(r.neto) > 0) out.push(r); } return out;
}

/* ---------- liquidaciones y período del mensajero ---------- */
export function liquidacionesDe(mid: string) { return Object.values(S.liquidaciones).filter(l => l.mensajeroId === mid).sort((a, b) => b.fecha - a.fecha); }
export const guiasLiquidadas = (mid: string) => new Set(liquidacionesDe(mid).flatMap(l => l.guias || []));
export const pedidoLiquidado = (p: Pedido) => cerrado(p) && guiasLiquidadas(p.mensajeroId).has(p.guia);
export function periodoMensajero(mid: string) {
  const liqs = liquidacionesDe(mid), ul = liqs[0] || null, desde = ul ? ul.fecha : 0, anterior = ul ? (Number(ul.debe) || 0) : 0;
  const enLiq = new Set(liqs.flatMap(l => l.guias || [])), sinGuias = Math.max(0, ...liqs.filter(l => !Array.isArray(l.guias)).map(l => l.fecha));
  const ps = Object.values(S.pedidos).filter(p => cerrado(p) && p.mensajeroId === mid && !enLiq.has(p.guia) && (p.entregado || 0) > sinGuias).sort((a, b) => (a.entregado || 0) - (b.entregado || 0));
  const todosRecs = Object.values(S.recaudos).filter(r => r.mensajeroId === mid), todasBases = Object.values(S.cajamovs).filter(c => c.cat === "base" && c.personaId === mid);
  const todosCobros = Object.values(S.movimientos).filter(m => esCobroMensajero(m, mid)).map(m => ({ ...m, valor: signoMov(m) }));
  const recs = todosRecs.filter(r => r.fecha > desde).sort((a, b) => a.fecha - b.fecha);
  const cobrosCli = todosCobros.filter(m => m.fecha > desde).sort((a, b) => a.fecha - b.fecha);
  const bases = todasBases.filter(c => c.fecha > desde).sort((a, b) => a.fecha - b.fecha);
  const enVentana = (xs: { fecha: number; valor: number }[], l: Liquidacion) => xs.filter(x => x.fecha > (Number(l.desde) || 0) && x.fecha <= l.fecha).reduce((a, x) => a + (Number(x.valor) || 0), 0);
  let ajuste = 0;
  for (const l of liqs) {
    if (!Array.isArray(l.guias)) continue;
    const lp = l.guias.map(g => S.pedidos[g]).filter(p => p && cerrado(p));
    ajuste += (totales(lp).efectivo - (Number(l.efectivo) || 0)) - (lp.reduce((a, p) => a + gastoDe(p), 0) - (Number(l.gastos) || 0))
      + (enVentana(todasBases, l) - (Number(l.base) || 0)) - (enVentana(todosRecs, l) - (Number(l.recibido) || 0)) - (Number(l.ajuste) || 0)
      + (enVentana(todosCobros, l) - (Number(l.cobros) || 0));
  }
  ajuste = Math.round(ajuste);
  const efectivo = totales(ps).efectivo, recibido = recs.reduce((a, r) => a + (Number(r.valor) || 0), 0), base = bases.reduce((a, c) => a + (Number(c.valor) || 0), 0), gastos = ps.reduce((a, p) => a + gastoDe(p), 0);
  const cobros = cobrosCli.reduce((a, m) => a + m.valor, 0);
  return { ul, desde, anterior, ajuste, ps, recs, bases, base, gastos, efectivo, recibido, cobros, cobrosCli, debe: anterior + ajuste + efectivo + base + cobros - gastos - recibido };
}
export const yaLiquidado = (mid: string, fecha: number) => { const ul = liquidacionesDe(mid)[0]; return !!ul && fecha <= ul.fecha; };
export const recibidoDia = (mid: string, dia: string) => Object.values(S.recaudos).filter(r => r.mensajeroId === mid && diaDe(r.fecha) === dia).reduce((a, r) => a + (Number(r.valor) || 0), 0);
const corta = (d: string) => new Date(d + "T12:00:00-05:00").toLocaleDateString("es-CO", { day: "numeric", month: "short", timeZone: "America/Bogota" });
const textoSemana = (w: string) => { const d = diasSemana(w); return corta(d[0]) + " al " + corta(d[6]); };
/** Semanas a las que se carga un adelanto: la actual y la anterior (el sábado se paga la semana que terminó el viernes). */
export function semanasAdelanto(): [string, string][] {
  const act = semanaDe(hoy()), ant = moverSemana(act, -1), sab = mediodia(hoy()).getUTCDay() === 6;
  const l: [string, string][] = [[ant, "Semana del " + textoSemana(ant) + (sab ? " (la que se paga hoy)" : "")], [act, "Semana del " + textoSemana(act) + (sab ? "" : " (esta semana)")]];
  return sab ? l : l.reverse();
}
/** Semanas para elegir en un pago de sueldo o adelanto: las de semanasAdelanto, hasta 6 atrás, y la que venga de Sueldos. */
export function semanasSueldo(pre?: string): [string, string][] {
  const l = semanasAdelanto(), ya = new Set(l.map(([w]) => w)), txt = (w: string) => "Semana del " + textoSemana(w);
  for (let i = 2; i <= 6; i++) { const w = moverSemana(semanaDe(hoy()), -i); if (!ya.has(w)) { l.push([w, txt(w)]); ya.add(w); } }
  if (pre && !ya.has(pre)) l.unshift([pre, txt(pre)]);
  return l;
}
export const ajusteTxt = (x: number) => (x > 0 ? "+ " : "− ") + pesos(Math.abs(x));
export const textoLiq = (d: number) => (d > 0 ? "Debe " + pesos(d) : d < 0 ? "Sobró " + pesos(-d) : "Quedó en $ 0");

/* ---------- caja ---------- */
export const asistentes = () => Object.values(S.usuarios).filter(u => u.rol === "asistente").sort((a, b) => String(a.nombre).localeCompare(String(b.nombre), "es"));
const antesTxt = (x: { medio: string; medioAntes?: string }) => (x.medioAntes && x.medioAntes !== x.medio ? ` (antes ${MEDIOS[x.medioAntes as Medio] || x.medioAntes})` : "");
export interface LineaOficina { fecha: number; concepto: string; valor: number; medio: Medio; ref?: string }
export function cajaOficina(auid: string) {
  const L: LineaOficina[] = [], nomM = (id: string) => S.mensajeros[id]?.nombre || "";
  const add = (fecha: number, concepto: string, valor: number, medio: string, ref?: string) => L.push({ fecha, concepto, valor, medio: (MEDIOS[medio as Medio] ? medio : "efectivo") as Medio, ref });
  for (const c of Object.values(S.cajamovs)) {
    if (c.cat === "oficina" && c.personaUid === auid) add(c.fecha, (c.nivel ? "Ajuste al cierre (cuenta de la empresa)" : c.tipo === "base" ? "Base de caja que entregó administración" : "Entregado a administración (cierre)") + (c.concepto ? " · " + c.concepto : ""), (c.tipo === "base" ? 1 : -1) * (Number(c.valor) || 0), c.medio, c.id);
    else if (c.cat === "sobrante" && c.personaUid === auid) add(c.fecha, "Sobrante registrado al cierre" + (c.concepto ? " · " + c.concepto : ""), Number(c.valor) || 0, c.medio, c.id);
    else if (c.cat === "base" && c.porUid === auid) add(c.fecha, "Base para vueltos a " + nomM(c.personaId), -(Number(c.valor) || 0), c.medio);
    else if (c.cat === "interna" && !c.inicial && c.porUid === auid) add(c.fecha, (c.tipo === "entra" ? "Entrada de " : "Salida a ") + (S.cuentas[c.cuentaId || ""]?.nombre || "cuenta interna"), (c.tipo === "entra" ? 1 : -1) * (Number(c.valor) || 0), c.medio);
  }
  for (const r of Object.values(S.recaudos)) if (r.porUid === auid) add(r.fecha, "Entrega de " + nomM(r.mensajeroId) + antesTxt(r), Number(r.valor) || 0, r.medio);
  for (const m of Object.values(S.movimientos)) if (m.porUid === auid && !m.mensajeroId && ["pago_de_cliente", "pago_a_cliente", "compra_cliente"].includes(m.tipo))
    add(m.fecha, (m.tipo === "pago_de_cliente" ? "Pago de " : m.tipo === "pago_a_cliente" ? "Pago a " : "Compra para ") + nombreCliente(m.clienteId) + antesTxt(m), (m.tipo === "pago_de_cliente" ? 1 : -1) * (Number(m.valor) || 0), m.medio);
  for (const p of Object.values(S.pedidos)) if (p.domiPagado && p.domiPagoUid === auid && p.domiPagoMedio) add(p.domiPagoFecha, "Pago de domicilio · " + p.guia, pagoDomi(p), p.domiPagoMedio);
  L.sort((a, b) => a.fecha - b.fecha);
  const saldo: Record<Medio, number> = { efectivo: 0, nequi: 0, bancolombia: 0 }; L.forEach(x => (saldo[x.medio] += x.valor));
  return { L, saldo, total: L.reduce((a, x) => a + x.valor, 0) };
}
export const sumaMedios = (L: LineaOficina[]) => { const o: Record<Medio, number> = { efectivo: 0, nequi: 0, bancolombia: 0 }; L.forEach(x => (o[x.medio] += x.valor)); return o; };
export function corteCaja(sin?: string[]) { let c = yo.corteRemoto; for (const x of Object.values(S.cajamovs)) if ((x.cat === "arqueo" || x.cat === "inicial") && !(sin && sin.includes(x.id))) c = Math.max(c, Number(x.fecha) || 0); return c; }
export const yaContado = (f: number | undefined) => { const c = corteCaja(); return !!c && Number(f) <= c; };
export const diaMinCaja = () => (corteCaja() ? diaDe(corteCaja()) : "");
export const fechaCaja = (dia: string) => Math.max(fechaDia(dia), corteCaja() + 1);
export const puedoCambiarMedio = (x: { porUid?: string; fecha: number }) => yo.esAsistente && !!yo.uid && x.porUid === yo.uid && Date.now() - x.fecha < 86400000 && !yaContado(x.fecha);
export const lineasCajaPedido = (p: Pedido): [number, string, number][] => [
  ...(cerrado(p) && p.metodo === "transf_js" ? [[p.entregado || 0, p.cuentaJs || "cuentas", Number(p.valorCobrado) || 0] as [number, string, number]] : []),
  ...(p.domiPagado && p.domiPagoMedio ? [[p.domiPagoFecha || p.entregado || p.creado, p.domiPagoMedio, pagoDomi(p)] as [number, string, number]] : []),
];
export function cambiaLoContado(antes: Pedido | null, despues: Pedido | null) {
  const c = corteCaja(); if (!c) return false;
  const k = (p: Pedido | null) => (p ? lineasCajaPedido(p).filter(l => l[0] <= c).map(l => l.join("|")).sort().join(";") : "");
  return k(antes) !== k(despues);
}
export interface Arqueo { id: string; fecha: number; dif: Record<string, number>; docs: string[]; esperado?: Record<string, number>; contado?: Record<string, number>; nota?: string; por?: string }
export function arqueosCaja(): Arqueo[] {
  const g: Record<string, Arqueo> = {};
  for (const c of Object.values(S.cajamovs)) if (c.cat === "arqueo") {
    const k = c.arqueoId || c.id, a = (g[k] = g[k] || { id: k, fecha: c.fecha, dif: {}, docs: [] }); a.docs.push(c.id);
    if (c.tipo === "marca") Object.assign(a, { esperado: c.esperado || {}, contado: c.contado || {}, nota: c.concepto || "", por: c.porNombre || "" });
    else a.dif[c.medio] = (a.dif[c.medio] || 0) + (c.tipo === "entra" ? 1 : -1) * (Number(c.valor) || 0);
  }
  return Object.values(g).sort((a, b) => b.fecha - a.fecha);
}
export const netoArqueo = (a: Arqueo) => Math.round(Object.values(a.dif).reduce((x, y) => x + y, 0));
export function resultadoArqueo(a: Arqueo) {
  const f = Object.entries(a.dif).filter(([, x]) => Math.round(x)); if (!f.length) return "Cuadró exacto";
  const n = netoArqueo(a), det = f.map(([m, x]) => `${MEDIOS[m as Medio] || m} ${x < 0 ? "−" : "+"}${pesos(Math.abs(x))}`).join(", ");
  return n === 0 ? `La plata da exacto · se reacomodó entre medios (${det})` : `${n < 0 ? "Faltó" : "Sobró"} ${pesos(Math.abs(n))} en total (${det})`;
}
/** Lo que la app espera en el arqueo: la caja general menos el efectivo de las cajas de oficina (Nequi y Bancolombia son las mismas cuentas de la empresa). */
export function esperadoArqueo() {
  const R = resumenCaja(), of: Record<Medio, number> = { efectivo: 0, nequi: 0, bancolombia: 0 };
  if (yo.esAdmin) asistentes().forEach(u => { of.efectivo += cajaOficina(u.uid).saldo.efectivo; });
  const e: Record<string, number> = {}; for (const k of Object.keys(MEDIOS) as Medio[]) e[k] = Math.round((R.porMedio[k] || 0) - of[k]);
  return { e, of, sinCuenta: Math.round(R.porMedio.cuentas || 0) };
}
export interface LineaCaja { fecha: number; concepto: string; valor: number; medio: string; cat: string; ref?: string }
export function libroCaja(): LineaCaja[] {
  const L: LineaCaja[] = [], nomM = (id: string) => S.mensajeros[id]?.nombre || "";
  for (const r of Object.values(S.recaudos)) L.push({ fecha: r.fecha, concepto: "Entrega de " + nomM(r.mensajeroId) + (r.nota ? " · " + r.nota : ""), valor: Number(r.valor) || 0, medio: r.medio || "efectivo", cat: "Mensajeros", ref: "recaudos|" + r.id });
  for (const p of Object.values(S.pedidos)) if (cerrado(p) && p.metodo === "transf_js") L.push({ fecha: p.entregado || 0, concepto: "Transferencia a JS · " + p.guia + (p.destinatario ? " · " + p.destinatario : ""), valor: Number(p.valorCobrado) || 0, medio: p.cuentaJs || "cuentas", cat: "Transferencias" });
  for (const p of Object.values(S.pedidos)) if (p.domiPagado && p.domiPagoMedio) L.push({ fecha: p.domiPagoFecha || p.entregado || p.creado, concepto: "Pago de domicilio · " + p.guia + (p.clienteId ? " · " + nombreCliente(p.clienteId) : ""), valor: pagoDomi(p), medio: p.domiPagoMedio, cat: "Clientes" });
  for (const m of Object.values(S.movimientos)) if (mueveCaja(m)) L.push({ fecha: m.fecha, concepto: (m.tipo === "pago_de_cliente" ? "Pago de " : m.tipo === "compra_cliente" ? "Compra por encargo de " : "Pago a ") + nombreCliente(m.clienteId) + (m.nota ? " · " + m.nota : ""), valor: signoMov(m), medio: m.medio || "efectivo", cat: "Clientes" });
  const reacomodos = new Set(arqueosCaja().filter(a => netoArqueo(a) === 0).map(a => a.id));
  for (const c of Object.values(S.cajamovs)) {
    if ((c.cat === "interna" && c.inicial) || c.cat === "oficina" || c.deLiquidacion || (c.cat === "arqueo" && c.tipo === "marca")) continue;
    else if (c.cat === "arqueo") L.push({ fecha: c.fecha, concepto: (reacomodos.has(c.arqueoId || "") ? (c.tipo === "entra" ? "Arqueo: pasa a este medio" : "Arqueo: sale de este medio") : (c.tipo === "entra" ? "Sobrante" : "Faltante") + " de arqueo") + (c.concepto ? " · " + c.concepto : ""), valor: (c.tipo === "entra" ? 1 : -1) * (Number(c.valor) || 0), medio: c.medio || "efectivo", cat: "Arqueo", ref: "cajamovs|" + c.id });
    else if (c.cat === "interna") { const n = S.cuentas[c.cuentaId || ""]?.nombre || "Cuenta interna"; L.push({ fecha: c.fecha, concepto: (c.tipo === "entra" ? "Entrada de " : "Salida a ") + n + (c.concepto ? " · " + c.concepto : ""), valor: (c.tipo === "entra" ? 1 : -1) * (Number(c.valor) || 0), medio: c.medio || "efectivo", cat: n, ref: "cajamovs|" + c.id }); }
    else L.push({ fecha: c.fecha, concepto: (CATS[c.cat] || "Movimiento") + (c.personaId ? " · " + nomM(c.personaId) : "") + (c.concepto ? " · " + c.concepto : ""), valor: (c.tipo === "entra" ? 1 : -1) * (Number(c.valor) || 0), medio: c.medio || "efectivo", cat: CATS[c.cat] || "Otro", ref: "cajamovs|" + c.id });
  }
  return L.sort((a, b) => a.fecha - b.fecha);
}
export function resumenCaja() {
  const L = libroCaja(), total = L.reduce((a, x) => a + x.valor, 0);
  const porMedio: Record<string, number> = {}; L.forEach(x => (porMedio[x.medio] = (porMedio[x.medio] || 0) + x.valor));
  let porPagar = 0, porCobrar = 0; Object.keys(S.clientes).forEach(id => { const s = saldoCliente(id); if (s > 0) porPagar += s; else porCobrar -= s; });
  const sem = resumenSemana(semanaDe(hoy())); const sueldosPend = sem.filas.reduce((a, f) => a + Math.max(0, f.neto), 0);
  const enMens = Object.values(S.mensajeros).filter(esRepartidor).reduce((a, m) => a + Math.max(0, periodoMensajero(m.id).debe), 0);
  const sobs = Object.values(S.cajamovs).filter(c => c.cat === "sobrante"), mes = hoy().slice(0, 7);
  const sobrantes = { n: sobs.length, total: sobs.reduce((a, c) => a + (Number(c.valor) || 0), 0), mes: sobs.filter(c => diaDe(c.fecha).startsWith(mes)).reduce((a, c) => a + (Number(c.valor) || 0), 0) };
  return { L, total, porMedio, porPagar, porCobrar, sueldosPend, enMens, sobrantes, disponible: total - porPagar - sueldosPend };
}
export function pendientesCierre() {
  const mens = Object.values(S.mensajeros).filter(esRepartidor).map(m => ({ m, debe: Math.round(periodoMensajero(m.id).debe) })).filter(x => x.debe > 0).sort((a, b) => b.debe - a.debe);
  const ofis = asistentes().map(u => ({ u, s: cajaOficina(u.uid).saldo })).filter(x => Object.values(x.s).some(v => Math.round(v))), ofisEf = ofis.filter(x => Math.round(x.s.efectivo));
  const P = Object.values(S.pedidos), sinRem = P.filter(p => !p.clienteId), sinServ = P.filter(sinServicio), enRuta = P.filter(p => p.estado === "pendiente");
  const a = arqueosCaja()[0];
  return { mens, ofis, ofisEf, sinRem, sinServ, enRuta, arqueoHoy: !!a && diaDe(a.fecha) === hoy(), a };
}

/* ---------- cuentas internas ---------- */
export const movsCuenta = (id: string) => Object.values(S.cajamovs).filter(c => c.cat === "interna" && c.cuentaId === id).sort((a, b) => b.fecha - a.fecha);
export function saldoCuenta(id: string) { return movsCuenta(id).reduce((a, c) => a + (c.tipo === "sale" ? 1 : -1) * (Number(c.valor) || 0), 0); }
export function textoCuenta(cu: Cuenta) {
  const s = saldoCuenta(cu.id);
  if (cu.tipo === "base") return { txt: "Base actual", val: pesos(-s), cls: "" };
  return s > 0 ? { txt: "Te debe", val: pesos(s), cls: "neg" } : s < 0 ? { txt: "Tiene a favor", val: pesos(-s), cls: "pos" } : { txt: "En cero", val: pesos(0), cls: "" };
}

/* ---------- panel del mensajero ---------- */
export const CONSEJOS_MOTIVO: Record<string, [string, string]> = {
  no_contesta: ["Llama antes de llegar", "Llama o escribe por WhatsApp al destinatario antes de salir hacia la dirección y otra vez cuando estés a 5 minutos. Si no contesta, avísale a la oficina antes de irte: muchas veces el remitente consigue otro número."],
  direccion: ["Confirma la dirección antes de salir", "Pide la ubicación por WhatsApp y un punto de referencia (color de la casa, tienda cercana). Si la dirección está incompleta en la guía, pregúntale a la oficina antes de salir."],
  rechazo: ["Confirma el pedido antes de llegar", "Al llamar, confirma que el destinatario sí espera el paquete y el valor a cobrar. Si dice que no lo pidió, avisa a la oficina para que hable con el remitente antes de que hagas el viaje."],
  reprogramar: ["Acuerda la hora de entrega", "Cuando llames, pregunta a qué hora va a estar y organiza la ruta con esas horas. Así evitas volver dos veces a la misma dirección."],
  otro: ["Escribe bien el motivo", "Cuando no puedas entregar, explica qué pasó en la nota. Con eso la oficina puede resolverlo con el remitente."],
};
export function nivelEfectividad(e: number, n: number): [string, string] {
  if (n < 10) return ["Pocos pedidos todavía", "gris"]; if (e >= 95) return ["Excelente", "ent"]; if (e >= 90) return ["Muy bien", "ruta"]; if (e >= 80) return ["Puede mejorar", "pend"]; return ["Hay que mejorar", "sin"];
}

/* ---------- textos para WhatsApp ---------- */
export function textoSaldo(cid: string) {
  const c = S.clientes[cid], s = saldoCliente(cid); if (!c) return "";
  const asc = filasCuenta(cid).slice().reverse(); let acum = 0, desde = 0;
  asc.forEach((r, i) => { acum += r.v; if (Math.round(acum) === 0) desde = i + 1; });
  const abiertas = asc.slice(desde), MAX = 25;
  const L = [`*${EMPRESA.nombre}*`, `Hola ${c.nombre} 👋`, ""];
  if (s < 0) L.push(`Según nuestro registro tienes un saldo *pendiente por pagar de ${pesos(-s)}*.`);
  else if (s > 0) L.push(`Según nuestro registro tienes un saldo *a tu favor de ${pesos(s)}* que JS Logistics te debe entregar.`);
  else L.push("Tu cuenta está a paz y salvo. ¡Gracias!");
  if (s && abiertas.length) {
    L.push("", "*Detalle:*");
    abiertas.slice(-MAX).forEach(r => L.push(`• ${new Date(r.fecha).toLocaleDateString("es-CO", { day: "2-digit", month: "short", timeZone: ZONA })} · ${r.det} → ${r.v < 0 ? "− " : "+ "}${pesos(Math.abs(r.v))}`));
    if (abiertas.length > MAX) L.push(`(y ${abiertas.length - MAX} movimientos anteriores)`);
    L.push("", s < 0 ? `*Total a pagar: ${pesos(-s)}*` : `*Total a tu favor: ${pesos(s)}*`);
  }
  if (s < 0) L.push("", ...PAGOS_TEXTO);
  L.push("", s < 0 ? "Quedamos atentos a tu pago. Si ya lo hiciste, por favor envíanos el comprobante." : s > 0 ? "Cuéntanos cómo prefieres recibirlo." : "", "", EMPRESA.lema, EMPRESA.tel);
  return L.filter((x, i, a) => !(x === "" && a[i - 1] === "")).join("\n");
}
export const linkWhatsApp = (tel: string, txt: string) => `https://wa.me/${telWhatsApp(tel)}?text=${encodeURIComponent(txt)}`;
export const linkSaldo = (cid: string) => linkWhatsApp(S.clientes[cid]?.telefono || "", textoSaldo(cid));
