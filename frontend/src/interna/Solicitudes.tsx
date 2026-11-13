/* Campanita de la barra: solicitudes de envío que llegan de la landing. La oficina las acepta poniendo el valor del
   domicilio (se le avisa al cliente por WhatsApp), marca cuándo el cliente está de acuerdo y las asigna a un mensajero. */
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { keepPreviousData, useQuery, useQueryClient } from "@tanstack/react-query";
import * as api from "../api/servicios";
import type { Solicitud, ListaSolicitudes, ConteoSolicitudes, GrupoSolicitud, PaginaSolicitudes, FiltrosSolicitudes, PaginaSolicitudesFiltradas, EstadoFiltroSolicitudes } from "../api/tipos";
import { mensajeDe } from "../api/cliente";
import { DEMO } from "./demo";
import { S, hora, pesos, linkWhatsApp, telWhatsApp } from "./motor";
import { Cab, useVentana } from "./ui";
import { WhatsAppIcon } from "../components/icons/WhatsAppIcon";

/* ---- Modo demo: las solicitudes viven en memoria ---- */
const ahora = Date.now();
let demo: Solicitud[] = [
  { id: "d0", estado: "pendiente", origen: "portal", nombre: "Variedades Luna (demo)", telefono: "300 000 0007", email: "luna@demo.co", direccionRecogida: "Calle 15 # 4-30, Cali", paquetes: 1, pesoKg: null, destinatarioNombre: "Sofía Ramos", destinatarioTelefono: "315 000 0008", direccionEntrega: "Cra 66 # 9-12, Cali", valor: null, motivoRechazo: "", clienteId: "demo-luna", clienteNombre: "Variedades Luna (demo)", clienteTarifa: 8000, mensajeroId: null, mensajeroNombre: null, guia: null, creado: new Date(ahora - 6 * 60_000).toISOString(), actualizado: new Date(ahora).toISOString() },
  { id: "d1", estado: "pendiente", nombre: "Laura Gómez (demo)", telefono: "300 000 0001", email: "laura@demo.co", direccionRecogida: "Cra 10 # 5-20, Cali", paquetes: 2, pesoKg: 3.5, destinatarioNombre: "Pedro Ruiz", destinatarioTelefono: "311 000 0002", direccionEntrega: "Calle 70 # 1-10, Cali", valor: null, motivoRechazo: "", clienteId: null, clienteNombre: null, clienteTarifa: null, origen: "publico", mensajeroId: null, mensajeroNombre: null, guia: null, creado: new Date(ahora - 18 * 60_000).toISOString(), actualizado: new Date(ahora).toISOString() },
  { id: "d2", estado: "confirmada", nombre: "Tienda Brisa (demo)", telefono: "300 000 0003", email: "brisa@demo.co", direccionRecogida: "Av 6N # 20-15, Cali", paquetes: 1, pesoKg: null, destinatarioNombre: "Marta Díaz", destinatarioTelefono: "", direccionEntrega: "Cra 100 # 14-30, Cali", valor: 9000, motivoRechazo: "", clienteId: null, clienteNombre: null, clienteTarifa: null, origen: "publico", mensajeroId: null, mensajeroNombre: null, guia: null, creado: new Date(ahora - 3 * 3600_000).toISOString(), actualizado: new Date(ahora).toISOString() },
  { id: "d3", estado: "cotizada", nombre: "Camila Torres (demo)", telefono: "300 000 0004", email: "camila@demo.co", direccionRecogida: "Calle 5 # 38-10, Cali", paquetes: 3, pesoKg: 6, destinatarioNombre: "Julián Mora", destinatarioTelefono: "", direccionEntrega: "Cra 1 # 62-20, Cali", valor: 12000, motivoRechazo: "", clienteId: null, clienteNombre: null, clienteTarifa: null, origen: "publico", mensajeroId: null, mensajeroNombre: null, guia: null, creado: new Date(ahora - 5 * 3600_000).toISOString(), actualizado: new Date(ahora).toISOString() },
  { id: "d4", estado: "asignada", nombre: "Papelería Sol (demo)", telefono: "300 000 0005", email: "sol@demo.co", direccionRecogida: "Cra 8 # 12-40, Cali", paquetes: 1, pesoKg: 1, destinatarioNombre: "Ana Vélez", destinatarioTelefono: "", direccionEntrega: "Av Roosevelt # 30-5, Cali", valor: 8000, motivoRechazo: "", clienteId: null, clienteNombre: "Papelería Sol (demo)", clienteTarifa: null, origen: "publico", mensajeroId: "demo", mensajeroNombre: "Carlos", guia: "JS-0042", creado: new Date(ahora - 26 * 3600_000).toISOString(), actualizado: new Date(ahora).toISOString() },
  { id: "d5", estado: "rechazada", nombre: "Pablo Ríos (demo)", telefono: "300 000 0006", email: "pablo@demo.co", direccionRecogida: "Jamundí, vereda La Meseta", paquetes: 4, pesoKg: null, destinatarioNombre: "Luz Mejía", destinatarioTelefono: "", direccionEntrega: "Palmira, centro", valor: null, motivoRechazo: "Fuera de la zona de cobertura", clienteId: null, clienteNombre: null, clienteTarifa: null, origen: "publico", mensajeroId: null, mensajeroNombre: null, guia: null, creado: new Date(ahora - 30 * 3600_000).toISOString(), actualizado: new Date(ahora).toISOString() },
];
const contar = (xs: Solicitud[]): ConteoSolicitudes => ({ pendiente: xs.filter(s => s.estado === "pendiente").length, cotizada: xs.filter(s => s.estado === "cotizada").length, confirmada: xs.filter(s => s.estado === "confirmada").length });
const abiertasDemo = (): ListaSolicitudes => { const xs = demo.filter(s => ["pendiente", "cotizada", "confirmada"].includes(s.estado)); return { solicitudes: xs, conteo: contar(xs) }; };
const cambiarDemo = (id: string, c: Partial<Solicitud>) => { demo = demo.map(s => (s.id === id ? { ...s, ...c } : s)); return demo.find(s => s.id === id)!; };

const ESTADOS_GRUPO: Record<GrupoSolicitud, string[]> = { todas: [], pendientes: ["pendiente"], "por-confirmar": ["cotizada"], aceptadas: ["confirmada", "asignada"], rechazadas: ["rechazada"] };
const paginaDemo = (grupo: GrupoSolicitud, pagina: number, porPagina: number): PaginaSolicitudes => {
  const en = (g: GrupoSolicitud) => demo.filter(s => !ESTADOS_GRUPO[g].length || ESTADOS_GRUPO[g].includes(s.estado));
  const xs = en(grupo).sort((a, b) => b.creado.localeCompare(a.creado));
  return { solicitudes: xs.slice((pagina - 1) * porPagina, pagina * porPagina), pagina, porPagina, total: xs.length, paginas: Math.max(1, Math.ceil(xs.length / porPagina)),
    grupos: { todas: demo.length, pendientes: en("pendientes").length, porConfirmar: en("por-confirmar").length, aceptadas: en("aceptadas").length, rechazadas: en("rechazadas").length } };
};
/** Una página de la pantalla de Solicitudes. Comparte la clave ["solicitudes"] con la campanita, así una acción refresca las dos. */
export const useSolicitudesPagina = (grupo: GrupoSolicitud, pagina: number, porPagina: number) => useQuery({
  queryKey: ["solicitudes", "pagina", grupo, pagina, porPagina],
  queryFn: () => (DEMO ? Promise.resolve(paginaDemo(grupo, pagina, porPagina)) : api.solicitudes.pagina(grupo, pagina, porPagina)),
  placeholderData: keepPreviousData, refetchInterval: 30_000, refetchOnWindowFocus: true,
});

/** La misma consulta filtrada de la oficina, aplicada en memoria únicamente en modo demo. */
function filtradasDemo(f: FiltrosSolicitudes): PaginaSolicitudesFiltradas {
  const buscar = f.search.trim().toLocaleLowerCase("es-CO");
  const base = demo.filter(s => {
    if (f.source !== "todos" && s.origen !== (f.source === "web" ? "publico" : "portal")) return false;
    if (f.date && new Intl.DateTimeFormat("sv-SE", { timeZone: "America/Bogota", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(s.creado)) !== f.date) return false;
    return !buscar || [s.nombre, s.destinatarioNombre, s.telefono, s.destinatarioTelefono, s.direccionRecogida, s.direccionEntrega, s.guia].some(x => x?.toLocaleLowerCase("es-CO").includes(buscar));
  });
  const estados: Record<EstadoFiltroSolicitudes, string[]> = { todas: [], pendientes: ["pendiente"], por_confirmar: ["cotizada"], aceptadas: ["confirmada", "asignada"], rechazadas: ["rechazada"] };
  const counts = Object.fromEntries((Object.keys(estados) as EstadoFiltroSolicitudes[]).map(k => [k, base.filter(s => !estados[k].length || estados[k].includes(s.estado)).length])) as Record<EstadoFiltroSolicitudes, number>;
  const filtradas = base.filter(s => !estados[f.status].length || estados[f.status].includes(s.estado)).sort((a, b) => b.creado.localeCompare(a.creado) || b.id.localeCompare(a.id));
  const totalItems = filtradas.length, totalPages = Math.max(1, Math.ceil(totalItems / f.limit)), page = Math.min(f.page, totalPages);
  return { data: filtradas.slice((page - 1) * f.limit, page * f.limit), pagination: { page, limit: f.limit, totalItems, totalPages }, counts };
}

export const useSolicitudesFiltradas = (f: FiltrosSolicitudes) => useQuery({
  queryKey: ["solicitudes", "filtradas", f],
  queryFn: () => (DEMO ? Promise.resolve(filtradasDemo(f)) : api.solicitudes.filtradas(f)),
  placeholderData: keepPreviousData, refetchInterval: 30_000, refetchOnWindowFocus: true,
});

const CLAVE = ["solicitudes", "abiertas"] as const;
export const useSolicitudes = (activo = true) => useQuery({
  enabled: activo,
  queryKey: CLAVE,
  queryFn: () => (DEMO ? Promise.resolve(abiertasDemo()) : api.solicitudes.abiertas()),
  refetchInterval: 30_000, refetchOnWindowFocus: true,
});

/** Mensaje de WhatsApp para el cliente con el valor del domicilio. */
export const mensajeCotizacion = (s: Solicitud) =>
  `Hola ${s.nombre.split(" ")[0]}, te escribimos de JS Logistics. Recibimos tu solicitud de recogida en ${s.direccionRecogida} para entregar en ${s.direccionEntrega} (${s.paquetes} ${s.paquetes === 1 ? "paquete" : "paquetes"}). El valor del domicilio es ${pesos(s.valor)}. ¿Estás de acuerdo? Respóndenos "sí" y enviamos a un mensajero.`;

export const IconoCampana = () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M6 9a6 6 0 0 1 12 0c0 6 2.5 7.5 2.5 7.5h-17S6 15 6 9z" /><path d="M10 20a2 2 0 0 0 4 0" /></svg>;

export function Campanita() {
  const { abrir } = useVentana();
  const { data } = useSolicitudes();
  const n = data ? data.conteo.pendiente + data.conteo.cotizada + data.conteo.confirmada : 0;
  const nuevas = data?.conteo.pendiente ?? 0;
  const txt = n ? `Solicitudes de envío: ${n} por atender${nuevas ? `, ${nuevas} nuevas` : ""}` : "Solicitudes de envío: ninguna por atender";
  return (
    <button type="button" className="campana" aria-label={txt} title={txt} onClick={() => abrir(<PanelSolicitudes />, "drawer-ancho")}>
      <IconoCampana />
      {n > 0 && <span className={"campana-num" + (nuevas ? " nueva" : "")} aria-hidden="true">{n > 9 ? "9+" : n}</span>}
    </button>
  );
}

function PanelSolicitudes() {
  const { data, isLoading, error } = useSolicitudes();
  const lista = data?.solicitudes ?? [];
  return <>
    <Cab sub={<small>Pedidos de recogida de la página web y del portal de clientes</small>}><h2>Solicitudes de envío</h2></Cab>
    <div className="solicitudes">
      {error && <div className="aviso alerta">{mensajeDe(error)}</div>}
      {isLoading && <div className="vacio" role="status">Cargando…</div>}
      {!isLoading && !error && !lista.length && <div className="vacio">No hay solicitudes por atender.</div>}
      {lista.map(s => <TarjetaSolicitud key={s.id} s={s} />)}
    </div>
  </>;
}

/** ¿La pidió un cliente con cuenta desde su portal y tiene un domicilio asignado? */
const tarifaDe = (s: Solicitud) => (s.origen === "portal" && s.clienteId && s.clienteTarifa ? s.clienteTarifa : 0);

export const ETQ: Record<string, [string, string]> = { pendiente: ["sin", "Nueva"], cotizada: ["pend", "Esperando al cliente"], confirmada: ["ent", "Cliente de acuerdo"], asignada: ["ent", "Asignada"], rechazada: ["gris", "Rechazada"] };

export function TarjetaSolicitud({ s, enDetalle = false, alCompletar }: { s: Solicitud; enDetalle?: boolean; alCompletar?: () => void }) {
  const qc = useQueryClient();
  const v = useVentana();
  const tarifa = tarifaDe(s);
  // Del portal: viene con el domicilio que ya tiene el cliente; la oficina lo puede cambiar para este pedido.
  const [valor, setValor] = useState(s.valor ? String(s.valor) : tarifa ? String(tarifa) : "");
  const [mensajero, setMensajero] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState("");
  // Rechazar pide la razón: el cliente la ve en "Mis solicitudes" de su portal.
  const [rechazando, setRechazando] = useState(false), [motivo, setMotivo] = useState("");
  const mensajeros = Object.values(S.mensajeros).filter(m => m.tipo === "mensajero" || m.tipo === "patinador");

  const correr = async (fn: () => Promise<unknown>, aviso: string) => {
    setOcupado(true); setError("");
    try { await fn(); await qc.invalidateQueries({ queryKey: ["solicitudes"] }); v.avisar(aviso); alCompletar?.(); }
    catch (e) { setError(mensajeDe(e)); }
    finally { setOcupado(false); }
  };
  const monto = Number(valor.replace(/\D/g, "")) || 0;
  // El servidor decide el paso siguiente: con el domicilio de siempre del cliente queda lista para asignar.
  const aceptar = async () => {
    setOcupado(true); setError("");
    try {
      const nueva = DEMO ? cambiarDemo(s.id, { estado: tarifa && monto === tarifa ? "confirmada" : "cotizada", valor: monto }) : await api.solicitudes.aceptar(s.id, monto);
      await qc.invalidateQueries({ queryKey: ["solicitudes"] });
      v.avisar(nueva.estado === "confirmada" ? "Solicitud aceptada con su domicilio de siempre. Asígnala a un mensajero." : "Solicitud aceptada. Envía el valor al cliente por WhatsApp.");
      // Si quedó confirmada, el aviso cambia a la tarjeta de asignación; si quedó cotizada, se cierra y espera al cliente.
      if (nueva.estado !== "confirmada") alCompletar?.();
    } catch (e) { setError(mensajeDe(e)); }
    finally { setOcupado(false); }
  };
  const confirmar = () => correr(async () => { if (DEMO) cambiarDemo(s.id, { estado: "confirmada" }); else await api.solicitudes.confirmar(s.id); }, "Listo: ya puedes asignarla a un mensajero.");
  const rechazar = () => { setRechazando(true); setError(""); };
  const confirmarRechazo = async () => {
    const m = motivo.trim();
    if (m.length < 3) { setError("Escribe la razón del rechazo: el cliente la va a ver."); return; }
    await correr(async () => { if (DEMO) cambiarDemo(s.id, { estado: "rechazada", motivoRechazo: m }); else await api.solicitudes.rechazar(s.id, m); }, "Solicitud rechazada.");
  };
  const asignar = () => correr(async () => {
    if (DEMO) cambiarDemo(s.id, { estado: "asignada", mensajeroId: mensajero });
    else { await api.solicitudes.asignar(s.id, mensajero); await qc.invalidateQueries({ queryKey: ["pedidos"] }); }
  }, "Asignada: el mensajero ya tiene la guía.");

  const [cls, etq] = ETQ[s.estado] ?? ["gris", s.estado];
  const wa = s.estado === "cotizada" ? linkWhatsApp(s.telefono, mensajeCotizacion(s)) : "";
  const hayTel = !!telWhatsApp(s.telefono);
  return (
    <article className={"solicitud" + (enDetalle ? " solicitud-en-detalle" : "")}>
      {!enDetalle && <><header><b>{s.nombre}</b><span className={"etq " + cls}>{etq}</span></header>
        {s.origen === "portal" && <span className="solicitud-origen">Cliente existente · la pidió desde su portal</span>}
        <small className="suave">{hora(new Date(s.creado).getTime())} · {s.telefono} · {s.email}</small></>}
      {enDetalle && <div className="sol-detalle-contacto"><a href={`tel:${s.telefono}`}>{s.telefono}</a>{s.email && <a href={`mailto:${s.email}`}>{s.email}</a>}</div>}
      <dl>
        <div><dt>Recoger en</dt><dd>{s.direccionRecogida}</dd></div>
        <div><dt>Entregar a</dt><dd>{s.destinatarioNombre}{s.destinatarioTelefono ? ` · ${s.destinatarioTelefono}` : ""}<br />{s.direccionEntrega}</dd></div>
        <div><dt>Paquetes</dt><dd>{s.paquetes}{s.pesoKg ? ` · ${s.pesoKg} kg` : ""}</dd></div>
        {s.origen === "portal" && s.estado !== "asignada" ? <div><dt>Remitente</dt><dd>{s.clienteNombre || "La ficha del cliente ya no existe: se creará una nueva"}</dd></div> : null}
        {s.valor ? <div><dt>Domicilio</dt><dd>{pesos(s.valor)}</dd></div> : null}
        {s.estado === "asignada" ? <div><dt>Asignada a</dt><dd>{s.mensajeroNombre || "—"}{s.guia ? ` · guía ${s.guia}` : ""}</dd></div> : null}
        {s.estado === "rechazada" && s.motivoRechazo ? <div><dt>Motivo</dt><dd>{s.motivoRechazo}</dd></div> : null}
      </dl>
      {error && <div className="aviso alerta" role="alert">{error}</div>}

      {rechazando && ["pendiente", "cotizada", "confirmada"].includes(s.estado) && <div className="form-modal solicitud-rechazo">
        <div className="campo">
          <label htmlFor={"mot" + s.id}>Razón del rechazo</label>
          <textarea id={"mot" + s.id} rows={2} maxLength={300} placeholder="Ej: No llegamos a esa zona" value={motivo} onChange={e => setMotivo(e.target.value)} aria-describedby={"motAyuda" + s.id} autoFocus />
          <small id={"motAyuda" + s.id} className="suave">El cliente la ve en su portal. No se le avisa por WhatsApp: escríbele tú si hace falta.</small>
        </div>
        <div className="acciones">
          <button className="btn peligro" disabled={ocupado || motivo.trim().length < 3} onClick={confirmarRechazo}>Rechazar solicitud</button>
          <button className="btn sec" disabled={ocupado} onClick={() => { setRechazando(false); setMotivo(""); setError(""); }}>Cancelar</button>
        </div>
      </div>}

      {s.estado === "pendiente" && <>
        <div className="form-modal"><div className="campo">
          <label htmlFor={"val" + s.id}>Valor del domicilio</label>
          <input id={"val" + s.id} inputMode="numeric" placeholder="Ej: 9.000" value={valor} onChange={e => setValor(e.target.value.replace(/[^\d.]/g, ""))} aria-describedby={tarifa ? "tar" + s.id : undefined} />
          {tarifa > 0 && <small id={"tar" + s.id} className="suave">
            {monto === tarifa
              ? `Es su domicilio asignado (${pesos(tarifa)}). Al aceptar pasa directo a asignar mensajero.`
              : `Su domicilio asignado es ${pesos(tarifa)}. Con otro valor tendrás que confirmarlo con el cliente por WhatsApp.`}
          </small>}
        </div></div>
        <div className="acciones">
          <button className="btn ok" disabled={ocupado || monto <= 0} onClick={aceptar}>Aceptar</button>
          {!rechazando && <button className="btn sec" disabled={ocupado} onClick={rechazar}>Rechazar</button>}
        </div>
      </>}

      {s.estado === "cotizada" && <>
        <p className="suave">Envíale el valor al cliente y, cuando responda que sí, márcalo.</p>
        <div className="acciones">
          {hayTel
            ? <a className="btn ok" href={wa} target="_blank" rel="noopener noreferrer"><WhatsAppIcon />Enviar valor por WhatsApp</a>
            : <span className="aviso alerta">El teléfono no sirve para WhatsApp: llámalo.</span>}
          <button className="btn" disabled={ocupado} onClick={confirmar}>El cliente está de acuerdo</button>
          {!rechazando && <button className="btn sec" disabled={ocupado} onClick={rechazar}>Rechazar</button>}
        </div>
      </>}

      {s.estado === "confirmada" && <>
        <div className="form-modal"><div className="campo">
          <label htmlFor={"men" + s.id}>Mensajero</label>
          <select id={"men" + s.id} value={mensajero} onChange={e => setMensajero(e.target.value)}>
            <option value="">Elige un mensajero…</option>
            {mensajeros.map(m => <option key={m.id} value={m.id}>{m.nombre}{m.tipo === "patinador" ? " (patinador)" : ""}</option>)}
          </select>
        </div></div>
        <div className="acciones">
          <button className="btn ok" disabled={ocupado || !mensajero} onClick={asignar}>Asignar y crear guía</button>
          {!rechazando && <button className="btn sec" disabled={ocupado} onClick={rechazar}>Rechazar</button>}
        </div>
      </>}
    </article>
  );
}

type AvisoOficina = { tipo: "nueva" | "confirmada"; s: Solicitud; clave: string };

const estadoDeAviso = (tipo: AvisoOficina["tipo"]) => tipo === "nueva" ? "pendiente" : "confirmada";
const claveDeAviso = (tipo: AvisoOficina["tipo"], s: Solicitud) => `${tipo}:${s.id}:${s.actualizado}`;
const fechaDeAviso = (s: Solicitud) => new Date(s.actualizado).getTime() || new Date(s.creado).getTime() || 0;

/** Aviso automático de la oficina: solicitud nueva o el cliente aceptó la propuesta desde su portal.
   Se muestran de a uno; el siguiente espera a que el anterior se cierre o se agoten los 10 s. */
export function AvisoSolicitud({ solicitudes }: { solicitudes?: Solicitud[] }) {
  const [actual, setActual] = useState<AvisoOficina | null>(null);
  const actualRef = useRef<AvisoOficina | null>(null);
  const previos = useRef<Map<string, string> | null>(null);
  const cola = useRef<AvisoOficina[]>([]);

  const mostrar = (a: AvisoOficina) => {
    if (actualRef.current) {
      if (actualRef.current.s.id === a.s.id) { actualRef.current = a; setActual(a); return; }
      const i = cola.current.findIndex(x => x.s.id === a.s.id);
      if (i >= 0) cola.current[i] = a;
      else cola.current.push(a);
      return;
    }
    actualRef.current = a;
    setActual(a);
  };
  const cerrar = () => {
    const siguiente = cola.current.shift() ?? null;
    actualRef.current = siguiente;
    setActual(siguiente);
  };
  // Cierra solo si ese aviso sigue en pantalla: el refresco y la acción del modal pueden coincidir.
  const cerrarDe = (id: string) => { if (actualRef.current?.s.id === id) cerrar(); };

  useEffect(() => {
    if (!solicitudes) return;
    const mapa = new Map(solicitudes.map(s => [s.id, s]));
    const versiones = new Map(solicitudes.map(s => [s.id, `${s.estado}:${s.actualizado}`]));
    if (previos.current === null) { previos.current = versiones; return; } // La primera carga no avisa de lo que ya existía.

    const eventos: AvisoOficina[] = [];
    for (const s of solicitudes) {
      const antes = previos.current.get(s.id);
      if (antes === undefined) {
        // Una solicitud nueva mientras la oficina está conectada.
        if (s.estado === "pendiente") eventos.push({ tipo: "nueva", s, clave: claveDeAviso("nueva", s) });
        continue;
      }
      const estadoAntes = antes.split(":")[0];
      // Quedó confirmada (el cliente aceptó en el portal o la oficina la aprobó): ventana para asignar mensajero.
      if (s.estado === "confirmada" && (estadoAntes === "pendiente" || estadoAntes === "cotizada")) {
        eventos.push({ tipo: "confirmada", s, clave: claveDeAviso("confirmada", s) });
      }
    }
    previos.current = versiones;
    eventos.sort((a, b) => fechaDeAviso(a.s) - fechaDeAviso(b.s));
    eventos.forEach(mostrar);

    cola.current = cola.current.filter(a => {
      const cur = mapa.get(a.s.id);
      return !!cur && cur.estado === estadoDeAviso(a.tipo);
    });

    const enPantalla = actualRef.current;
    if (!enPantalla) return;
    const ahora = mapa.get(enPantalla.s.id);
    const vigente = !!ahora && ahora.estado === estadoDeAviso(enPantalla.tipo);
    if (!vigente) { cerrar(); return; }
    if (ahora.actualizado !== enPantalla.s.actualizado) {
      const actualizado: AvisoOficina = { ...enPantalla, s: ahora, clave: claveDeAviso(enPantalla.tipo, ahora) };
      actualRef.current = actualizado;
      setActual(actualizado);
    }
  }, [solicitudes]);

  if (!actual) return null;
  return <ModalSolicitud key={actual.clave} aviso={actual} alCerrar={() => cerrarDe(actual.s.id)} />;
}

function ModalSolicitud({ aviso, alCerrar }: { aviso: AvisoOficina; alCerrar: () => void }) {
  const { s } = aviso;
  const esCliente = !!s.confirmadaPorCliente;
  const [restante, setRestante] = useState(100);
  const [detenido, setDetenido] = useState(false);
  const alCerrarRef = useRef(alCerrar);
  alCerrarRef.current = alCerrar;

  useEffect(() => {
    if (detenido) return;
    const inicio = performance.now();
    const id = window.setInterval(() => {
      const pct = Math.max(0, 100 - ((performance.now() - inicio) / 10_000) * 100);
      setRestante(pct);
      if (pct <= 0) { window.clearInterval(id); alCerrarRef.current(); }
    }, 50);
    return () => window.clearInterval(id);
  }, [detenido]);

  useEffect(() => {
    const anterior = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const tecla = (e: KeyboardEvent) => { if (e.key === "Escape") alCerrarRef.current(); };
    document.addEventListener("keydown", tecla);
    return () => { document.body.style.overflow = anterior; document.removeEventListener("keydown", tecla); };
  }, []);

  const detener = () => setDetenido(true);
  const segundos = Math.max(0, Math.ceil((restante / 100) * 10));
  const transcurrido = Math.round(10 - (restante / 100) * 10);
  const valor = s.valor != null ? pesos(s.valor) : "el domicilio propuesto";

  const destino = document.querySelector(".jsl") ?? document.body;
  return createPortal(
    <div className="modal-fondo aviso-solicitud-fondo">
      <div
        className="modal-caja aviso-solicitud"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={`aviso-solicitud-${s.id}`}
        onPointerDown={detener}
        onFocusCapture={detener}
        onKeyDown={detener}
        onChange={detener}
        onWheel={detener}
      >
        <button type="button" className="modal-cerrar" aria-label="Cerrar aviso de solicitud" onClick={alCerrar}>×</button>
        <header className="aviso-solicitud-cab">
          <span className="aviso-solicitud-eyebrow">{aviso.tipo === "nueva" ? "Solicitud nueva" : esCliente ? "El cliente aceptó" : "Solicitud confirmada"}</span>
          <h2 id={`aviso-solicitud-${s.id}`}>{aviso.tipo === "nueva" ? "Llegó una solicitud de envío" : esCliente ? "El cliente aceptó la propuesta" : "Solicitud lista para asignar"}</h2>
          <p className="modal-sub">
            {aviso.tipo === "nueva"
              ? "Revisa los datos y acepta o rechaza. También puedes verla después en la campana o en Solicitudes."
              : esCliente
                ? `Aceptó ${valor} desde el portal. Asigna el mensajero para dejar el pedido listo; si no, sigue en Solicitudes.`
                : `Quedó confirmada con ${valor}. Asigna el mensajero para dejar el pedido listo para recoger.`}
          </p>
        </header>
        <div className="aviso-solicitud-cuerpo"><TarjetaSolicitud s={s} alCompletar={alCerrar} /></div>
        <div className={`aviso-solicitud-progreso${detenido ? " detenido" : ""}`}>
          <div className="aviso-solicitud-barra" role="progressbar" aria-valuemin={0} aria-valuemax={10} aria-valuenow={transcurrido} aria-label="Tiempo antes de cerrar el aviso">
            <i style={{ width: `${restante}%` }} />
          </div>
          <small>{detenido ? "Tiempo detenido. Revisa la solicitud y ciérrala cuando termines." : `Se cierra en ${segundos} s.`}</small>
        </div>
      </div>
    </div>,
    destino
  );
}
