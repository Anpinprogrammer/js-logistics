/* Campanita de la barra: solicitudes de envío que llegan de la landing. La oficina las acepta poniendo el valor del
   domicilio (se le avisa al cliente por WhatsApp), marca cuándo el cliente está de acuerdo y las asigna a un mensajero. */
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import * as api from "../api/servicios";
import type { Solicitud, ListaSolicitudes, ConteoSolicitudes } from "../api/tipos";
import { mensajeDe } from "../api/cliente";
import { DEMO } from "./demo";
import { S, hora, pesos, linkWhatsApp, telWhatsApp } from "./motor";
import { Cab, IconoWhatsApp, useVentana } from "./ui";

/* ---- Modo demo: las solicitudes viven en memoria ---- */
const ahora = Date.now();
let demo: Solicitud[] = [
  { id: "d1", estado: "pendiente", nombre: "Laura Gómez (demo)", telefono: "300 000 0001", email: "laura@demo.co", direccionRecogida: "Cra 10 # 5-20, Cali", paquetes: 2, pesoKg: 3.5, destinatarioNombre: "Pedro Ruiz", destinatarioTelefono: "311 000 0002", direccionEntrega: "Calle 70 # 1-10, Cali", valor: null, motivoRechazo: "", clienteId: null, clienteNombre: null, mensajeroId: null, mensajeroNombre: null, guia: null, creado: new Date(ahora - 18 * 60_000).toISOString(), actualizado: new Date(ahora).toISOString() },
  { id: "d2", estado: "confirmada", nombre: "Tienda Brisa (demo)", telefono: "300 000 0003", email: "brisa@demo.co", direccionRecogida: "Av 6N # 20-15, Cali", paquetes: 1, pesoKg: null, destinatarioNombre: "Marta Díaz", destinatarioTelefono: "", direccionEntrega: "Cra 100 # 14-30, Cali", valor: 9000, motivoRechazo: "", clienteId: null, clienteNombre: null, mensajeroId: null, mensajeroNombre: null, guia: null, creado: new Date(ahora - 3 * 3600_000).toISOString(), actualizado: new Date(ahora).toISOString() },
];
const contar = (xs: Solicitud[]): ConteoSolicitudes => ({ pendiente: xs.filter(s => s.estado === "pendiente").length, cotizada: xs.filter(s => s.estado === "cotizada").length, confirmada: xs.filter(s => s.estado === "confirmada").length });
const abiertasDemo = (): ListaSolicitudes => { const xs = demo.filter(s => ["pendiente", "cotizada", "confirmada"].includes(s.estado)); return { solicitudes: xs, conteo: contar(xs) }; };
const cambiarDemo = (id: string, c: Partial<Solicitud>) => { demo = demo.map(s => (s.id === id ? { ...s, ...c } : s)); return demo.find(s => s.id === id)!; };

const CLAVE = ["solicitudes", "abiertas"] as const;
export const useSolicitudes = () => useQuery({
  queryKey: CLAVE,
  queryFn: () => (DEMO ? Promise.resolve(abiertasDemo()) : api.solicitudes.abiertas()),
  refetchInterval: 30_000, refetchOnWindowFocus: true,
});

/** Mensaje de WhatsApp para el cliente con el valor del domicilio. */
export const mensajeCotizacion = (s: Solicitud) =>
  `Hola ${s.nombre.split(" ")[0]}, te escribimos de JS Logistics. Recibimos tu solicitud de recogida en ${s.direccionRecogida} para entregar en ${s.direccionEntrega} (${s.paquetes} ${s.paquetes === 1 ? "paquete" : "paquetes"}). El valor del domicilio es ${pesos(s.valor)}. ¿Estás de acuerdo? Respóndenos "sí" y enviamos a un mensajero.`;

const IconoCampana = () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M6 9a6 6 0 0 1 12 0c0 6 2.5 7.5 2.5 7.5h-17S6 15 6 9z" /><path d="M10 20a2 2 0 0 0 4 0" /></svg>;

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
    <Cab sub={<small>Pedidos de recogida que llegaron desde la página web</small>}><h2>Solicitudes de envío</h2></Cab>
    <div className="solicitudes">
      {error && <div className="aviso alerta">{mensajeDe(error)}</div>}
      {isLoading && <div className="vacio" role="status">Cargando…</div>}
      {!isLoading && !error && !lista.length && <div className="vacio">No hay solicitudes por atender.</div>}
      {lista.map(s => <TarjetaSolicitud key={s.id} s={s} />)}
    </div>
  </>;
}

const ETQ: Record<string, [string, string]> = { pendiente: ["sin", "Nueva"], cotizada: ["pend", "Esperando al cliente"], confirmada: ["ent", "Cliente de acuerdo"] };

function TarjetaSolicitud({ s }: { s: Solicitud }) {
  const qc = useQueryClient();
  const v = useVentana();
  const [valor, setValor] = useState(s.valor ? String(s.valor) : "");
  const [mensajero, setMensajero] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState("");
  const mensajeros = Object.values(S.mensajeros).filter(m => m.tipo === "mensajero");

  const correr = async (fn: () => Promise<unknown>, aviso: string) => {
    setOcupado(true); setError("");
    try { await fn(); await qc.invalidateQueries({ queryKey: ["solicitudes"] }); v.avisar(aviso); }
    catch (e) { setError(mensajeDe(e)); }
    finally { setOcupado(false); }
  };
  const monto = Number(valor.replace(/\D/g, "")) || 0;
  const aceptar = () => correr(async () => { if (DEMO) cambiarDemo(s.id, { estado: "cotizada", valor: monto }); else await api.solicitudes.aceptar(s.id, monto); }, "Solicitud aceptada. Envía el valor al cliente por WhatsApp.");
  const confirmar = () => correr(async () => { if (DEMO) cambiarDemo(s.id, { estado: "confirmada" }); else await api.solicitudes.confirmar(s.id); }, "Listo: ya puedes asignarla a un mensajero.");
  const rechazar = async () => {
    if (!(await v.confirmar("¿Rechazar la solicitud?", `Se descarta la solicitud de ${s.nombre}. No se le avisa por WhatsApp: escríbele tú si hace falta.`, "Rechazar"))) return;
    await correr(async () => { if (DEMO) cambiarDemo(s.id, { estado: "rechazada" }); else await api.solicitudes.rechazar(s.id, ""); }, "Solicitud rechazada.");
  };
  const asignar = () => correr(async () => {
    if (DEMO) cambiarDemo(s.id, { estado: "asignada", mensajeroId: mensajero });
    else { await api.solicitudes.asignar(s.id, mensajero); await qc.invalidateQueries({ queryKey: ["pedidos"] }); }
  }, "Asignada: el mensajero ya tiene la guía.");

  const [cls, etq] = ETQ[s.estado] ?? ["gris", s.estado];
  const wa = s.estado === "cotizada" ? linkWhatsApp(s.telefono, mensajeCotizacion(s)) : "";
  const hayTel = !!telWhatsApp(s.telefono);
  return (
    <article className="solicitud">
      <header><b>{s.nombre}</b><span className={"etq " + cls}>{etq}</span></header>
      <small className="suave">{hora(new Date(s.creado).getTime())} · {s.telefono} · {s.email}</small>
      <dl>
        <div><dt>Recoger en</dt><dd>{s.direccionRecogida}</dd></div>
        <div><dt>Entregar a</dt><dd>{s.destinatarioNombre}{s.destinatarioTelefono ? ` · ${s.destinatarioTelefono}` : ""}<br />{s.direccionEntrega}</dd></div>
        <div><dt>Paquetes</dt><dd>{s.paquetes}{s.pesoKg ? ` · ${s.pesoKg} kg` : ""}</dd></div>
        {s.valor ? <div><dt>Domicilio</dt><dd>{pesos(s.valor)}</dd></div> : null}
      </dl>
      {error && <div className="aviso alerta" role="alert">{error}</div>}

      {s.estado === "pendiente" && <>
        <div className="form-modal"><div className="campo">
          <label htmlFor={"val" + s.id}>Valor del domicilio</label>
          <input id={"val" + s.id} inputMode="numeric" placeholder="Ej: 9.000" value={valor} onChange={e => setValor(e.target.value.replace(/[^\d.]/g, ""))} />
        </div></div>
        <div className="acciones">
          <button className="btn ok" disabled={ocupado || monto <= 0} onClick={aceptar}>Aceptar</button>
          <button className="btn sec" disabled={ocupado} onClick={rechazar}>Rechazar</button>
        </div>
      </>}

      {s.estado === "cotizada" && <>
        <p className="suave">Envíale el valor al cliente y, cuando responda que sí, márcalo.</p>
        <div className="acciones">
          {hayTel
            ? <a className="btn ok" href={wa} target="_blank" rel="noopener noreferrer"><IconoWhatsApp />Enviar valor por WhatsApp</a>
            : <span className="aviso alerta">El teléfono no sirve para WhatsApp: llámalo.</span>}
          <button className="btn" disabled={ocupado} onClick={confirmar}>El cliente está de acuerdo</button>
          <button className="btn sec" disabled={ocupado} onClick={rechazar}>Rechazar</button>
        </div>
      </>}

      {s.estado === "confirmada" && <>
        <div className="form-modal"><div className="campo">
          <label htmlFor={"men" + s.id}>Mensajero</label>
          <select id={"men" + s.id} value={mensajero} onChange={e => setMensajero(e.target.value)}>
            <option value="">Elige un mensajero…</option>
            {mensajeros.map(m => <option key={m.id} value={m.id}>{m.nombre}</option>)}
          </select>
        </div></div>
        <div className="acciones">
          <button className="btn ok" disabled={ocupado || !mensajero} onClick={asignar}>Asignar y crear guía</button>
          <button className="btn sec" disabled={ocupado} onClick={rechazar}>Rechazar</button>
        </div>
      </>}
    </article>
  );
}
