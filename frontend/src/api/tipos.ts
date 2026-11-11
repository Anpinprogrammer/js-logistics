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
  /** Derivado en el servidor: sin contraseña = pendiente de activación. */
  status?: "pending_activation" | "active" | "disabled";
}

/** Lo que ve el mensajero al buscar un remitente (GET /clientes/buscar). */
export interface ClienteBreve { id: string; nombre: string }

export interface Cliente {
  id: string;
  nombre: string;
  telefono: string;
  direccionRecogida: string;
  tarifa: number;
  creado: string;
}

/** Cliente con su saldo calculado por el servidor y, si se pidió un día, lo movido ese día. */
export interface ClienteConSaldo {
  id: string;
  nombre: string;
  telefono: string;
  direccionRecogida?: string;
  tarifa: number;
  saldo: number;
  delDia?: number;
}

/** Una página de la pestaña Clientes (8 en celular, 20 en computador). */
export interface PaginaClientes {
  clientes: ClienteConSaldo[];
  pagina: number;
  porPagina: number;
  total: number;
  paginas: number;
  totalClientes: number;
  porCobrar: { total: number; clientes: number };
  porPagar: { total: number; clientes: number };
  repetidos?: number;
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
  /** Cuándo y quién registró el pago aparte del domicilio (lo usa la caja de oficina). */
  domiPagoFecha?: string | null;
  domiPagoUid?: string | null;
  intentos: Intento[];
  mini: string | null;
}

/** Una página del paginador de pedidos (GET /pedidos?pagina=&porPagina=). */
export interface PaginaPedidos {
  pedidos: Pedido[];
  pagina: number;
  porPagina: number;
  total: number;
  paginas: number;
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
  porUid?: string | null;
  medioAntes?: string | null;
}

/** Una página de la pestaña Movimientos de Cuentas (6 en celular, 15 en computador). */
export interface PaginaMovimientos {
  movimientos: Movimiento[];
  pagina: number;
  porPagina: number;
  total: number;
  paginas: number;
  totales: { recibido: number; pagado: number; compras: number; ganancia: number };
}

/** Ganancia (y pagos/compras de contexto) de un cliente en el rango elegido. */
export interface GananciaCliente {
  clienteId: string;
  nombre: string;
  recibido: number;
  compras: number;
  ganancia: number;
}

/** Una página de la pestaña Ganancias de Cuentas. */
export interface PaginaGanancias {
  clientes: GananciaCliente[];
  pagina: number;
  porPagina: number;
  total: number;
  paginas: number;
  totalGanancia: number;
}

export interface ErrorApi {
  code: string;
  message: string;
  campos?: { campo: string; mensaje: string }[];
}

/* ---------- Módulos de caja y sueldos ----------
   Mismas formas que las colecciones del prototipo (app/js/app.js). La app interna las pide al backend y, mientras un
   endpoint no exista (404), las trata como vacías. Ver "Lo que la app interna espera del backend" en frontend/README.md. */

/** Dinero que un mensajero le entrega a la oficina. */
export interface Recaudo {
  id: string; mensajeroId: string; valor: number; medio: Medio; nota: string; fecha: string;
  porUid?: string | null; porNombre?: string; medioAntes?: string | null;
}

/** Cierre del período de un mensajero. */
export interface Liquidacion {
  id: string; mensajeroId: string; fecha: string; desde?: string | null; guias?: string[] | null;
  entregas: number; efectivo: number; transfJs: number; transfCli: number; gastos: number; base: number;
  recibido: number; anterior: number; ajuste: number; debe: number; sueldo: number; nota?: string;
  recibidoAntes?: number; entregaFinal?: number; adelanto?: number; enRuta?: number; dia?: string;
}

/** Pago por día de patinadores y oficina, y el "sueldo previo" de una semana (id `persona_previo_semana`). */
export interface Jornada { id: string; personaId: string; dia: string; valor: number; previo?: boolean; nota?: string }

/** Entradas y salidas de la caja de la empresa (gastos, bases, adelantos, sueldos, arqueos, cuentas internas…). */
export interface CajaMovimiento {
  id: string; tipo: "entra" | "sale" | "base" | "marca"; cat: string; valor: number; medio: Medio | "cuentas" | "" | null;
  concepto: string; fecha: string; personaId?: string | null; personaUid?: string | null; cuentaId?: string | null; semana?: string | null;
  porUid?: string | null; porNombre?: string; devuelto?: number; adelantoId?: string | null; deLiquidacion?: string | null;
  inicial?: boolean; nivel?: boolean; arqueoId?: string | null; esperado?: Record<string, number> | null; contado?: Record<string, number> | null;
  medioAntes?: string | null;
}

/** Cuentas internas: JS Envíos, MT, Base de JS. */
export interface CuentaInterna { id: string; nombre: string; tipo: "socio" | "base" }

/** Registro de cambios (historial) y papelera. */
export interface Cambio { id: string; fecha: string; quien: string; op: string; col: string; docId: string; resumen: string }
/** Una página del historial (5 en celular y 13 en computador). */
export interface PaginaHistorial { cambios: Cambio[]; pagina: number; porPagina: number; total: number; paginas: number }
/** Una página de liquidaciones recientes (5 en celular y 9 en computador). */
export interface PaginaLiquidaciones { liquidaciones: Liquidacion[]; pagina: number; porPagina: number; total: number; paginas: number }
export interface EnPapelera { id: string; col: string; docId: string; resumen: string; fecha: string; quien: string }

/** Respuesta de POST /usuarios al crear un acceso pendiente de activación. */
export interface AccesoCreado {
  message: string;
  usuario: Usuario;
  user: { id: string; nombre: string; email: string; telefono: string; activationUrl: string; status?: Usuario["status"] };
  correo?: { enviado: boolean; motivo?: string };
}

/** Enlace que llega por correo para activar una cuenta o cambiar la contraseña. */
export interface EnlaceCorreo {
  tipo: "activacion" | "clave";
  nombre: string;
  /** Correo tapado por el servidor, por ejemplo c******@js.co. */
  email: string;
  expira: string;
}

/** Una página de Personal JS (4 en celular, 7 en computador). */
export interface PaginaPersonal { mensajeros: Mensajero[]; pagina: number; porPagina: number; total: number; paginas: number }

/** Una página de los accesos a la app (5 en celular, 10 en computador). */
export interface PaginaUsuarios {
  usuarios: Usuario[];
  pagina: number;
  porPagina: number;
  total: number;
  paginas: number;
}

/** Una página de los movimientos de las cuentas internas (5 en celular, 10 en computador). */
export interface PaginaCajaMovimientos {
  movimientos: CajaMovimiento[];
  pagina: number;
  porPagina: number;
  total: number;
  paginas: number;
}

/** Solicitud de envío que un visitante manda desde la landing (formulario "Solicitar envío"). */
export type EstadoSolicitud = "pendiente" | "cotizada" | "confirmada" | "asignada" | "rechazada";
export interface Solicitud {
  id: string;
  estado: EstadoSolicitud;
  nombre: string;
  telefono: string;
  email: string;
  direccionRecogida: string;
  paquetes: number;
  pesoKg: number | null;
  destinatarioNombre: string;
  destinatarioTelefono: string;
  direccionEntrega: string;
  /** Domicilio que puso la oficina al aceptarla. */
  valor: number | null;
  motivoRechazo: string;
  clienteId: string | null;
  clienteNombre: string | null;
  mensajeroId: string | null;
  mensajeroNombre: string | null;
  guia: string | null;
  creado: string;
  actualizado: string;
}
/** Cuántas solicitudes hay en cada estado abierto (la campanita). */
export interface ConteoSolicitudes { pendiente: number; cotizada: number; confirmada: number }
/** Filtros de la pantalla de Solicitudes. "Por confirmar" = esperando que el cliente acepte el valor. */
export type GrupoSolicitud = "todas" | "pendientes" | "por-confirmar" | "aceptadas" | "rechazadas";
export type ConteoGrupos = Record<"todas" | "pendientes" | "porConfirmar" | "aceptadas" | "rechazadas", number>;
export interface PaginaSolicitudes { solicitudes: Solicitud[]; pagina: number; porPagina: number; total: number; paginas: number; grupos: ConteoGrupos }
export interface ListaSolicitudes { solicitudes: Solicitud[]; conteo: ConteoSolicitudes }
