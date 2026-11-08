/* Reglas fijas del negocio, copiadas tal cual de app/js/app.js. Si cambian allá, cambian aquí. */

export const METODOS = {
  efectivo: { t: "Efectivo", d: "El mensajero recibe el dinero en mano" },
  transf_js: { t: "Transferencia a JS", d: "El destinatario le transfiere a la empresa" },
  transf_cliente: { t: "Transferencia al cliente", d: "Le pagaron directo al remitente: el remitente queda debiendo el domicilio" }
};
export const MOTIVOS = { no_contesta: "No contestan", direccion: "Dirección errada", rechazo: "Lo rechazaron", reprogramar: "Reprogramar (sigue en ruta)", otro: "Otro motivo" };
export const CUENTAS_JS = { nequi: "Nequi", bancolombia: "Bancolombia" };
export const MEDIOS = { efectivo: "Efectivo", nequi: "Nequi", bancolombia: "Bancolombia" };
export const MEDIOS_CAJA = { ...MEDIOS, cuentas: "Cuentas JS (transferencias)" };
export const ESTADOS = { pendiente: "por entregar", entregado: "entregado", devuelto: "devuelto" };

/** Movimientos de la cuenta de un cliente. s: signo en el saldo; pago: entra o sale de la caja; caja: sale de la caja. */
export const MOVS = {
  cargo: { t: "Cargo al cliente (queda debiendo)", corto: "Cargo", s: -1 },
  abono: { t: "Abono a favor del cliente", corto: "A favor", s: 1 },
  pago_a_cliente: { t: "JS le paga al cliente", corto: "Pago al cliente", s: -1, pago: true },
  pago_de_cliente: { t: "El cliente le paga a JS", corto: "Pago del cliente", s: 1, pago: true },
  compra_cliente: { t: "Compra por encargo del cliente (sale de la caja)", corto: "Compra por encargo", s: -1, caja: true },
  ganancia: { t: "Ganancia ocasional de JS (se le carga al cliente)", corto: "Servicio adicional", s: -1 }
};
/** Lo que también registra el asistente. */
export const MOVS_OFICINA = ["pago_de_cliente", "pago_a_cliente", "compra_cliente", "ganancia"];

export const CATS = { devolucion: "Devolución de adelanto", arqueo: "Arqueo", interna: "Cuenta interna", inicial: "Caja inicial", otro_entra: "Otra entrada", sobrante: "Sobrante de caja", gasto: "Gasto", base: "Base para vueltos", arriendo: "Arriendo", adelanto: "Adelanto", sueldo: "Pago de sueldo", otro: "Otra salida" };
export const CATS_TIPO = { entra: ["otro_entra"], sale: ["gasto", "base", "arriendo", "adelanto", "sueldo", "otro"] };
export const CATS_PERSONA = ["adelanto", "sueldo", "base"];
export const CATS_SEMANA = ["adelanto", "sueldo"];

export const TIPOS = { mensajero: "Mensajero", dueno: "Dueño (Javier)", oficina: "Oficina (JS)", patinador: "Patinador", empresa: "Empresa (JS)" };
export const PAGO_FIJO = ["patinador", "oficina", "empresa"];
export const ORDEN_TIPO = ["mensajero", "oficina", "patinador", "empresa", "dueno"];
export const TIPOS_CUENTA = { socio: "Empresa o tienda (presta y devuelve)", base: "Base de la empresa" };

/** Sueldo del mensajero por día: 70 % de sus domicilios − $25.000. */
export const PCT_SUELDO = 0.7;
export const DESC_SUELDO = 25000;
/** Desde esta semana el domicilio cuenta el día en que salió el pedido (antes, el día de entrega). */
export const SUELDO_POR_SALIDA = "2026-10-31";

export const ROLES = { mensajero: "Mensajero", asistente: "Asistente", admin: "Administración", cliente: "Cliente" };

/* Historial y papelera */
export const COL_NOM = { pedidos: "pedido", clientes: "cliente", movimientos: "movimiento de cliente", recaudos: "entrega de dinero", liquidaciones: "liquidación", cajamovs: "movimiento de caja", mensajeros: "personal", jornadas: "día de sueldo", vinculos: "vínculo de cuenta" };
export const CAMPOS = { cambioRecibido: "cambio", gasto: "flete/gasto", domiPagoValor: "pago de domicilio", domiPagoMedio: "medio del pago", estado: "estado", valorServicio: "servicio", clienteId: "remitente", valorCobrado: "cobrado", metodo: "método", domiPagado: "domicilio pagado", aCobrar: "a cobrar", cobrarDev: "cobrar devolución", cuentaJs: "cuenta", tipo: "tipo", tarifa: "pago por día", nombre: "nombre", telefono: "teléfono", motivoDev: "motivo" };
export const NO_LOG = ["fotos", "entregas", "meta", "historial", "papelera", "papelera_fotos"];
export const PAPELERA_COLS = ["pedidos", "clientes", "movimientos", "recaudos", "liquidaciones", "cajamovs", "mensajeros"];

/** Ventana que las reglas le dan al asistente para que la hora de lo que registra sea la del momento. */
export const VENTANA_HORA_MS = 10 * 60 * 1000;
/** El asistente corrige el medio de lo suyo hasta 24 horas después; el mensajero corrige su entrega en 24 horas. */
export const VENTANA_CORRECCION_MS = 24 * 60 * 60 * 1000;
export const MAX_FOTOS_POR_TANDA = 30;
