/* Llamadas al backend, agrupadas por recurso. */
import { api } from "./cliente";
import type { GrupoSolicitud, PaginaSolicitudes, FiltrosSolicitudes, PaginaSolicitudesFiltradas, Archivo, TipoArchivo, Cliente, ClienteBreve, Mensajero, Movimiento, Pedido, Usuario, Motivo, MetodoEntrega, Rol, TipoPersonal, Medio, EstadoPedido,
  Recaudo, Liquidacion, Jornada, CajaMovimiento, CuentaInterna, Cambio, EnPapelera, PaginaPedidos, EnlaceCorreo, PaginaClientes, PaginaMovimientos, PaginaGanancias, PaginaCajaMovimientos, PaginaUsuarios, AccesoCreado, PaginaHistorial, PaginaLiquidaciones, PaginaPersonal, Solicitud, ListaSolicitudes, CajaPatinador, RegistroCajaPatinador, ResumenCajaPatinador, ResumenPatinador } from "./tipos";
import { FalloApi } from "./cliente";

const datos = <T>(p: Promise<{ data: T }>) => p.then(r => r.data);

export const auth = {
  yo: () => datos<{ usuario: Usuario }>(api.get("/auth/yo")).then(d => d.usuario),
  ingresar: (email: string, clave: string) => datos<{ usuario: Usuario }>(api.post("/auth/ingresar", { email, clave })).then(d => d.usuario),
  salir: () => api.post("/auth/salir"),
  cambiarClave: (claveActual: string, claveNueva: string) => api.post("/auth/clave", { claveActual, claveNueva }),
  /** Pide por correo un enlace de activación o de contraseña. Responde 204 exista o no la cuenta. */
  recuperar: (email: string) => api.post("/auth/recuperar", { email }),
  /** Revisa el enlace antes de mostrar el formulario. */
  enlace: (token: string) =>
    datos<{ enlace: EnlaceCorreo }>(api.get(`/auth/enlace/${encodeURIComponent(token)}`)).then(d => d.enlace),
  restablecer: (token: string, clave: string) => api.post("/auth/restablecer", { token, clave }),
  activar: (token: string, clave: string) => api.post("/auth/activar", { token, clave }),
  activarCuenta: (token: string, newPassword: string) => api.post("/auth/activate-account", { token, newPassword })
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
  /** 1 a 1000. */
  limite?: number;
  cursor?: number;
  /** No firmar las miniaturas (`mini` llega en null): para la carga completa de la oficina. */
  sinMini?: boolean;
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
  /** Recoger una guía "aceptado" (de una solicitud): con la foto de salida ya subida, pasa a en ruta. */
  recoger: (guia: string) => datos<{ pedido: Pedido }>(api.post(`/pedidos/${guia}/recogida`)).then(r => r.pedido),
  entregar: (guia: string, d: DatosEntrega) => datos<{ pedido: Pedido }>(api.post(`/pedidos/${guia}/entrega`, d)).then(r => r.pedido),
  noEntregado: (guia: string, d: { motivo: Motivo; nota: string }) =>
    datos<{ pedido: Pedido }>(api.post(`/pedidos/${guia}/no-entregado`, d)).then(r => r.pedido),
  /** El mensajero pone el remitente de su guía nueva (solo si todavía no tiene). */
  remitente: (guia: string, clienteId: string) => datos<{ pedido: Pedido }>(api.patch(`/pedidos/${guia}/remitente`, { clienteId })).then(r => r.pedido),
  corregir: (guia: string, d: Partial<DatosEntrega> & { motivoDev?: Motivo; notaDev?: string }) =>
    datos<{ pedido: Pedido }>(api.patch(`/pedidos/${guia}/correccion`, d)).then(r => r.pedido),
  eliminar: (guia: string) => api.delete(`/pedidos/${guia}`),
  cambioRecibido: (guia: string) => datos<{ pedido: Pedido }>(api.post(`/pedidos/${guia}/cambio-recibido`)).then(r => r.pedido),
  /** Devuelve una guía entregada o devuelta a "por entregar" (solo administración). Las pruebas quedan como "previas". */
  reabrir: (guia: string) => datos<{ pedido: Pedido }>(api.post(`/pedidos/${guia}/reabrir`)).then(r => r.pedido),
  /** Dónde quedó el paquete de un devuelto: con el cliente o en la oficina. */
  destinoDevolucion: (guia: string, destino: "cliente" | "oficina") =>
    datos<{ pedido: Pedido }>(api.post(`/pedidos/${guia}/destino-devolucion`, { destino })).then(r => r.pedido),
  /** Crea la guía del reintento de un devuelto. El mensajero no manda nada (es suyo); la oficina elige quién lo hace. */
  reintentar: (guia: string, mensajeroId?: string) =>
    datos<{ pedido: Pedido; reintento: Pedido }>(api.post(`/pedidos/${guia}/reintento`, mensajeroId ? { mensajeroId } : {})),
  archivos: (guia: string) => datos<{ archivos: Archivo[] }>(api.get(`/pedidos/${guia}/archivos`)).then(d => d.archivos),
  /** La imagen va como cuerpo binario (ya comprimida en el celular), una por petición. */
  subirArchivo: (guia: string, tipo: Exclude<TipoArchivo, "previa">, imagen: Blob) =>
    datos<{ archivo: Archivo }>(api.post(`/pedidos/${guia}/archivos/${tipo}`, imagen, {
      headers: { "Content-Type": imagen.type || "image/jpeg" }, timeout: 60_000
    })).then(d => d.archivo)
};

export const clientes = {
  /** Búsqueda corta para elegir el remitente desde la recogida: solo nombre e id (también para el mensajero). */
  buscar: (q: string) => datos<{ clientes: ClienteBreve[] }>(api.get("/clientes/buscar", { params: { q } })).then(d => d.clientes),
  listar: (buscar = "") => datos<{ clientes: Cliente[] }>(api.get("/clientes", { params: limpio({ buscar, limite: 500 }) })).then(d => d.clientes),
  /** Un pedazo de la lista completa (la carga de la app interna los recorre todos). */
  listarDesde: (desde: number, limite = 500) => datos<{ clientes: Cliente[] }>(api.get("/clientes", { params: { desde, limite } })).then(d => d.clientes),
  /** Una página de la pestaña Clientes, con saldos y totales calculados por el servidor. */
  pagina: (f: { filtro?: string; dia?: string; buscar?: string }, pagina: number, porPagina: number) =>
    datos<PaginaClientes>(api.get("/clientes/saldos", { params: limpio({ ...f, pagina, porPagina }) })),
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
  /** Personal JS paginado y filtrado en el servidor: 4 en celular y 7 en computador. */
  pagina: (f: { buscar?: string; tipo?: string }, pagina: number, porPagina: number) =>
    opcional(datos<PaginaPersonal>(api.get("/mensajeros/pagina", { params: { ...f, pagina, porPagina } })), { mensajeros: [], pagina: 1, porPagina, total: 0, paginas: 1 }),
  obtener: (id: string) => datos<{ mensajero: Mensajero }>(api.get(`/mensajeros/${id}`)).then(d => d.mensajero),
  crear: (d: { nombre: string; telefono: string; tipo: TipoPersonal; tarifa: number }) =>
    datos<{ mensajero: Mensajero }>(api.post("/mensajeros", d)).then(r => r.mensajero),
  actualizar: (id: string, d: Partial<Omit<Mensajero, "id">>) => datos<{ mensajero: Mensajero }>(api.patch(`/mensajeros/${id}`, d)).then(r => r.mensajero),
  eliminar: (id: string) => api.delete(`/mensajeros/${id}`)
};

export const patinador = {
  /** Su caja: el total y los registros de la página (8 en celular, 20 en computador). */
  caja: (pagina: number, porPagina: number) => datos<CajaPatinador>(api.get("/patinador/caja", { params: { pagina, porPagina } })),
  /** Oficina: cuánto recibió cada patinador, cuánto ya entregó y cuánto debe. */
  resumen: () => datos<{ patinadores: ResumenPatinador[] }>(api.get("/patinador/resumen")).then(d => d.patinadores),
  /** Anota un pago. La hora y el patinador los pone el servidor. */
  registrar: (d: { clienteId: string; concepto: string; valor: number }) =>
    datos<{ registro: RegistroCajaPatinador; resumen: ResumenCajaPatinador }>(api.post("/patinador/caja", d))
};

/** Recepción → Recibir dinero del mensajero: misma forma que la caja del patinador. */
export const recibidos = {
  /** Lo que ha recibido (el servidor pone el mensajero si quien pide es mensajero; la oficina o un admin dicen cuál). */
  listar: (pagina: number, porPagina: number, mensajeroId?: string) =>
    datos<CajaPatinador>(api.get("/movimientos/recibidos", { params: limpio({ pagina, porPagina, mensajeroId }) })),
  /** Anota un pago de un cliente. Efectivo y con la hora del servidor; abona a la cuenta del cliente. */
  registrar: (d: { clienteId: string; concepto: string; valor: number; medio: Medio; mensajeroId?: string }) =>
    datos<{ movimiento: Movimiento; clienteNombre: string; saldoCliente: number; debe: number }>(api.post("/movimientos/recibidos", d))
};

export const usuarios = {
  listar: () => datos<{ usuarios: Usuario[] }>(api.get("/usuarios")).then(d => d.usuarios),
  /** Sub-pestaña Acceso de Personal: búsqueda, rol y 5 filas en celular, 10 en computador. */
  pagina: (f: { buscar?: string; rol?: Rol }, pagina: number, porPagina: number) =>
    datos<PaginaUsuarios>(api.get("/usuarios/pagina", { params: { ...f, pagina, porPagina } })),
  crear: (d: { email: string; role?: Rol; entityId?: string; nombre?: string; rol?: Rol; clave?: string; clienteId?: string | null; mensajeroId?: string | null }) =>
    datos<AccesoCreado>(api.post("/usuarios", d)),
  actualizar: (id: string, d: { nombre?: string; rol?: Rol; clienteId?: string | null; mensajeroId?: string | null; activo?: boolean }) =>
    datos<{ usuario: Usuario }>(api.patch(`/usuarios/${id}`, d)).then(r => r.usuario),
  cambiarClave: (id: string, clave: string) => api.put(`/usuarios/${id}/clave`, { clave }),
  /** Manda a la cuenta el enlace de restablecimiento por correo (Resend). */
  enviarReset: (d: { usuarioId?: string; email?: string }) =>
    datos<{ enviado: boolean; email: string }>(api.post("/auth/send-reset-email", d)),
  /** Encola el envío masivo de enlaces de restablecimiento (Redis/BullMQ o segundo plano local). */
  enviarResetMasivo: (emails: string[]) =>
    datos<{ mensaje: string; total: number; modo: "redis" | "memoria" }>(api.post("/auth/send-bulk-reset-emails", { emails })),
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
export const movimientos = {
  ...coleccion<Movimiento, Sin<Movimiento>>("/movimientos", "movimientos", "movimiento"),
  /** Una página de la pestaña Movimientos de Cuentas; el servidor filtra, cuenta y corta. */
  pagina: (f: { buscar?: string; tipo?: string; desde?: string; hasta?: string }, pagina: number, porPagina: number) =>
    datos<PaginaMovimientos>(api.get("/movimientos/pagina", { params: limpio({ ...f, pagina, porPagina }) })),
  /** Ganancias por cliente (pestaña Ganancias de Cuentas). */
  ganancias: (f: { buscar?: string; desde?: string; hasta?: string }, pagina: number, porPagina: number) =>
    datos<PaginaGanancias>(api.get("/movimientos/ganancias", { params: limpio({ ...f, pagina, porPagina }) }))
};
export const recaudos = coleccion<Recaudo, Sin<Recaudo>>("/recaudos", "recaudos", "recaudo");
export const liquidaciones = {
  ...coleccion<Liquidacion, Partial<Liquidacion>>("/liquidaciones", "liquidaciones", "liquidacion"),
  /** Cierres recientes filtrados y paginados: 5 en celular y 9 en computador. */
  pagina: (f: { dia?: string; estado?: string; buscar?: string }, pagina: number, porPagina: number) =>
    opcional(datos<PaginaLiquidaciones>(api.get("/liquidaciones/pagina", { params: { ...f, pagina, porPagina } })), { liquidaciones: [], pagina: 1, porPagina, total: 0, paginas: 1 })
};
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
  /** Movimientos de las cuentas internas, por páginas y con filtros de día y medio. */
  movimientosPagina: (f: { dia?: string; medio?: string }, pagina: number, porPagina: number) =>
    datos<PaginaCajaMovimientos>(api.get("/caja/movimientos/pagina", { params: limpio({ ...f, pagina, porPagina }) })),
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
  /** Historial paginado en el servidor: 5 en celular y 13 en computador. */
  pagina: (desde: string, buscar: string, pagina: number, porPagina: number) =>
    opcional(datos<PaginaHistorial>(api.get("/historial", { params: { desde, buscar: buscar || undefined, pagina, porPagina } })), { cambios: [], pagina: 1, porPagina, total: 0, paginas: 1 }),
  papelera: () => opcional(datos<{ papelera: EnPapelera[] }>(api.get("/papelera")).then(d => d.papelera), [] as EnPapelera[]),
  restaurar: (id: string) => api.post(`/papelera/${id}/restaurar`),
  eliminarDefinitivo: (id: string) => api.delete(`/papelera/${id}`)
};

/** Solicitudes de envío de la landing: la oficina las acepta (con valor), confirma, rechaza o asigna. */
export const solicitudes = {
  abiertas: () => datos<ListaSolicitudes>(api.get("/solicitudes", { params: { abiertas: true } })),
  pagina: (grupo: GrupoSolicitud, pagina: number, porPagina: number) => datos<PaginaSolicitudes>(api.get("/solicitudes", { params: { grupo, pagina, porPagina } })),
  filtradas: (filtros: FiltrosSolicitudes) => datos<PaginaSolicitudesFiltradas>(api.get("/solicitudes", { params: { ...filtros, search: filtros.search || undefined, date: filtros.date || undefined } })),
  aceptar: (id: string, valor: number) => datos<{ solicitud: Solicitud }>(api.post(`/solicitudes/${id}/aceptar`, { valor })).then(d => d.solicitud),
  confirmar: (id: string) => datos<{ solicitud: Solicitud }>(api.post(`/solicitudes/${id}/confirmar`)).then(d => d.solicitud),
  rechazar: (id: string, motivo: string) => datos<{ solicitud: Solicitud }>(api.post(`/solicitudes/${id}/rechazar`, { motivo })).then(d => d.solicitud),
  /** Crea la guía para ese mensajero. Sin clienteId, el backend crea el cliente con los datos de la solicitud. */
  asignar: (id: string, mensajeroId: string, clienteId?: string) =>
    datos<{ solicitud: Solicitud; pedido: Pedido }>(api.post(`/solicitudes/${id}/asignar`, { mensajeroId, clienteId }))
};
