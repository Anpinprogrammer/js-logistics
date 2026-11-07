import { useState } from "react";
import { Link } from "react-router";
import { useMutation } from "@tanstack/react-query";
import { auth } from "../api/servicios";
import { mensajeDe } from "../api/cliente";
import { useSesion, useUsuario } from "../auth/Sesion";
import { ROLES } from "../lib/formato";
import { Aviso, Boton, Campo, Dato, Titulo } from "../components/ui";
import { useAviso } from "../components/Avisos";

export default function Cuenta() {
  const u = useUsuario();
  const { salir } = useSesion();
  const avisar = useAviso();
  const [actual, setActual] = useState("");
  const [nueva, setNueva] = useState("");
  const m = useMutation({
    mutationFn: () => auth.cambiarClave(actual, nueva),
    onSuccess: () => { avisar("Contraseña cambiada. Se cerraron tus otras sesiones."); setActual(""); setNueva(""); }
  });

  return (
    <>
      <Titulo>Mi cuenta</Titulo>
      <div className="grid gap-4 md:grid-cols-2">
        <section className="caja p-5">
          <dl>
            <Dato k="Nombre">{u.nombre || "—"}</Dato>
            <Dato k="Correo">{u.email}</Dato>
            <Dato k="Rol">{ROLES[u.rol]}</Dato>
          </dl>
          {u.rol === "admin" && (
            <div className="mt-4 flex flex-wrap gap-2 md:hidden">
              <Link to="/personal" className="rounded-xl border border-linea px-4 py-2 text-sm font-semibold">Personal</Link>
              <Link to="/accesos" className="rounded-xl border border-linea px-4 py-2 text-sm font-semibold">Accesos</Link>
            </div>
          )}
          <Boton variante="secundario" className="mt-4 w-full" onClick={salir}>Cerrar sesión</Boton>
        </section>
        <form className="caja space-y-4 p-5" onSubmit={e => { e.preventDefault(); m.mutate(); }}>
          <h2 className="font-bold">Cambiar contraseña</h2>
          <Campo etiqueta="Contraseña actual" type="password" autoComplete="current-password" value={actual} onChange={e => setActual(e.target.value)} required />
          <Campo etiqueta="Contraseña nueva" type="password" autoComplete="new-password" minLength={10} value={nueva} onChange={e => setNueva(e.target.value)} required ayuda="Mínimo 10 caracteres" />
          {m.error && <Aviso tipo="error">{mensajeDe(m.error)}</Aviso>}
          <Boton type="submit" cargando={m.isPending}>Cambiar contraseña</Boton>
        </form>
      </div>
    </>
  );
}
