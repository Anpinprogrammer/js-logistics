/* Anotar el dinero que un cliente paga en la calle: formulario (cliente, concepto y valor) y lista de lo anotado.
   Lo usan el patinador (Mi caja) y el mensajero (Recepción → Recibir dinero); cada uno decide a qué endpoint va. */
import { useEffect, useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { FalloApi } from "../api/cliente";
import type { ClienteBreve, RegistroCajaPatinador } from "../api/tipos";
import { buscarRemitentes } from "./acciones";
import { motivoError } from "./datos";
import { useVentana } from "./ui";
import { hora, pesos } from "./motor";

const MAX_CONCEPTO = 80;

/** Pesos en texto ("25.000", "$ 25000") → entero. Vacío o inválido = 0. */
const aPesos = (t: string) => Number(t.replace(/\D/g, "")) || 0;
const conMiles = (t: string) => { const n = aPesos(t); return n ? n.toLocaleString("es-CO") : ""; };

/** Lo que anota un pago y el aviso que se muestra al guardarlo. */
export type Anotar = (d: { clienteId: string; clienteNombre: string; concepto: string; valor: number }) => Promise<string>;

/** Formulario "¿Quién te pagó? · Concepto · Valor". Lo usan el patinador (Mi caja) y el mensajero (Recepción → Recibir dinero). */
export function FormPago({ anotar: guardarPago, invalidar, titulo = "Anotar un pago", boton = "Anotar pago", deOtro = false }: { anotar: Anotar; invalidar: readonly unknown[]; titulo?: string; boton?: string; /** Administración anota por el patinador: "le pagó" en vez de "te pagó". */ deOtro?: boolean }) {
  const v = useVentana(), qc = useQueryClient(), te = deOtro ? "le" : "te";
  const [cliente, setCliente] = useState<ClienteBreve | null>(null);
  const [busca, setBusca] = useState(""), [abierto, setAbierto] = useState(false), [opciones, setOpciones] = useState<ClienteBreve[]>([]);
  const [concepto, setConcepto] = useState(""), [valor, setValor] = useState("");
  const comboRef = useRef<HTMLDivElement>(null);

  // Busca en el servidor (desde 2 letras) esperando a que deje de escribir.
  useEffect(() => {
    if (cliente || busca.trim().length < 2) { setOpciones([]); return; }
    let vigente = true;
    const t = setTimeout(() => { buscarRemitentes(busca).then(r => { if (vigente) setOpciones(r); }).catch(() => { if (vigente) setOpciones([]); }); }, 250);
    return () => { vigente = false; clearTimeout(t); };
  }, [busca, cliente]);
  useEffect(() => {
    const fuera = (e: PointerEvent) => { if (comboRef.current && !comboRef.current.contains(e.target as Node)) setAbierto(false); };
    document.addEventListener("pointerdown", fuera);
    return () => document.removeEventListener("pointerdown", fuera);
  }, []);

  const guardar = useMutation({
    mutationFn: guardarPago,
    onSuccess: aviso => {
      qc.invalidateQueries({ queryKey: invalidar });
      setCliente(null); setBusca(""); setConcepto(""); setValor("");
      v.avisar(aviso);
    },
    onError: e => v.avisar("No se pudo anotar: " + (e instanceof FalloApi ? e.message : motivoError(e)))
  });

  const enviar = (e: React.FormEvent) => {
    e.preventDefault();
    const n = aPesos(valor);
    if (!cliente) return v.avisar(`Elige el cliente que ${te} pagó`);
    if (!concepto.trim()) return v.avisar("Escribe el concepto");
    if (n <= 0) return v.avisar(`Escribe cuánto ${te} pagó`);
    guardar.mutate({ clienteId: cliente.id, clienteNombre: cliente.nombre, concepto: concepto.trim(), valor: n });
  };

  return (
    <form className="tarjeta form-pago" onSubmit={enviar} noValidate aria-label={titulo}>
      <h2>{titulo}</h2>
      <div className="campo">
        <label htmlFor="pgCliente">¿Quién {te} pagó?</label>
        <div className="combo-cliente" ref={comboRef}>
          {cliente
            ? <div className="combo-chip"><span><b>{cliente.nombre}</b></span><button type="button" onClick={() => { setCliente(null); setAbierto(true); }}>Cambiar</button></div>
            : <>
                <div className="combo-buscar">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="M20 20l-3.5-3.5" /></svg>
                  <input id="pgCliente" type="text" autoComplete="off" placeholder="Busca al cliente por nombre…" value={busca}
                    onFocus={() => setAbierto(true)} onChange={e => { setBusca(e.target.value); setAbierto(true); }} />
                </div>
                {abierto && busca.trim().length >= 2 ? <div className="combo-lista" role="listbox">
                  {opciones.map(c => <button type="button" key={c.id} role="option" aria-selected={false} className="combo-opcion" onClick={() => { setCliente(c); setBusca(c.nombre); setAbierto(false); }}>{c.nombre}</button>)}
                  {!opciones.length ? <span className="combo-vacio">No hay clientes con ese nombre.</span> : null}
                </div> : null}
              </>}
        </div>
      </div>
      <div className="campo">
        <label htmlFor="pgConcepto">Concepto</label>
        <input id="pgConcepto" type="text" maxLength={MAX_CONCEPTO} placeholder="Ej. Domicilios de la semana" value={concepto} onChange={e => setConcepto(e.target.value)} />
      </div>
      <div className="campo">
        <label htmlFor="pgValor">Valor recibido</label>
        <input id="pgValor" type="text" inputMode="numeric" autoComplete="off" placeholder="$ 0" value={valor ? "$ " + conMiles(valor) : ""} onChange={e => setValor(e.target.value)} />
      </div>
      <button type="submit" className="btn btn-pago" disabled={guardar.isPending}>{guardar.isPending ? "Guardando…" : boton}</button>
    </form>
  );
}

/** Lista de pagos anotados (cliente, concepto, hora y valor). */
export function Lista({ registros, cargando, vacio = "Todavía no has anotado pagos. Cuando un cliente te pague, anótalo arriba." }: { registros?: RegistroCajaPatinador[]; cargando: boolean; vacio?: string }) {
  if (cargando) return <div className="vacio" role="status">Cargando…</div>;
  if (!registros?.length) return <div className="vacio">{vacio}</div>;
  return <div className="lista lista-patinador">{registros.map(r => (
    <div className="fila fila-pago" key={r.id}>
      <span className="info"><b className="min-w-0">{r.clienteNombre}</b><p>{r.concepto} · {hora(Date.parse(r.fecha))}</p></span>
      <span className="n fila-pago-valor">{pesos(r.valor)}</span>
    </div>
  ))}</div>;
}
