/* Llamadas al backend, agrupadas por recurso. */
import { api } from "./cliente";
import type { Cliente, Mensajero, Movimiento, Pedido, Usuario, Motivo, MetodoEntrega, Rol, TipoPersonal, Medio, EstadoPedido } from "./tipos";

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
  obtener: (guia: string) => datos<{ pedido: Pedido }>(api.get(`/pedidos/${guia}`)).then(d => d.pedido),
  crear: (d: { mensajeroId?: string; clienteId?: string | null; valorServicio?: number; aCobrar?: number } = {}) =>
    datos<{ pedido: Pedido }>(api.post("/pedidos", d)).then(r => r.pedido),
  actualizar: (guia: string, d: CambiosPedido) => datos<{ pedido: Pedido }>(api.patch(`/pedidos/${guia}`, d)).then(r => r.pedido),
  entregar: (guia: string, d: DatosEntrega) => datos<{ pedido: Pedido }>(api.post(`/pedidos/${guia}/entrega`, d)).then(r => r.pedido),
  noEntregado: (guia: string, d: { motivo: Motivo; nota: string }) =>
    datos<{ pedido: Pedido }>(api.post(`/pedidos/${guia}/no-entregado`, d)).then(r => r.pedido),
  corregir: (guia: string, d: Partial<DatosEntrega> & { motivoDev?: Motivo; notaDev?: string }) =>
    datos<{ pedido: Pedido }>(api.patch(`/pedidos/${guia}/correccion`, d)).then(r => r.pedido),
  eliminar: (guia: string) => api.delete(`/pedidos/${guia}`)
};

export const clientes = {
  listar: (buscar = "") => datos<{ clientes: Cliente[] }>(api.get("/clientes", { params: limpio({ buscar, limite: 500 }) })).then(d => d.clientes),
  obtener: (id: string) => datos<{ cliente: Cliente }>(api.get(`/clientes/${id}`)).then(d => d.cliente),
  movimientos: (id: string) => datos<{ movimientos: Movimiento[] }>(api.get(`/clientes/${id}/movimientos`)).then(d => d.movimientos),
  crear: (d: { nombre: string; telefono: string; tarifa: number; confirmarRepetido?: boolean }) =>
    datos<{ cliente: Cliente }>(api.post("/clientes", d)).then(r => r.cliente),
  actualizar: (id: string, d: Partial<Pick<Cliente, "nombre" | "telefono" | "tarifa">>) =>
    datos<{ cliente: Cliente }>(api.patch(`/clientes/${id}`, d)).then(r => r.cliente),
  eliminar: (id: string) => api.delete(`/clientes/${id}`)
};

export const mensajeros = {
  listar: (inactivos = false) => datos<{ mensajeros: Mensajero[] }>(api.get("/mensajeros", { params: inactivos ? { inactivos: "true" } : {} })).then(d => d.mensajeros),
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
