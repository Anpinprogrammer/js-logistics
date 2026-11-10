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

const ms = (x: string | null | undefined) => (x ? new Date(x).getTime() || 0 : 0);
const msONulo = (x: string | null | undefined) => (x ? new Date(x).getTime() || null : null);

export const aPedido = (p: T.Pedido): Pedido => ({
  guia: p.guia, n: p.n, estado: p.estado, creado: ms(p.creado), entregado: msONulo(p.entregado),
  mensajeroId: p.mensajeroId || "", clienteId: p.clienteId || "", clienteNombre: p.clienteNombre || "",
  valorServicio: p.valorServicio || 0, aCobrar: p.aCobrar || 0, destinatario: p.destinatario || "", valorCobrado: p.valorCobrado || 0,
  metodo: p.metodo || "", cuentaJs: p.cuentaJs || "", difCobro: p.difCobro || 0, difRevisada: !!p.difRevisada,
  motivoDev: p.motivoDev || "", notaDev: p.notaDev || "", cobrarDev: !!p.cobrarDev, cambio: !!p.cambio, cambioRecibido: msONulo(p.cambioRecibido),
  gasto: p.gasto || 0, gastoNota: p.gastoNota || "", domiPagado: !!p.domiPagado, domiPagoMedio: p.domiPagoMedio || "",
  domiPagoValor: p.domiPagoValor ?? null, domiPagoFecha: ms(p.domiPagoFecha), domiPagoUid: p.domiPagoUid || "",
  intentos: (p.intentos || []).map(i => ({ fecha: ms(i.fecha), motivo: i.motivo || "", nota: i.nota || "" })), mini: p.mini || "",
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

/** Todas las guías que el usuario puede ver, de 500 en 500. */
async function todosLosPedidos() {
  const out: T.Pedido[] = [];
  let cursor: number | undefined;
  for (let i = 0; i < 200; i++) {
    const r = await api.pedidos.listar({ limite: 500, cursor });
    out.push(...r.pedidos);
    if (!r.siguiente) break;
    cursor = r.siguiente;
  }
  return out;
}

async function cargarTodo(u: T.Usuario): Promise<Almacen> {
  const oficina = u.rol === "admin" || u.rol === "asistente";
  const [pedidos, clientes, mensajeros, usuarios, movimientos, recaudos, liquidaciones, jornadas, cajamovs, cuentas, corte] = await Promise.all([
    todosLosPedidos(),
    oficina ? api.clientes.listar() : Promise.resolve([] as T.Cliente[]),
    oficina ? api.mensajeros.listar() : u.mensajeroId ? api.mensajeros.obtener(u.mensajeroId).then(m => [m]).catch(() => [] as T.Mensajero[]) : Promise.resolve([] as T.Mensajero[]),
    u.rol === "admin" ? api.usuarios.listar() : Promise.resolve([u]),
    oficina ? api.movimientos.listar() : Promise.resolve([] as T.Movimiento[]),
    api.recaudos.listar(), api.liquidaciones.listar(), api.jornadas.listar(), api.cajaMovimientos.listar(),
    oficina ? api.cuentasInternas.listar() : Promise.resolve([] as T.CuentaInterna[]),
    api.caja.corte(),
  ]);
  yo.corteRemoto = ms(corte);
  const us = usuarios.map(aUsuario);
  return {
    pedidos: porId(pedidos.map(aPedido), "guia"), clientes: porId(clientes.map(aCliente), "id"), mensajeros: porId(mensajeros.map(aPersona), "id"),
    movimientos: porId(movimientos.map(aMov), "id"), recaudos: porId(recaudos.map(aRec), "id"), liquidaciones: porId(liquidaciones.map(aLiq), "id"),
    jornadas: porId(jornadas as Jornada[], "id"), cajamovs: porId(cajamovs.map(aCaja), "id"), cuentas: porId(cuentas as Cuenta[], "id"),
    usuarios: porId(us, "uid"), vinculos: Object.fromEntries(us.filter(x => x.mensajeroId).map(x => [x.uid, { uid: x.uid, mensajeroId: x.mensajeroId }])),
  };
}

interface Datos {
  version: number;
  cargado: boolean;
  error: string;
  /** Vuelve a pedir todo al servidor. */
  recargar: () => Promise<void>;
  /** Cambia el almacén aquí mismo (con lo que respondió el servidor) y vuelve a pintar. */
  tocar: (fn?: (s: Almacen) => void) => void;
}
const Ctx = createContext<Datos | null>(null);
const CADA = 45_000;

export function ProveedorDatos({ usuario, children }: { usuario: T.Usuario; children: ReactNode }) {
  const [version, setVersion] = useState(0);
  const [cargado, setCargado] = useState(false);
  const [error, setError] = useState("");
  const enCurso = useRef<Promise<void> | null>(null);
  const cargadoUnaVez = useRef(false);

  Object.assign(yo, { uid: usuario.id, nombre: usuario.nombre || usuario.email, esAdmin: usuario.rol === "admin", esAsistente: usuario.rol === "asistente" });

  const recargar = useCallback(() => {
    if (enCurso.current) return enCurso.current;
    const p = (async () => {
      try {
        const nuevo = DEMO ? datosDemo(usuario) : await cargarTodo(usuario);
        if (DEMO && cargadoUnaVez.current) return; // en demo los cambios viven en memoria: no se reemplazan
        Object.assign(S, nuevo);
        cargadoUnaVez.current = true;
        setError(""); setCargado(true); setVersion(v => v + 1);
      } catch (e) {
        setError(e instanceof Error ? e.message : "No se pudieron cargar los datos.");
      } finally { enCurso.current = null; }
    })();
    enCurso.current = p;
    return p;
  }, [usuario]);

  useEffect(() => {
    recargar();
    const t = setInterval(() => { if (document.visibilityState === "visible") recargar(); }, CADA);
    const alVolver = () => { if (document.visibilityState === "visible") recargar(); };
    document.addEventListener("visibilitychange", alVolver);
    return () => { clearInterval(t); document.removeEventListener("visibilitychange", alVolver); };
  }, [recargar]);

  const tocar = useCallback((fn?: (s: Almacen) => void) => { fn?.(S); setVersion(v => v + 1); }, []);
  conectar(tocar, recargar);
  return <Ctx.Provider value={{ version, cargado, error, recargar, tocar }}>{children}</Ctx.Provider>;
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
