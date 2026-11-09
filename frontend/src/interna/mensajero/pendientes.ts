/* Pedidos por entregar del mensajero. Va aparte para que el menú (Marco) cuente los pendientes sin descargar toda la pantalla del mensajero. */
import { E } from "../estado";
import { S } from "../motor";

export const pendientesMios = () => Object.values(S.pedidos).filter(p => p.estado === "pendiente" && p.mensajeroId === E.miMensajero).sort((a, b) => a.creado - b.creado);
