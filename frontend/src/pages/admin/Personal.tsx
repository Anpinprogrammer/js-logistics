/* Administración: personal (mensajeros, oficina, patinadores…). */
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { mensajeros } from "../../api/servicios";
import { mensajeDe } from "../../api/cliente";
import type { Mensajero, TipoPersonal } from "../../api/tipos";
import { TIPOS_PERSONAL, aPesos, pesos } from "../../lib/formato";
import { Aviso, Boton, Campo, Cargando, Casilla, Dialogo, Selector, Titulo, Vacio } from "../../components/ui";
import { useAviso } from "../../components/Avisos";
import { IcMas } from "../../components/Iconos";

export default function Personal() {
  const [inactivos, setInactivos] = useState(false);
  const [editar, setEditar] = useState<Mensajero | "nuevo" | null>(null);
  const q = useQuery({ queryKey: ["mensajeros", { inactivos }], queryFn: () => mensajeros.listar(inactivos) });

  return (
    <>
      <Titulo accion={<Boton onClick={() => setEditar("nuevo")}><IcMas />Agregar</Boton>}>Personal</Titulo>
      <div className="mb-3"><Casilla etiqueta="Mostrar también los inactivos" checked={inactivos} onChange={setInactivos} /></div>
      {q.isPending ? <Cargando /> : q.error ? <Aviso tipo="error">{mensajeDe(q.error)}</Aviso> : !q.data.length ? <Vacio titulo="Todavía no hay personal" /> : (
        <ul className="caja divide-y divide-linea">
          {q.data.map(m => (
            <li key={m.id}>
              <button className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left hover:bg-hueco" onClick={() => setEditar(m)}>
                <span>
                  <b className={m.activo ? "" : "text-suave line-through"}>{m.nombre}</b>
                  <span className="block text-sm text-suave">{TIPOS_PERSONAL[m.tipo]}{m.telefono && ` · ${m.telefono}`}</span>
                </span>
                {m.tarifa > 0 && <span className="text-sm text-suave">{pesos(m.tarifa)} por día</span>}
              </button>
            </li>
          ))}
        </ul>
      )}
      {editar && <FormPersona persona={editar === "nuevo" ? undefined : editar} alCerrar={() => setEditar(null)} />}
    </>
  );
}

function FormPersona({ persona, alCerrar }: { persona?: Mensajero; alCerrar: () => void }) {
  const qc = useQueryClient(), avisar = useAviso();
  const [nombre, setNombre] = useState(persona?.nombre ?? "");
  const [telefono, setTelefono] = useState(persona?.telefono ?? "");
  const [tipo, setTipo] = useState<TipoPersonal>(persona?.tipo ?? "mensajero");
  const [tarifa, setTarifa] = useState(persona?.tarifa ? String(persona.tarifa) : "");
  const [activo, setActivo] = useState(persona?.activo ?? true);
  const m = useMutation({
    mutationFn: () => {
      const d = { nombre: nombre.trim(), telefono: telefono.trim(), tipo, tarifa: aPesos(tarifa) };
      return persona ? mensajeros.actualizar(persona.id, { ...d, activo }) : mensajeros.crear(d);
    },
    onSuccess: () => { avisar(persona ? "Datos actualizados" : "Persona agregada"); qc.invalidateQueries({ queryKey: ["mensajeros"] }); alCerrar(); }
  });
  return (
    <Dialogo abierto alCerrar={alCerrar} titulo={persona ? persona.nombre : "Agregar al personal"}>
      <form className="space-y-4" onSubmit={e => { e.preventDefault(); m.mutate(); }}>
        <Campo etiqueta="Nombre" value={nombre} onChange={e => setNombre(e.target.value)} required maxLength={120} />
        <Campo etiqueta="Teléfono" type="tel" value={telefono} onChange={e => setTelefono(e.target.value)} />
        <Selector etiqueta="Tipo" value={tipo} onChange={e => setTipo(e.target.value as TipoPersonal)}>
          {Object.entries(TIPOS_PERSONAL).map(([k, t]) => <option key={k} value={k}>{t}</option>)}
        </Selector>
        <Campo etiqueta="Pago por día (si tiene pago fijo)" inputMode="numeric" value={tarifa} onChange={e => setTarifa(e.target.value)} />
        {persona && <Casilla etiqueta="Activo (aparece en las listas)" checked={activo} onChange={setActivo} />}
        {m.error && <Aviso tipo="error">{mensajeDe(m.error)}</Aviso>}
        <Boton type="submit" className="w-full" cargando={m.isPending}>Guardar</Boton>
      </form>
    </Dialogo>
  );
}
