/*
 * Datos de la app interna. Carga del backend todo lo que la pantalla necesita, lo pasa a la forma del prototipo
 * (fechas en milisegundos, sin nulos) en el almacén `S` de motor.ts, y avisa a las pantallas para que se vuelvan a pintar.
 * Los módulos que el backend todavía no tiene (caja, sueldos, liquidaciones…) llegan vacíos hasta que existan.
 */
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import * as api from "../api/servicios";
import { FalloApi } from "../api/cliente";
import type * as T from "../api/tipos";
import { S, yo, type Almacen, type Pedido, type Cliente, type Persona, type Movimiento, type Recaudo, type Liquidacion, type Jornada, type CajaMov, type Cuenta, type UsuarioS } from "./motor";
import { DEMO, datosDemo } from "./demo";
import { conectar } from "./acciones";
import { E } from "./estado";
import { crearCacheConsultas } from "../lib/queryCache";

const ms = (x: string | null | undefined) => (x ? new Date(x).getTime() || 0 : 0);
const msONulo = (x: string | null | undefined) => (x ? new Date(x).getTime() || null : null);

export const aPedido = (p: T.Pedido): Pedido => ({
  guia: p.guia, n: p.n, estado: p.estado, creado: ms(p.creado), entregado: msONulo(p.entregado),
  mensajeroId: p.mensajeroId || "", clienteId: p.clienteId || "", clienteNombre: p.clienteNombre || "",
  valorServicio: p.valorServicio || 0, aCobrar: p.aCobrar || 0, destinatario: p.destinatario || "", valorCobrado: p.valorCobrado || 0,
  metodo: p.metodo || "", cuentaJs: p.cuentaJs || "", difCobro: p.difCobro || 0, difRevisada: !!p.difRevisada,
  motivoDev: p.motivoDev || "", notaDev: p.notaDev || "", cobrarDev: !!p.cobrarDev, destinoDev: p.destinoDev || "", reintentoDe: p.reintentoDe || "", reintentos: p.reintentos || [], reintentoPedido: msONulo(p.reintentoPedido), cambio: !!p.cambio, cambioRecibido: msONulo(p.cambioRecibido),
  gasto: p.gasto || 0, gastoNota: p.gastoNota || "", domiPagado: !!p.domiPagado, domiPagoMedio: p.domiPagoMedio || "",
  domiPagoValor: p.domiPagoValor ?? null, domiPagoFecha: ms(p.domiPagoFecha), domiPagoUid: p.domiPagoUid || "",
  intentos: (p.intentos || []).map(i => ({ fecha: ms(i.fecha), motivo: i.motivo || "", nota: i.nota || "" })), mini: p.mini || "",
  solicitud: p.solicitud ?? null,
});
const aCliente = (c: T.Cliente): Cliente => ({ id: c.id, nombre: c.nombre, telefono: c.telefono || "", tarifa: c.tarifa || 0 });
export const aPersona = (m: T.Mensajero): Persona => ({ id: m.id, nombre: m.nombre, telefono: m.telefono || "", tipo: m.tipo || "mensajero", tarifa: m.tarifa || 0 });
export const aMov = (m: T.Movimiento): Movimiento => ({ id: m.id, clienteId: m.clienteId, tipo: m.tipo, valor: m.valor || 0, medio: m.medio || "", nota: m.nota || "", fecha: ms(m.fecha), porUid: m.porUid || "", porNombre: m.porNombre || "", medioAntes: m.medioAntes || undefined });
const aRec = (r: T.Recaudo): Recaudo => ({ id: r.id, mensajeroId: r.mensajeroId, valor: r.valor || 0, medio: r.medio || "efectivo", nota: r.nota || "", fecha: ms(r.fecha), porUid: r.porUid || "", porNombre: r.porNombre || "", medioAntes: r.medioAntes || undefined });
export const aLiq = (l: T.Liquidacion): Liquidacion => ({ ...l, fecha: ms(l.fecha), desde: ms(l.desde), guias: l.guias ?? undefined });
export const aCaja = (c: T.CajaMovimiento): CajaMov => ({
  id: c.id, tipo: c.tipo, cat: c.cat, valor: c.valor || 0, medio: (c.medio || "") as CajaMov["medio"], concepto: c.concepto || "", fecha: ms(c.fecha),
  personaId: c.personaId || "", personaUid: c.personaUid || "", cuentaId: c.cuentaId || "", semana: c.semana || "", porUid: c.porUid || "", porNombre: c.porNombre || "",
  devuelto: c.devuelto || 0, adelantoId: c.adelantoId || "", deLiquidacion: c.deLiquidacion || "", inicial: !!c.inicial, nivel: !!c.nivel,
  arqueoId: c.arqueoId || "", esperado: c.esperado || undefined, contado: c.contado || undefined, medioAntes: c.medioAntes || undefined,
});
export const aUsuario = (u: T.Usuario): UsuarioS => ({ uid: u.id, email: u.email, nombre: u.nombre, rol: u.rol, clienteId: u.clienteId || "", mensajeroId: u.mensajeroId || "", activo: u.activo !== false, status: u.status });
const porId = <X, K extends keyof X>(xs: X[], k: K) => Object.fromEntries(xs.map(x => [String(x[k]), x])) as Record<string, X>;

/* ---------- Carga por colección, bajo demanda ----------
   Antes, al entrar se traía todo (todas las guías, clientes, movimientos, caja, sueldos…) y se volvía a traer todo
   cada 45 segundos, aunque la pantalla abierta no lo usara. Ahora cada vista dice qué colecciones necesita
   (`necesarias()`), se traen solo esas, y una colección traída hace menos de 30 segundos no se vuelve a pedir al
   cambiar de pestaña (queryCache.ts). La recarga periódica y la de después de guardar solo piden lo que está en uso. */

export type Coleccion = "pedidos" | "clientes" | "mensajeros" | "usuarios" | "movimientos" | "recaudos" | "liquidaciones" | "jornadas" | "cajamovs" | "cuentas" | "corte";
const TODAS: Coleccion[] = ["pedidos", "clientes", "mensajeros", "usuarios", "movimientos", "recaudos", "liquidaciones", "jornadas", "cajamovs", "cuentas", "corte"];
/* Qué usa cada pestaña de la oficina, contando los cálculos de motor.ts que llama (saldos, períodos, lo ya contado
   en un arqueo…) y las ventanas que abre. Ante la duda se incluye: una colección de más solo cuesta una petición;
   una de menos daría cifras equivocadas. */
const BASE: Coleccion[] = ["pedidos", "mensajeros", "corte"];
const DE_PESTANA: Record<string, Coleccion[]> = {
  pedidos: [...BASE, "clientes", "cajamovs", "liquidaciones"],
  solicitudes: [...BASE, "clientes"],
  clientes: [...BASE, "clientes", "movimientos", "cajamovs", "usuarios"],
};
/** Colecciones que necesita la vista. El modo mensajero y las pestañas que muestran el resumen de la caja o los sueldos
    (Inicio, Caja, Cuentas, Sueldos, Más) piden todas: esos cálculos cruzan pedidos, movimientos, caja, jornadas y usuarios. */
export function necesarias(modo: string, tab: string): Coleccion[] {
  return modo === "mensajero" ? TODAS : DE_PESTANA[tab] ?? TODAS;
}

/** Todas las guías que el usuario puede ver, de 1000 en 1000. La oficina no pide miniaturas (sus pantallas no las pintan
    desde aquí); el mensajero sí, porque las ve en sus listas. */
async function todosLosPedidos(sinMini: boolean) {
  const out: T.Pedido[] = [];
  let cursor: number | undefined;
  for (let i = 0; i < 200; i++) {
    const r = await api.pedidos.listar({ limite: 1000, cursor, ...(sinMini ? { sinMini: true } : {}) });
    out.push(...r.pedidos);
    if (!r.siguiente) break;
    cursor = r.siguiente;
  }
  return out;
}
/** Todos los clientes, de 500 en 500 (antes se pedían solo los primeros 500). */
async function todosLosClientes() {
  const out: T.Cliente[] = [];
  for (let desde = 0; desde < 200_000; desde += 500) {
    const xs = await api.clientes.listarDesde(desde, 500);
    out.push(...xs);
    if (xs.length < 500) break;
  }
  return out;
}

/** Trae una colección y la deja en S con la forma del prototipo. Lo que el rol no puede ver queda vacío, como antes. */
function cargadorDe(u: T.Usuario, col: Coleccion, modo: string): () => Promise<(s: Almacen) => void> {
  const oficina = u.rol === "admin" || u.rol === "asistente";
  switch (col) {
    case "pedidos": return async () => { const xs = (await todosLosPedidos(oficina && modo !== "mensajero")).map(aPedido); return s => { s.pedidos = porId(xs, "guia"); }; };
    case "clientes": return async () => { const xs = oficina ? await todosLosClientes() : []; return s => { s.clientes = porId(xs.map(aCliente), "id"); }; };
    case "mensajeros": return async () => {
      const xs = oficina ? await api.mensajeros.listar() : u.mensajeroId ? await api.mensajeros.obtener(u.mensajeroId).then(m => [m]).catch(() => [] as T.Mensajero[]) : [];
      return s => { s.mensajeros = porId(xs.map(aPersona), "id"); };
    };
    case "usuarios": return async () => {
      const us = (u.rol === "admin" ? await api.usuarios.listar() : [u]).map(aUsuario);
      return s => { s.usuarios = porId(us, "uid"); s.vinculos = Object.fromEntries(us.filter(x => x.mensajeroId).map(x => [x.uid, { uid: x.uid, mensajeroId: x.mensajeroId }])); };
    };
    case "movimientos": return async () => { const xs = oficina ? await api.movimientos.listar() : []; return s => { s.movimientos = porId(xs.map(aMov), "id"); }; };
    case "recaudos": return async () => { const xs = await api.recaudos.listar(); return s => { s.recaudos = porId(xs.map(aRec), "id"); }; };
    case "liquidaciones": return async () => { const xs = await api.liquidaciones.listar(); return s => { s.liquidaciones = porId(xs.map(aLiq), "id"); }; };
    case "jornadas": return async () => { const xs = await api.jornadas.listar(); return s => { s.jornadas = porId(xs as Jornada[], "id"); }; };
    case "cajamovs": return async () => { const xs = await api.cajaMovimientos.listar(); return s => { s.cajamovs = porId(xs.map(aCaja), "id"); }; };
    case "cuentas": return async () => { const xs = oficina ? await api.cuentasInternas.listar() : []; return s => { s.cuentas = porId(xs as Cuenta[], "id"); }; };
    case "corte": return async () => { const c = await api.caja.corte(); return () => { yo.corteRemoto = ms(c); }; };
  }
}

interface Datos {
  version: number;
  /** Sube cuando llega una colección que faltaba (solo para volver a pintar). */
  pinta: number;
  error: string;
  /** Vuelve a pedir al servidor lo que está en pantalla (lo demás queda vencido y se pide al abrirlo). */
  recargar: () => Promise<void>;
  /** Cambia el almacén aquí mismo (con lo que respondió el servidor) y vuelve a pintar. */
  tocar: (fn?: (s: Almacen) => void) => void;
  /** Una vista avisa qué colecciones usa: se traen las que falten o estén vencidas. Devuelve la función para soltarlas. */
  usar: (cols: readonly Coleccion[]) => () => void;
  /** ¿Están ya en memoria (aunque se estén actualizando)? */
  tiene: (cols: readonly Coleccion[]) => boolean;
}
const Ctx = createContext<Datos | null>(null);
const CADA = 45_000;
/** Cuánto se considera fresca una colección al cambiar de pestaña. */
const TTL = 30_000;

export function ProveedorDatos({ usuario, children }: { usuario: T.Usuario; children: ReactNode }) {
  const [version, setVersion] = useState(0);
  const [pinta, setPinta] = useState(0);
  const [error, setError] = useState("");
  const cache = useRef(crearCacheConsultas<Coleccion>(TTL)).current;
  const enUso = useRef(new Map<Coleccion, number>());
  const demoCargado = useRef(false);
  const modo = useRef(E.rol);

  Object.assign(yo, { uid: usuario.id, nombre: usuario.nombre || usuario.email, esAdmin: usuario.rol === "admin", esAsistente: usuario.rol === "asistente" });

  /** Trae las colecciones pedidas (las frescas se saltan, salvo con `forzar`) y vuelve a pintar una sola vez al final. */
  const traer = useCallback(async (cols: readonly Coleccion[], forzar = false) => {
    if (DEMO) { // en demo todo está en memoria desde el principio y los cambios no se reemplazan
      if (!demoCargado.current) { Object.assign(S, datosDemo(usuario)); demoCargado.current = true; TODAS.forEach(c => void cache.obtener(c, async () => true)); setVersion(v => v + 1); }
      return;
    }
    // Si el modo cambió (oficina ↔ mensajero), los pedidos se vuelven a pedir con o sin miniaturas.
    if (modo.current !== E.rol) { modo.current = E.rol; cache.invalidar("pedidos"); }
    const faltan = cols.filter(c => forzar || !cache.fresco(c));
    if (!faltan.length) return;
    try {
      const aplicar = await Promise.all(faltan.map(c => cache.obtener(c, cargadorDe(usuario, c, E.rol), { forzar })));
      aplicar.forEach(fn => fn(S));
      // `version` está en las claves de las listas paginadas: solo sube cuando se actualiza lo que ya había (recarga
      // periódica o después de guardar). Traer una colección nueva al abrir otra pestaña solo vuelve a pintar.
      setError(""); if (forzar) setVersion(v => v + 1); else setPinta(v => v + 1);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudieron cargar los datos.");
    }
  }, [usuario, cache]);

  const enPantalla = () => [...enUso.current.keys()];
  // Después de guardar: lo que está en pantalla se vuelve a pedir ya; lo demás se olvida, para que al abrirlo
  // se espere la versión nueva en vez de mostrar por un momento cifras de antes del cambio.
  const recargar = useCallback(() => {
    const usadas = enPantalla();
    TODAS.forEach(c => (usadas.includes(c) ? cache.invalidar(c) : cache.olvidar(c)));
    return traer(usadas, true);
  }, [cache, traer]);

  const usar = useCallback((cols: readonly Coleccion[]) => {
    cols.forEach(c => enUso.current.set(c, (enUso.current.get(c) || 0) + 1));
    void traer(cols);
    return () => cols.forEach(c => { const n = (enUso.current.get(c) || 1) - 1; if (n > 0) enUso.current.set(c, n); else enUso.current.delete(c); });
  }, [traer]);
  const tiene = useCallback((cols: readonly Coleccion[]) => DEMO ? demoCargado.current : cols.every(c => cache.cargado(c)), [cache]);

  useEffect(() => {
    // Cada 45 segundos (y al volver a la app) se actualiza solo lo que está en pantalla.
    const t = setInterval(() => { if (document.visibilityState === "visible") void traer(enPantalla(), true); }, CADA);
    const alVolver = () => { if (document.visibilityState === "visible") void traer(enPantalla()); };
    document.addEventListener("visibilitychange", alVolver);
    return () => { clearInterval(t); document.removeEventListener("visibilitychange", alVolver); };
  }, [traer]);

  // Con `fn` cambió el almacén (lo que respondió el servidor, o la demo): sube `version` y las listas se vuelven a pedir.
  // Sin `fn` es solo volver a pintar (cambió la pestaña o un filtro de `E`): antes eso también volvía a pedir la página.
  const tocar = useCallback((fn?: (s: Almacen) => void) => { if (fn) { fn(S); setVersion(v => v + 1); } else setPinta(v => v + 1); }, []);
  conectar(tocar, recargar);
  return <Ctx.Provider value={{ version, pinta, error, recargar, tocar, usar, tiene }}>{children}</Ctx.Provider>;
}

/** Muestra "Cargando…" hasta que estén las colecciones (para las ventanas que se abren desde otra pestaña). */
export function ConColecciones({ cols, children }: { cols: readonly Coleccion[]; children: ReactNode }) {
  return useColecciones(cols) ? <>{children}</> : <div className="vacio" role="status">Cargando…</div>;
}

/** Pide las colecciones que usa una vista mientras está montada. Devuelve true cuando ya están en memoria. */
export function useColecciones(cols: readonly Coleccion[]) {
  const d = useDatos(), clave = cols.join(",");
  useEffect(() => d.usar(cols), [clave, d.usar]);
  return d.tiene(cols);
}

export function useDatos() {
  const d = useContext(Ctx);
  if (!d) throw new Error("useDatos fuera de ProveedorDatos");
  return d;
}

/** Texto para el usuario cuando una acción falla. */
export function motivoError(e: unknown) {
  if (api.faltaEnServidor(e)) return "Esta función todavía no está lista en el servidor. Avísale a administración.";
  if (e instanceof FalloApi) return e.message;
  return e instanceof Error ? e.message : "Algo salió mal. Intenta de nuevo.";
}
