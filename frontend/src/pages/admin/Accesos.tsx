/* Administración: cuentas para entrar a la app (crear, cambiar rol o vínculo, contraseña, desactivar). */
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { clientes, mensajeros, usuarios } from "../../api/servicios";
import { mensajeDe } from "../../api/cliente";
import type { Rol, Usuario } from "../../api/tipos";
import { useUsuario } from "../../auth/Sesion";
import { ROLES, fechaHora } from "../../lib/formato";
import { Aviso, Boton, Campo, Cargando, Casilla, Dialogo, Selector, Titulo } from "../../components/ui";
import { useAviso } from "../../components/Avisos";
import { IcMas } from "../../components/Iconos";

export default function Accesos() {
  const yo = useUsuario();
  const [editar, setEditar] = useState<Usuario | "nuevo" | null>(null);
  const q = useQuery({ queryKey: ["usuarios"], queryFn: usuarios.listar });
  return (
    <>
      <Titulo sub="Cuentas para entrar a la app" accion={<Boton onClick={() => setEditar("nuevo")}><IcMas />Crear acceso</Boton>}>Accesos</Titulo>
      {q.isPending ? <Cargando /> : q.error ? <Aviso tipo="error">{mensajeDe(q.error)}</Aviso> : (
        <ul className="caja divide-y divide-linea">
          {q.data.map(u => (
            <li key={u.id}>
              <button className="flex w-full min-w-0 flex-wrap items-center justify-between gap-2 px-4 py-3 text-left hover:bg-hueco" onClick={() => setEditar(u)}>
                <span className="min-w-0 [overflow-wrap:anywhere]">
                  <b className={u.activo === false ? "text-suave line-through" : ""}>{u.nombre || u.email}</b>{u.id === yo.id && <span className="text-sm text-suave"> (tú)</span>}
                  <span className="block text-sm text-suave">{u.email}</span>
                </span>
                <span className="text-right text-sm"><span className="font-medium">{ROLES[u.rol]}</span>
                  <span className="block text-xs text-suave">{u.ultimoIngreso ? `Último ingreso ${fechaHora(u.ultimoIngreso)}` : "Nunca ha ingresado"}</span></span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {editar && <FormAcceso cuenta={editar === "nuevo" ? undefined : editar} esYo={editar !== "nuevo" && editar.id === yo.id} alCerrar={() => setEditar(null)} />}
    </>
  );
}

function FormAcceso({ cuenta, esYo, alCerrar }: { cuenta?: Usuario; esYo: boolean; alCerrar: () => void }) {
  const qc = useQueryClient(), avisar = useAviso();
  const [email, setEmail] = useState(cuenta?.email ?? "");
  const [nombre, setNombre] = useState(cuenta?.nombre ?? "");
  const [rol, setRol] = useState<Rol>(cuenta?.rol ?? "mensajero");
  const [mensajeroId, setMensajeroId] = useState(cuenta?.mensajeroId ?? "");
  const [clienteId, setClienteId] = useState(cuenta?.clienteId ?? "");
  const [clave, setClave] = useState("");
  const [activo, setActivo] = useState(cuenta?.activo ?? true);
  const mens = useQuery({ queryKey: ["mensajeros", { inactivos: false }], queryFn: () => mensajeros.listar() });
  const clis = useQuery({ queryKey: ["clientes", "buscar", ""], queryFn: () => clientes.listar(), enabled: rol === "cliente" });

  const refrescar = () => qc.invalidateQueries({ queryKey: ["usuarios"] });
  const guardar = useMutation({
    mutationFn: async () => {
      const vinculos = { mensajeroId: mensajeroId || null, clienteId: rol === "cliente" ? clienteId || null : null };
      if (!cuenta) return usuarios.crear({ email: email.trim(), nombre: nombre.trim(), rol, clave, ...vinculos });
      await usuarios.actualizar(cuenta.id, { nombre: nombre.trim(), ...(esYo ? {} : { rol, activo }), ...vinculos });
      if (clave) await usuarios.cambiarClave(cuenta.id, clave);
    },
    onSuccess: () => { avisar(cuenta ? "Acceso actualizado" : "Acceso creado"); refrescar(); alCerrar(); }
  });
  const quitar = useMutation({
    mutationFn: () => usuarios.eliminar(cuenta!.id),
    onSuccess: () => { avisar("Acceso quitado"); refrescar(); alCerrar(); }
  });

  return (
    <Dialogo abierto alCerrar={alCerrar} titulo={cuenta ? cuenta.email : "Crear acceso"}>
      <form className="space-y-4" onSubmit={e => { e.preventDefault(); guardar.mutate(); }}>
        {!cuenta && <Campo etiqueta="Correo" type="email" value={email} onChange={e => setEmail(e.target.value)} required autoComplete="off" />}
        <Campo etiqueta="Nombre" value={nombre} onChange={e => setNombre(e.target.value)} maxLength={120} />
        <Selector etiqueta="Rol" value={rol} onChange={e => setRol(e.target.value as Rol)} disabled={esYo}>
          {Object.entries(ROLES).map(([k, t]) => <option key={k} value={k}>{t}</option>)}
        </Selector>
        {esYo && <p className="text-xs text-suave">No puedes cambiar tu propio rol.</p>}
        {rol !== "cliente" && (
          <Selector etiqueta="Su nombre en Personal" value={mensajeroId} onChange={e => setMensajeroId(e.target.value)} required={rol === "mensajero"}>
            <option value="">{rol === "mensajero" ? "Elige…" : "Ninguno"}</option>
            {mens.data?.map(m => <option key={m.id} value={m.id}>{m.nombre}</option>)}
          </Selector>
        )}
        {rol === "cliente" && (
          <Selector etiqueta="Cliente" value={clienteId} onChange={e => setClienteId(e.target.value)} required>
            <option value="">Elige…</option>
            {clis.data?.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
          </Selector>
        )}
        <Campo etiqueta={cuenta ? "Contraseña nueva (opcional)" : "Contraseña"} type="password" autoComplete="new-password" minLength={10}
          value={clave} onChange={e => setClave(e.target.value)} required={!cuenta} ayuda="Mínimo 10 caracteres. Al cambiarla se cierran sus sesiones abiertas." />
        {cuenta && !esYo && <Casilla etiqueta="Cuenta activa" checked={activo} onChange={setActivo} />}
        {(guardar.error || quitar.error) && <Aviso tipo="error">{mensajeDe(guardar.error || quitar.error)}</Aviso>}
        <div className="flex flex-wrap gap-2">
          <Boton type="submit" className="flex-1" cargando={guardar.isPending}>Guardar</Boton>
          {cuenta && !esYo && <Boton type="button" variante="peligro" cargando={quitar.isPending} onClick={() => quitar.mutate()}>Quitar acceso</Boton>}
        </div>
      </form>
    </Dialogo>
  );
}
