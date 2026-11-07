/* Oficina: detalle de una guía. Asignar remitente y valores, revisar diferencias, corregir (admin) y borrar (admin). */
import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { mensajeros, pedidos, type CambiosPedido } from "../../api/servicios";
import { FalloApi, mensajeDe } from "../../api/cliente";
import type { Medio, MetodoEntrega, Pedido } from "../../api/tipos";
import { useUsuario } from "../../auth/Sesion";
import { METODOS, MOTIVOS, aPesos, fechaHora, metodoTexto, pesos } from "../../lib/formato";
import { Aviso, Boton, Campo, Cargando, Casilla, Dato, Dialogo, EtiquetaEstado, Selector } from "../../components/ui";
import BuscarCliente from "../../components/BuscarCliente";
import { DialogoEntrega, DialogoNoEntregado } from "../../components/Entrega";
import { useAviso } from "../../components/Avisos";

export default function PedidoDetalle() {
  const { guia = "" } = useParams();
  const q = useQuery({ queryKey: ["pedidos", "detalle", guia], queryFn: () => pedidos.obtener(guia) });
  if (q.isPending) return <Cargando />;
  if (q.error) return <Aviso tipo="error">{q.error instanceof FalloApi && q.error.status === 404 ? `La guía ${guia} no existe.` : mensajeDe(q.error)}</Aviso>;
  return <Detalle key={q.data.guia + q.data.estado} p={q.data} />;
}

function Detalle({ p }: { p: Pedido }) {
  const u = useUsuario(), qc = useQueryClient(), avisar = useAviso(), ir = useNavigate();
  const esAdmin = u.rol === "admin";
  const mens = useQuery({ queryKey: ["mensajeros"], queryFn: () => mensajeros.listar() });

  const [cliente, setCliente] = useState<{ id: string | null; nombre: string | null }>({ id: p.clienteId, nombre: p.clienteNombre });
  const [mid, setMid] = useState(p.mensajeroId);
  const [servicio, setServicio] = useState(String(p.valorServicio || ""));
  const [aCobrar, setACobrar] = useState(String(p.aCobrar || ""));
  const [gasto, setGasto] = useState(String(p.gasto || ""));
  const [gastoNota, setGastoNota] = useState(p.gastoNota);
  const [cobrarDev, setCobrarDev] = useState(p.cobrarDev);
  const [domi, setDomi] = useState(p.domiPagado);
  const [domiMedio, setDomiMedio] = useState<Medio | "">(p.domiPagoMedio ?? "");
  const [domiValor, setDomiValor] = useState(String(p.domiPagoValor ?? ""));
  const [valCob, setValCob] = useState(String(p.valorCobrado));
  const [metodo, setMetodo] = useState<MetodoEntrega>(p.metodo && p.metodo !== "devuelto" ? p.metodo : "efectivo");
  const [cuenta, setCuenta] = useState(p.cuentaJs);
  const [entregar, setEntregar] = useState(false);
  const [noEnt, setNoEnt] = useState(false);
  const [borrar, setBorrar] = useState(false);

  useEffect(() => { document.title = `${p.guia} · JS Logistics`; return () => { document.title = "JS Logistics"; }; }, [p.guia]);

  const refrescar = () => qc.invalidateQueries({ queryKey: ["pedidos"] });
  const guardar = useMutation({
    mutationFn: (d: CambiosPedido) => pedidos.actualizar(p.guia, d),
    onSuccess: () => { avisar(`Guía ${p.guia} actualizada`); refrescar(); }
  });
  const eliminar = useMutation({
    mutationFn: () => pedidos.eliminar(p.guia),
    onSuccess: () => { avisar(`Guía ${p.guia} enviada a la papelera`); refrescar(); ir("/pedidos"); }
  });

  const enviar = (e: React.FormEvent) => {
    e.preventDefault();
    const d: CambiosPedido = {
      clienteId: cliente.id, mensajeroId: mid, valorServicio: aPesos(servicio), aCobrar: aPesos(aCobrar),
      gasto: aPesos(gasto), gastoNota: gastoNota.trim(), domiPagado: domi,
      ...(domi ? { domiPagoMedio: domiMedio as Medio, domiPagoValor: aPesos(domiValor) } : {}),
      ...(p.estado === "devuelto" ? { cobrarDev } : {})
    };
    if (esAdmin && p.estado === "entregado") Object.assign(d, { valorCobrado: aPesos(valCob), metodo, cuentaJs: metodo === "transf_js" ? cuenta : "" });
    guardar.mutate(d);
  };

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <Link to="/pedidos" className="text-sm text-marca">‹ Pedidos</Link>
        <h1 className="text-2xl font-bold">{p.guia}</h1><EtiquetaEstado p={p} />
      </div>

      {p.difCobro !== 0 && !p.difRevisada && (
        <div className="mb-4 flex flex-wrap items-center gap-3">
          <Aviso tipo="alerta">Debía cobrar {pesos(p.estado === "entregado" && p.metodo === "transf_cliente" ? 0 : p.aCobrar)} y cobró {pesos(p.valorCobrado)}: diferencia de <b>{pesos(p.difCobro)}</b>.</Aviso>
          <Boton variante="secundario" chico cargando={guardar.isPending} onClick={() => guardar.mutate({ difRevisada: true })}>Marcar como revisada</Boton>
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_1.2fr]">
        <section className="caja p-5">
          <h2 className="mb-2 font-bold">Datos</h2>
          <dl>
            <Dato k="Salida">{fechaHora(p.creado)}</Dato>
            <Dato k="Mensajero">{p.mensajeroNombre}</Dato>
            <Dato k="Remitente">{p.clienteNombre || <span className="text-ambar">Sin asignar</span>}</Dato>
            {p.estado !== "pendiente" && <>
              <Dato k={p.estado === "entregado" ? "Entregado" : "Devuelto"}>{fechaHora(p.entregado)}</Dato>
              {p.estado === "entregado" && <Dato k="Recibió">{p.destinatario}</Dato>}
              <Dato k="Pago">{metodoTexto(p)}</Dato>
              {p.estado === "entregado" && <Dato k="Cobrado">{pesos(p.valorCobrado)}</Dato>}
              {p.notaDev && <Dato k="Nota">{p.notaDev}</Dato>}
            </>}
            {p.gasto > 0 && <Dato k="Flete">{pesos(p.gasto)}{p.gastoNota && ` · ${p.gastoNota}`}</Dato>}
            {p.cambio && <Dato k="Prenda de cambio">{p.cambioRecibido ? `Recibida ${fechaHora(p.cambioRecibido)}` : "Pendiente de recibir"}</Dato>}
          </dl>
          {p.intentos.length > 0 && (
            <div className="mt-4">
              <h3 className="mb-1 text-sm font-semibold">Intentos fallidos</h3>
              <ul className="space-y-1 text-sm text-suave">
                {p.intentos.map((i, k) => <li key={k}>{fechaHora(i.fecha)} · {MOTIVOS[i.motivo]}{i.nota && ` · ${i.nota}`}</li>)}
              </ul>
            </div>
          )}
          {p.estado === "pendiente" && (
            <div className="mt-5 flex gap-2">
              <Boton className="flex-1" onClick={() => setEntregar(true)}>Registrar entrega</Boton>
              <Boton variante="secundario" className="flex-1" onClick={() => setNoEnt(true)}>No se pudo</Boton>
            </div>
          )}
        </section>

        <form className="caja space-y-4 p-5" onSubmit={enviar}>
          <h2 className="font-bold">Remitente y valores</h2>
          <BuscarCliente valor={cliente.id} nombreActual={cliente.nombre} onElegir={c => {
            setCliente({ id: c?.id ?? null, nombre: c?.nombre ?? null });
            if (c && !aPesos(servicio)) setServicio(String(c.tarifa || ""));
          }} />
          <Selector etiqueta="Mensajero" value={mid} onChange={e => setMid(e.target.value)}>
            {mens.data?.map(m => <option key={m.id} value={m.id}>{m.nombre}</option>)}
            {!mens.data && <option value={p.mensajeroId}>{p.mensajeroNombre}</option>}
          </Selector>
          <div className="grid gap-3 sm:grid-cols-2">
            <Campo etiqueta="Domicilio" inputMode="numeric" value={servicio} onChange={e => setServicio(e.target.value)} />
            <Campo etiqueta="A cobrar al destinatario" inputMode="numeric" value={aCobrar} onChange={e => setACobrar(e.target.value)} />
            <Campo etiqueta="Flete" inputMode="numeric" value={gasto} onChange={e => setGasto(e.target.value)} />
            <Campo etiqueta="Detalle del flete" value={gastoNota} onChange={e => setGastoNota(e.target.value)} />
          </div>
          {p.estado === "devuelto" && <Casilla etiqueta="Cobrarle al cliente el domicilio de esta devolución" checked={cobrarDev} onChange={setCobrarDev} />}
          <Casilla etiqueta="El cliente pagó el domicilio aparte" checked={domi} onChange={setDomi} />
          {domi && (
            <div className="grid gap-3 sm:grid-cols-2">
              <Selector etiqueta="¿Cómo pagó?" value={domiMedio} onChange={e => setDomiMedio(e.target.value as Medio)} required>
                <option value="">Elige…</option><option value="efectivo">Efectivo</option><option value="nequi">Nequi</option><option value="bancolombia">Bancolombia</option>
              </Selector>
              <Campo etiqueta="Valor pagado" inputMode="numeric" value={domiValor} onChange={e => setDomiValor(e.target.value)} required />
            </div>
          )}
          {esAdmin && p.estado === "entregado" && (
            <fieldset className="space-y-3 rounded-xl border border-linea p-3">
              <legend className="px-1 text-sm font-semibold">Corregir lo cobrado (administración)</legend>
              <div className="grid gap-3 sm:grid-cols-2">
                <Selector etiqueta="Método" value={metodo} onChange={e => setMetodo(e.target.value as MetodoEntrega)}>
                  {Object.entries(METODOS).map(([k, t]) => <option key={k} value={k}>{t}</option>)}
                </Selector>
                <Campo etiqueta="Valor cobrado" inputMode="numeric" value={valCob} onChange={e => setValCob(e.target.value)} />
                {metodo === "transf_js" && (
                  <Selector etiqueta="Cuenta" value={cuenta} onChange={e => setCuenta(e.target.value as "nequi")}>
                    <option value="">Elige…</option><option value="nequi">Nequi</option><option value="bancolombia">Bancolombia</option>
                  </Selector>
                )}
              </div>
            </fieldset>
          )}
          {guardar.error && <Aviso tipo="error">{mensajeDe(guardar.error)}</Aviso>}
          <div className="flex flex-wrap gap-2">
            <Boton type="submit" cargando={guardar.isPending}>Guardar</Boton>
            {esAdmin && <Boton type="button" variante="peligro" onClick={() => setBorrar(true)}>Eliminar guía</Boton>}
          </div>
        </form>
      </div>

      {entregar && <DialogoEntrega pedido={p} alCerrar={() => setEntregar(false)} />}
      {noEnt && <DialogoNoEntregado pedido={p} alCerrar={() => setNoEnt(false)} />}
      <Dialogo abierto={borrar} alCerrar={() => setBorrar(false)} titulo={`Eliminar ${p.guia}`}>
        <p className="text-sm">La guía queda en la papelera, pero desaparece de las listas y de las cuentas.</p>
        {eliminar.error && <div className="mt-3"><Aviso tipo="error">{mensajeDe(eliminar.error)}</Aviso></div>}
        <div className="mt-5 flex gap-2">
          <Boton variante="secundario" className="flex-1" onClick={() => setBorrar(false)}>Cancelar</Boton>
          <Boton variante="peligro" className="flex-1" cargando={eliminar.isPending} onClick={() => eliminar.mutate()}>Eliminar</Boton>
        </div>
      </Dialogo>
    </>
  );
}
