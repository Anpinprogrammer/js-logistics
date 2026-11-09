/* Llamadas al backend, agrupadas por recurso. */
import { api } from "./cliente";
import type { Archivo, TipoArchivo, Cliente, Mensajero, Movimiento, Pedido, Usuario, Motivo, MetodoEntrega, Rol, TipoPersonal, Medio, EstadoPedido,
  Recaudo, Liquidacion, Jornada, CajaMovimiento, CuentaInterna, Cambio, EnPapelera, PaginaPedidos } from "./tipos";
import { FalloApi } from "./cliente";

const datos = <T>(p: Promise<{ data: T }>) => p.then(r => r.data);

export const auth = {
  yo: () => datos<{ usuario: Usuario }>(api.get("/auth/yo")).then(d => d.usuario),
  ingresar: (email: string, clave: string) => datos<{ usuario: Usuario }>(api.post("/auth/ingresar", { email, clave })).then(d => d.usuario),
  salir: () => api.post("/auth/salir"),
  cambiarClave: (claveActual: string, claveNueva: string) => api.post("/auth/clave", { claveActual, claveNueva })
};

export interface FiltrosPedidos {
  estado?: EstadoPedido;
  mensajeroId?: string;
  clienteId?: string;
  desde?: string;
  hasta?: string;
  entregadoDesde?: string;
  entregadoHasta?: string;
  cerrados?: boolean;
  buscar?: string;
  conDiferencia?: boolean;
  /** "todas" incluye las diferencias ya revisadas. */
  diferencia?: "todas" | "sinRevisar";
  sinRemitente?: boolean;
  cambioPendiente?: boolean;
  sinServicio?: boolean;
  /** AAAA-MM-DD: salió, se entregó o se devolvió ese día (hora de Colombia). */
  dia?: string;
  limite?: number;
  cursor?: number;
}

export interface DatosEntrega {
  destinatario: string;
  valorCobrado: number;
  metodo: MetodoEntrega;
  cuentaJs?: "nequi" | "bancolombia";
  cambio?: boolean;
  gasto?: number;
  gastoNota?: string;
}

export type CambiosPedido = Partial<Pick<Pedido, "mensajeroId" | "valorServicio" | "aCobrar" | "gasto" | "gastoNota" | "cobrarDev"
  | "difRevisada" | "domiPagado" | "valorCobrado">> & {
  clienteId?: string | null;
  metodo?: MetodoEntrega;
  cuentaJs?: "" | "nequi" | "bancolombia";
  domiPagoMedio?: Medio;
  domiPagoValor?: number;
};

const limpio = (o: object) => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined && v !== ""));

export const pedidos = {
  listar: (f: FiltrosPedidos = {}) => datos<{ pedidos: Pedido[]; siguiente: number | null }>(api.get("/pedidos", { params: limpio(f) })),
  /** Una página del paginador: el servidor filtra, cuenta y corta. */
  pagina: (f: Omit<FiltrosPedidos, "limite" | "cursor">, pagina: number, porPagina: number) =>
    datos<PaginaPedidos>(api.get("/pedidos", { params: { ...limpio(f), pagina, porPagina } })),
  obtener: (guia: string) => datos<{ pedido: Pedido }>(api.get(`/pedidos/${guia}`)).then(d => d.pedido),
  crear: (d: { mensajeroId?: string; clienteId?: string | null; valorServicio?: number; aCobrar?: number } = {}) =>
    datos<{ pedido: Pedido }>(api.post("/pedidos", d)).then(r => r.pedido),
  actualizar: (guia: string, d: CambiosPedido) => datos<{ pedido: Pedido }>(api.patch(`/pedidos/${guia}`, d)).then(r => r.pedido),
  entregar: (guia: string, d: DatosEntrega) => datos<{ pedido: Pedido }>(api.post(`/pedidos/${guia}/entrega`, d)).then(r => r.pedido),
  noEntregado: (guia: string, d: { motivo: Motivo; nota: string }) =>
    datos<{ pedido: Pedido }>(api.post(`/pedidos/${guia}/no-entregado`, d)).then(r => r.pedido),
  corregir: (guia: string, d: Partial<DatosEntrega> & { motivoDev?: Motivo; notaDev?: string }) =>
    datos<{ pedido: Pedido }>(api.patch(`/pedidos/${guia}/correccion`, d)).then(r => r.pedido),
  eliminar: (guia: string) => api.delete(`/pedidos/${guia}`),
  cambioRecibido: (guia: string) => datos<{ pedido: Pedido }>(api.post(`/pedidos/${guia}/cambio-recibido`)).then(r => r.pedido),
  /** Devuelve una guía entregada o devuelta a "por entregar" (solo administración). Las pruebas quedan como "previas". */
  reabrir: (guia: string) => datos<{ pedido: Pedido }>(api.post(`/pedidos/${guia}/reabrir`)).then(r => r.pedido),
  archivos: (guia: string) => datos<{ archivos: Archivo[] }>(api.get(`/pedidos/${guia}/archivos`)).then(d => d.archivos),
  /** La imagen va como cuerpo binario (ya comprimida en el celular), una por petición. */
  subirArchivo: (guia: string, tipo: Exclude<TipoArchivo, "previa">, imagen: Blob) =>
    datos<{ archivo: Archivo }>(api.post(`/pedidos/${guia}/archivos/${tipo}`, imagen, {
      headers: { "Content-Type": imagen.type || "image/jpeg" }, timeout: 60_000
    })).then(d => d.archivo)
};

export const clientes = {
  listar: (buscar = "") => datos<{ clientes: Cliente[] }>(api.get("/clientes", { params: limpio({ buscar, limite: 500 }) })).then(d => d.clientes),
  obtener: (id: string) => datos<{ cliente: Cliente }>(api.get(`/clientes/${id}`)).then(d => d.cliente),
  movimientos: (id: string) => datos<{ movimientos: Movimiento[] }>(api.get(`/clientes/${id}/movimientos`)).then(d => d.movimientos),
  crear: (d: { nombre: string; telefono: string; tarifa: number; confirmarRepetido?: boolean }) =>
    datos<{ cliente: Cliente }>(api.post("/clientes", d)).then(r => r.cliente),
  actualizar: (id: string, d: Partial<Pick<Cliente, "nombre" | "telefono" | "tarifa">>) =>
    datos<{ cliente: Cliente }>(api.patch(`/clientes/${id}`, d)).then(r => r.cliente),
  eliminar: (id: string) => api.delete(`/clientes/${id}`),
  /** Une clientes repetidos en `id`: le pasa pedidos, movimientos y cuentas de acceso de `otros`, y los borra. */
  unir: (id: string, otros: string[]) => datos<{ cliente: Cliente }>(api.post(`/clientes/${id}/unir`, { otros })).then(r => r.cliente)
};

export const mensajeros = {
  listar: (inactivos = false) => datos<{ mensajeros: Mensajero[] }>(api.get("/mensajeros", { params: inactivos ? { inactivos: "true" } : {} })).then(d => d.mensajeros),
  obtener: (id: string) => datos<{ mensajero: Mensajero }>(api.get(`/mensajeros/${id}`)).then(d => d.mensajero),
  crear: (d: { nombre: string; telefono: string; tipo: TipoPersonal; tarifa: number }) =>
    datos<{ mensajero: Mensajero }>(api.post("/mensajeros", d)).then(r => r.mensajero),
  actualizar: (id: string, d: Partial<Omit<Mensajero, "id">>) => datos<{ mensajero: Mensajero }>(api.patch(`/mensajeros/${id}`, d)).then(r => r.mensajero),
  eliminar: (id: string) => api.delete(`/mensajeros/${id}`)
};

export const usuarios = {
  listar: () => datos<{ usuarios: Usuario[] }>(api.get("/usuarios")).then(d => d.usuarios),
  crear: (d: { email: string; nombre: string; rol: Rol; clave: string; clienteId?: string | null; mensajeroId?: string | null }) =>
    datos<{ usuario: Usuario }>(api.post("/usuarios", d)).then(r => r.usuario),
  actualizar: (id: string, d: { nombre?: string; rol?: Rol; clienteId?: string | null; mensajeroId?: string | null; activo?: boolean }) =>
    datos<{ usuario: Usuario }>(api.patch(`/usuarios/${id}`, d)).then(r => r.usuario),
  cambiarClave: (id: string, clave: string) => api.put(`/usuarios/${id}/clave`, { clave }),
  eliminar: (id: string) => api.delete(`/usuarios/${id}`)
};

/** Ruta que el servidor todavía no tiene (el módulo no se ha desplegado). */
export const faltaEnServidor = (e: unknown) => e instanceof FalloApi && e.code === "RUTA_NO_ENCONTRADA";
/** Si el módulo todavía no está en el servidor, o este rol no lo puede ver, se muestra como "sin datos". */
export const opcional = <T>(p: Promise<T>, vacio: T): Promise<T> =>
  p.catch(e => { if (faltaEnServidor(e) || (e instanceof FalloApi && e.status === 403)) return vacio; throw e; });

/** Colección sencilla del backend: GET lista, POST crea, PATCH edita, DELETE borra. */
function coleccion<T, C = Partial<T>>(ruta: string, clave: string, unidad: string) {
  return {
    listar: () => opcional(datos<Record<string, T[]>>(api.get(ruta)).then(d => d[clave] ?? []), [] as T[]),
    crear: (d: C) => datos<Record<string, T>>(api.post(ruta, d)).then(r => r[unidad]),
    actualizar: (id: string, d: Partial<C>) => datos<Record<string, T>>(api.patch(`${ruta}/${id}`, d)).then(r => r[unidad]),
    eliminar: (id: string) => api.delete(`${ruta}/${id}`)
  };
}

type Sin<T> = Omit<T, "id" | "fecha" | "porNombre" | "porUid"> & { fecha?: string };
export const movimientos = coleccion<Movimiento, Sin<Movimiento>>("/movimientos", "movimientos", "movimiento");
export const recaudos = coleccion<Recaudo, Sin<Recaudo>>("/recaudos", "recaudos", "recaudo");
export const liquidaciones = coleccion<Liquidacion, Partial<Liquidacion>>("/liquidaciones", "liquidaciones", "liquidacion");
export const cajaMovimientos = coleccion<CajaMovimiento, Partial<CajaMovimiento>>("/caja/movimientos", "movimientos", "movimiento");
export const cuentasInternas = coleccion<CuentaInterna, Omit<CuentaInterna, "id">>("/cuentas", "cuentas", "cuenta");
export const jornadas = {
  ...coleccion<Jornada>("/jornadas", "jornadas", "jornada"),
  /** Crea o cambia el pago de un día (o el sueldo previo de una semana). */
  poner: (j: Jornada) => datos<{ jornada: Jornada }>(api.put(`/jornadas/${j.id}`, j)).then(r => r.jornada)
};
export const caja = {
  /** Fecha del último arqueo (lo anterior ya está contado y no se cambia). */
  corte: () => opcional(datos<{ corte: string | null }>(api.get("/caja/corte")).then(d => d.corte), null),
  /** Lo esperado lo calcula el servidor; se manda solo lo contado. */
  arqueo: (d: { contado: Record<string, number>; nota: string }) => api.post("/caja/arqueos", d),
  /** Cierre de la caja de oficina de un asistente: lo que entrega en cada medio (el servidor registra sobrantes y ajustes). */
  cierreOficina: (uid: string, d: { efectivo: number; nequi: number; bancolombia: number; nota: string }) => api.post(`/caja/oficinas/${uid}/cierre`, d),
  /** Devolución (todo o parte) de un adelanto de sueldo. */
  devolverAdelanto: (id: string, d: { valor: number; medio: string }) => api.post(`/caja/adelantos/${id}/devolucion`, d),
  deshacerArqueo: (id: string) => api.delete(`/caja/arqueos/${id}`)
};
export const historial = {
  /** Cambios desde `desde` (día YYYY-MM-DD en Colombia), los más nuevos primero. */
  listar: (desde: string) => opcional(datos<{ cambios: Cambio[] }>(api.get("/historial", { params: { desde, limite: 600 } })).then(d => d.cambios), [] as Cambio[]),
  papelera: () => opcional(datos<{ papelera: EnPapelera[] }>(api.get("/papelera")).then(d => d.papelera), [] as EnPapelera[]),
  restaurar: (id: string) => api.post(`/papelera/${id}/restaurar`),
  eliminarDefinitivo: (id: string) => api.delete(`/papelera/${id}`)
};
