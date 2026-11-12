/* Pedidos por entregar (en ruta) y por recoger (guías de solicitudes sin foto) del mensajero. Va aparte para que el menú (Marco) cuente los pendientes sin descargar toda la pantalla del mensajero. */
import { E } from "../estado";
import { S } from "../motor";

export const pendientesMios = () => Object.values(S.pedidos).filter(p => p.estado === "pendiente" && p.mensajeroId === E.miMensajero).sort((a, b) => a.creado - b.creado);
/** Guías "aceptado": salieron de una solicitud y el mensajero todavía no las recoge (falta la foto del paquete). */
export const porRecogerMios = () => Object.values(S.pedidos).filter(p => p.estado === "aceptado" && p.mensajeroId === E.miMensajero).sort((a, b) => a.creado - b.creado);
