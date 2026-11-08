/*
 * Lo que la app interna escribe en el servidor. Cada acción llama a la API y deja el almacén al día con la respuesta
 * (o vuelve a cargar). En modo demo, los cambios se hacen solo en memoria.
 */
import * as api from "../api/servicios";
import type * as T from "../api/tipos";
import { S, yo, type Pedido, type Medio, type Motivo, type Metodo, type TipoMov, type TipoPersonal, type Almacen, type CajaMov, type Liquidacion, hora } from "./motor";
import { aPedido } from "./datos";
import { DEMO } from "./demo";
import { comprimir, firmaABlob, FOTO, MINI } from "../lib/imagen";

type Tocar = (fn?: (s: Almacen) => void) => void;
let tocar: Tocar = () => {};
let recargar: () => Promise<void> = async () => {};
/** datos.tsx conecta aquí cómo volver a pintar y cómo recargar. */
export const conectar = (t: Tocar, r: () => Promise<void>) => { tocar = t; recargar = r; };

const iso = (ms: number) => new Date(ms).toISOString();
const id = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const ponerPedido = (p: T.Pedido) => tocar(s => { s.pedidos[p.guia] = aPedido(p); });
/** En demo, cambia el pedido en memoria. */
const demoPedido = (guia: string, d: Partial<Pedido>) => tocar(s => { s.pedidos[guia] = { ...s.pedidos[guia], ...d }; });
const tras = async (x: Promise<unknown>) => { await x; await recargar(); };

/* ---------- pedidos ---------- */
/** Una guía por foto. Devuelve las guías creadas. */
export async function crearGuias(files: File[], mensajeroId: string, avance: (msg: string) => void) {
  const hechas: string[] = [];
  for (const f of files) {
    if (files.length > 1) avance("Creando guía " + (hechas.length + 1) + " de " + files.length + "…");
    if (DEMO) {
      const n = Math.max(0, ...Object.values(S.pedidos).map(p => p.n)) + 1, guia = "JS-" + String(n).padStart(5, "0");
      const mini = URL.createObjectURL(await comprimir(f, MINI));
      tocar(s => { s.pedidos[guia] = { guia, n, estado: "pendiente", creado: Date.now(), entregado: null, mensajeroId, clienteId: "", clienteNombre: "", valorServicio: 0, aCobrar: 0,
        destinatario: "", valorCobrado: 0, metodo: "", cuentaJs: "", difCobro: 0, difRevisada: false, motivoDev: "", notaDev: "", cobrarDev: false, cambio: false, cambioRecibido: null,
        gasto: 0, gastoNota: "", domiPagado: false, domiPagoMedio: "", domiPagoValor: null, domiPagoFecha: 0, domiPagoUid: "", intentos: [], mini }; });
      hechas.push(guia); continue;
    }
    const [foto, mini] = await Promise.all([comprimir(f, FOTO), comprimir(f, MINI)]);
    const p = await api.pedidos.crear(yo.esAdmin || yo.esAsistente ? { mensajeroId } : {});
    hechas.push(p.guia);
    await api.pedidos.subirArchivo(p.guia, "salida", foto);
    await api.pedidos.subirArchivo(p.guia, "mini", mini).catch(() => {});
  }
  if (!DEMO) await recargar();
  return hechas;
}

export interface Entrega { destinatario: string; valorCobrado: number; metodo: Metodo; cuentaJs: "" | "nequi" | "bancolombia"; cambio: boolean; gasto: number; gastoNota: string }
export async function entregar(guia: string, d: Entrega, foto: Blob | null, firma: HTMLCanvasElement | null) {
  if (DEMO) { const p = S.pedidos[guia]; return demoPedido(guia, { ...d, estado: "entregado", entregado: Date.now(), difCobro: p.aCobrar ? d.valorCobrado - (d.metodo === "transf_cliente" ? 0 : p.aCobrar) : 0 }); }
  if (foto) await api.pedidos.subirArchivo(guia, "entrega", foto);
  if (firma) await api.pedidos.subirArchivo(guia, "firma", await firmaABlob(firma));
  ponerPedido(await api.pedidos.entregar(guia, { ...d, cuentaJs: d.cuentaJs || undefined }));
}
export async function noEntregado(guia: string, motivo: Motivo, nota: string, foto: Blob | null) {
  if (DEMO) {
    const p = S.pedidos[guia], intentos = [...p.intentos, { fecha: Date.now(), motivo, nota }];
    return demoPedido(guia, motivo === "reprogramar" ? { intentos } : { estado: "devuelto", entregado: Date.now(), motivoDev: motivo, notaDev: nota, valorCobrado: 0, metodo: "devuelto", cobrarDev: true, intentos });
  }
  if (foto && motivo !== "reprogramar") await api.pedidos.subirArchivo(guia, "entrega", foto);
  ponerPedido(await api.pedidos.noEntregado(guia, { motivo, nota }));
}
export async function actualizarPedido(guia: string, d: Omit<api.CambiosPedido, "domiPagoMedio"> & { domiPagoMedio?: Medio | "" }) {
  if (DEMO) return demoPedido(guia, { ...d, clienteId: d.clienteId ?? S.pedidos[guia].clienteId, clienteNombre: d.clienteId ? S.clientes[d.clienteId]?.nombre || "" : S.pedidos[guia].clienteNombre,
    domiPagoMedio: (d.domiPagoMedio ?? S.pedidos[guia].domiPagoMedio) as Medio | "", ...(d.domiPagado && !S.pedidos[guia].domiPagado ? { domiPagoFecha: Date.now(), domiPagoUid: yo.uid } : {}) } as Partial<Pedido>);
  const { domiPagoMedio, ...resto } = d;
  ponerPedido(await api.pedidos.actualizar(guia, { ...resto, ...(domiPagoMedio ? { domiPagoMedio } : {}) }));
}
export async function cambioEntregado(guia: string) {
  if (DEMO) return demoPedido(guia, { cambioRecibido: Date.now() });
  ponerPedido(await api.pedidos.cambioRecibido(guia));
}
export async function reabrir(guia: string) {
  if (DEMO) return demoPedido(guia, { estado: "pendiente", entregado: null, destinatario: "", valorCobrado: 0, metodo: "", cuentaJs: "", difCobro: 0, difRevisada: false, motivoDev: "", notaDev: "", cobrarDev: false });
  ponerPedido(await api.pedidos.reabrir(guia));
}
export async function eliminarPedido(guia: string) {
  if (!DEMO) await api.pedidos.eliminar(guia);
  tocar(s => { delete s.pedidos[guia]; });
}

/* ---------- clientes y sus movimientos ---------- */
export async function guardarCliente(cid: string | null, d: { nombre: string; telefono: string; tarifa: number; confirmarRepetido?: boolean }) {
  if (DEMO) { const k = cid || id(); tocar(s => { s.clientes[k] = { id: k, nombre: d.nombre, telefono: d.telefono, tarifa: d.tarifa }; }); return k; }
  const c = cid ? await api.clientes.actualizar(cid, { nombre: d.nombre, telefono: d.telefono, tarifa: d.tarifa }) : await api.clientes.crear(d);
  tocar(s => { s.clientes[c.id] = { id: c.id, nombre: c.nombre, telefono: c.telefono || "", tarifa: c.tarifa || 0 }; });
  return c.id;
}
export async function eliminarCliente(cid: string) {
  if (!DEMO) await api.clientes.eliminar(cid);
  tocar(s => { delete s.clientes[cid]; });
}
export async function unirClientes(k: string, otros: string[]) {
  if (DEMO) return tocar(s => {
    for (const p of Object.values(s.pedidos)) if (otros.includes(p.clienteId)) p.clienteId = k;
    for (const m of Object.values(s.movimientos)) if (otros.includes(m.clienteId)) m.clienteId = k;
    for (const u of Object.values(s.usuarios)) if (u.clienteId && otros.includes(u.clienteId)) u.clienteId = k;
    otros.forEach(o => delete s.clientes[o]);
  });
  await tras(api.clientes.unir(k, otros));
}
export interface DatosMov { clienteId: string; tipo: TipoMov; valor: number; medio: Medio | ""; nota: string; fecha: number }
export async function guardarMovimiento(mid: string | null, d: DatosMov) {
  if (DEMO) { const k = mid || id(); tocar(s => { s.movimientos[k] = { ...(s.movimientos[k] || { porUid: yo.uid, porNombre: yo.nombre }), id: k, ...d }; }); return; }
  const cuerpo = { ...d, medio: d.medio || null, fecha: iso(d.fecha) };
  await tras(mid ? api.movimientos.actualizar(mid, cuerpo) : api.movimientos.crear(cuerpo));
}
export async function borrarDe(col: "movimientos" | "recaudos" | "cajamovs" | "jornadas", k: string) {
  if (!DEMO) {
    const svc = col === "movimientos" ? api.movimientos : col === "recaudos" ? api.recaudos : col === "jornadas" ? api.jornadas : api.cajaMovimientos;
    await svc.eliminar(k);
  }
  tocar(s => { delete s[col][k]; });
}
/** El asistente puede cambiar el medio de un pago que registró hoy (antes del arqueo). */
export async function cambiarMedio(col: "movimientos" | "recaudos", k: string, medio: Medio) {
  if (DEMO) return tocar(s => { const x = s[col][k]; if (x) Object.assign(x, { medioAntes: x.medioAntes || x.medio, medio }); });
  await tras(col === "movimientos" ? api.movimientos.actualizar(k, { medio }) : api.recaudos.actualizar(k, { medio }));
}

/* ---------- caja ---------- */
export async function recibirDinero(d: { mensajeroId: string; valor: number; medio: Medio; nota: string; fecha?: number }, editar?: string) {
  if (DEMO) { const k = editar || id(); tocar(s => { s.recaudos[k] = { ...(s.recaudos[k] || { porUid: yo.uid, porNombre: yo.nombre, fecha: Date.now() }), id: k, ...d, ...(d.fecha ? { fecha: d.fecha } : {}) }; }); return; }
  const cuerpo = { ...d, fecha: d.fecha ? iso(d.fecha) : undefined };
  await tras(editar ? api.recaudos.actualizar(editar, cuerpo) : api.recaudos.crear(cuerpo));
}
export async function movCaja(d: Omit<CajaMov, "id">) {
  if (DEMO) { const k = id(); tocar(s => { s.cajamovs[k] = { porUid: yo.uid, porNombre: yo.nombre, ...d, id: k }; }); return; }
  await tras(api.cajaMovimientos.crear({ ...d, fecha: iso(d.fecha) } as Partial<T.CajaMovimiento>));
}
export async function editarCajaMov(k: string, d: Partial<CajaMov>) {
  if (DEMO) return tocar(s => { Object.assign(s.cajamovs[k], d); });
  await tras(api.cajaMovimientos.actualizar(k, { ...d, fecha: d.fecha ? iso(d.fecha) : undefined } as Partial<T.CajaMovimiento>));
}
export async function crearCuenta(nombre: string, tipo: "socio" | "base") {
  if (DEMO) { const k = id(); return tocar(s => { s.cuentas[k] = { id: k, nombre, tipo }; }); }
  await tras(api.cuentasInternas.crear({ nombre, tipo }));
}
/** Liquidar el período de un mensajero. Con la entrega final y el adelanto: el servidor registra el dinero recibido
 *  y el adelanto de sueldo (que no sale de la caja) junto con la liquidación. */
export interface DatosLiq extends Omit<Liquidacion, "id" | "fecha"> { medio: Medio; semanaAdelanto: string }
export async function liquidar(l: DatosLiq): Promise<string> {
  const { medio, semanaAdelanto, ...liq } = l;
  if (DEMO) {
    const t = Date.now(), k = id();
    tocar(s => {
      if (liq.entregaFinal) { const r = id(); s.recaudos[r] = { id: r, mensajeroId: liq.mensajeroId, valor: liq.entregaFinal, medio, nota: "Liquidación", fecha: t, porUid: yo.uid, porNombre: yo.nombre }; }
      s.liquidaciones[k] = { ...liq, id: k, fecha: t + 1 };
      if (liq.adelanto) { const a = id(); s.cajamovs[a] = { id: a, tipo: "sale", cat: "adelanto", personaId: liq.mensajeroId, valor: liq.adelanto, medio: "efectivo", concepto: "Lo que quedó debiendo en la liquidación del " + hora(t + 1), fecha: t + 1, semana: semanaAdelanto, deLiquidacion: k }; }
    });
    return k;
  }
  const r = await api.liquidaciones.crear({ ...liq, desde: liq.desde ? iso(liq.desde) : null, medio, semanaAdelanto } as Partial<T.Liquidacion>);
  await recargar(); return r.id;
}
/** Reabrir la última liquidación: se borra, sus entregas vuelven al período actual y se quita el adelanto que salió de ella. */
export async function reabrirLiquidacion(k: string) {
  if (!DEMO) await api.liquidaciones.eliminar(k);
  tocar(s => { for (const c of Object.values(s.cajamovs)) if (c.deLiquidacion === k) delete s.cajamovs[c.id]; delete s.liquidaciones[k]; });
  if (!DEMO) await recargar();
}
export async function arqueo(esperado: Record<string, number>, contado: Record<string, number>, nota: string) {
  if (DEMO) {
    const aid = id(), f = Date.now();
    return tocar(s => {
      s.cajamovs[aid] = { id: aid, tipo: "marca", cat: "arqueo", arqueoId: aid, valor: 0, medio: "", concepto: nota, fecha: f, personaId: "", esperado, contado, porNombre: yo.nombre };
      for (const m of Object.keys(contado)) { const dif = Math.round((contado[m] || 0) - (esperado[m] || 0)); if (dif) { const k = id(); s.cajamovs[k] = { id: k, tipo: dif > 0 ? "entra" : "sale", cat: "arqueo", arqueoId: aid, valor: Math.abs(dif), medio: m as Medio, concepto: nota, fecha: f, personaId: "" }; } }
    });
  }
  await tras(api.caja.arqueo({ esperado, contado, nota }));
}
export async function deshacerArqueo(aid: string) {
  if (DEMO) return tocar(s => { for (const c of Object.values(s.cajamovs)) if (c.arqueoId === aid || c.id === aid) delete s.cajamovs[c.id]; });
  await tras(api.caja.deshacerArqueo(aid));
}

/* ---------- sueldos ---------- */
export async function ponerJornada(personaId: string, dia: string, valor: number, previo = false) {
  const k = previo ? personaId + "_previo_" + dia : personaId + "_" + dia;
  if (DEMO) return tocar(s => { if (valor) s.jornadas[k] = { id: k, personaId, dia, valor }; else delete s.jornadas[k]; });
  await tras(valor ? api.jornadas.poner({ id: k, personaId, dia, valor, ...(previo ? { previo: true, nota: "Sueldo anterior" } : {}) } as T.Jornada) : api.jornadas.eliminar(k));
}
/** El adelanto se devolvió (todo o una parte): entra hoy a la caja y se deja de descontar del sueldo. */
export async function devolverAdelanto(aid: string, valor: number, medio: Medio) {
  const c = S.cajamovs[aid]; if (!c) return;
  const dev: Omit<CajaMov, "id"> = { tipo: "entra", cat: "devolucion", personaId: c.personaId, valor, medio, concepto: "Adelanto del " + hora(c.fecha), adelantoId: aid, fecha: Date.now(), semana: "" };
  if (DEMO) { const k = id(); return tocar(s => { s.cajamovs[k] = { ...dev, id: k }; s.cajamovs[aid].devuelto = (Number(c.devuelto) || 0) + valor; }); }
  await api.cajaMovimientos.crear({ ...dev, fecha: iso(dev.fecha) } as Partial<T.CajaMovimiento>);
  await tras(api.cajaMovimientos.actualizar(aid, { devuelto: (Number(c.devuelto) || 0) + valor } as Partial<T.CajaMovimiento>));
}
/** Adelanto registrado por error: se borra. Si salió de una liquidación, lo que quedó debiendo vuelve al mensajero. */
export async function quitarAdelanto(aid: string) {
  const c = S.cajamovs[aid]; if (!c) return; const liq = c.deLiquidacion ? S.liquidaciones[c.deLiquidacion] : null;
  if (DEMO) return tocar(s => { if (liq) Object.assign(s.liquidaciones[liq.id], { debe: (Number(liq.debe) || 0) + (Number(c.valor) || 0), adelanto: 0 }); delete s.cajamovs[aid]; });
  if (liq) await api.liquidaciones.actualizar(liq.id, { debe: (Number(liq.debe) || 0) + (Number(c.valor) || 0), adelanto: 0 });
  await tras(api.cajaMovimientos.eliminar(aid));
}

/* ---------- personal y accesos ---------- */
export async function guardarPersona(mid: string | null, d: { nombre?: string; telefono?: string; tipo?: TipoPersonal; tarifa?: number }) {
  if (DEMO) { const k = mid || id(); return tocar(s => { s.mensajeros[k] = { ...(s.mensajeros[k] || { id: k, nombre: "", telefono: "", tipo: "mensajero", tarifa: 0 }), ...d }; }); }
  await tras(mid ? api.mensajeros.actualizar(mid, d) : api.mensajeros.crear({ nombre: d.nombre || "", telefono: d.telefono || "", tipo: d.tipo || "mensajero", tarifa: d.tarifa || 0 }));
}
export async function quitarPersona(mid: string) {
  if (!DEMO) await api.mensajeros.eliminar(mid);
  tocar(s => { delete s.mensajeros[mid]; });
}
export async function crearAcceso(d: { email: string; clave: string; nombre: string; rol: T.Rol; mensajeroId: string; clienteId: string }) {
  if (DEMO) { const k = id(); return tocar(s => { s.usuarios[k] = { uid: k, email: d.email, nombre: d.nombre, rol: d.rol, clienteId: d.clienteId, mensajeroId: d.mensajeroId, activo: true }; if (d.mensajeroId) s.vinculos[k] = { uid: k, mensajeroId: d.mensajeroId }; }); }
  await tras(api.usuarios.crear({ ...d, mensajeroId: d.mensajeroId || null, clienteId: d.clienteId || null }));
}
export async function cambiarAcceso(uid: string, d: { rol?: T.Rol; mensajeroId?: string | null }) {
  if (DEMO) return tocar(s => { const u = s.usuarios[uid]; if (d.rol) u.rol = d.rol; if (d.mensajeroId !== undefined) { u.mensajeroId = d.mensajeroId || ""; if (d.mensajeroId) s.vinculos[uid] = { uid, mensajeroId: d.mensajeroId }; else delete s.vinculos[uid]; } });
  await tras(api.usuarios.actualizar(uid, d));
}
export async function cambiarClaveDe(uid: string, clave: string) { if (!DEMO) await api.usuarios.cambiarClave(uid, clave); }
export async function quitarAcceso(uid: string) {
  if (!DEMO) await api.usuarios.eliminar(uid);
  tocar(s => { delete s.usuarios[uid]; delete s.vinculos[uid]; });
}
