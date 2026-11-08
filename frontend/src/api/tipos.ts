/* Formas de los datos que devuelve el backend (backend/README.md). Dinero en pesos enteros, fechas ISO. */

export type Rol = "admin" | "asistente" | "mensajero" | "cliente";
export type Medio = "efectivo" | "nequi" | "bancolombia";
export type MetodoEntrega = "efectivo" | "transf_js" | "transf_cliente";
export type Motivo = "no_contesta" | "direccion" | "rechazo" | "reprogramar" | "otro";
export type EstadoPedido = "pendiente" | "entregado" | "devuelto";
export type TipoPersonal = "mensajero" | "dueno" | "oficina" | "patinador" | "empresa";

export interface Usuario {
  id: string;
  email: string;
  nombre: string;
  rol: Rol;
  clienteId: string | null;
  mensajeroId: string | null;
  activo?: boolean;
  ultimoIngreso?: string | null;
}

export interface Cliente {
  id: string;
  nombre: string;
  telefono: string;
  tarifa: number;
  creado: string;
}

export interface Mensajero {
  id: string;
  nombre: string;
  telefono: string;
  tipo: TipoPersonal;
  tarifa: number;
  activo: boolean;
}

export interface Intento { fecha: string; motivo: Motivo; nota: string }

export interface Pedido {
  guia: string;
  n: number;
  estado: EstadoPedido;
  creado: string;
  mensajeroId: string;
  mensajeroNombre: string | null;
  clienteId: string | null;
  clienteNombre: string | null;
  valorServicio: number;
  aCobrar: number;
  entregado: string | null;
  destinatario: string;
  valorCobrado: number;
  metodo: MetodoEntrega | "devuelto" | "";
  cuentaJs: "" | "nequi" | "bancolombia";
  difCobro: number;
  difRevisada: boolean;
  motivoDev: Motivo | "";
  notaDev: string;
  cobrarDev: boolean;
  cambio: boolean;
  cambioRecibido: string | null;
  gasto: number;
  gastoNota: string;
  domiPagado: boolean;
  domiPagoMedio: Medio | null;
  domiPagoValor: number | null;
  intentos: Intento[];
  mini: string | null;
}

/** Fotos y firmas: la URL viene firmada por el servidor y vence en 1 hora. */
export type TipoArchivo = "salida" | "mini" | "entrega" | "firma" | "previa";
export interface Archivo {
  tipo: TipoArchivo;
  url: string;
  creado: string;
}

export interface Movimiento {
  id: string;
  clienteId: string;
  tipo: "cargo" | "abono" | "pago_de_cliente" | "pago_a_cliente" | "compra_cliente" | "ganancia";
  valor: number;
  medio: Medio | null;
  nota: string;
  fecha: string;
  porNombre: string;
}

export interface ErrorApi {
  code: string;
  message: string;
  campos?: { campo: string; mensaje: string }[];
}
