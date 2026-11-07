import { useState } from "react";
import { useSesion } from "../auth/Sesion";
import { mensajeDe } from "../api/cliente";
import { Aviso, Boton, Campo } from "../components/ui";

export default function Ingreso() {
  const { ingresar } = useSesion();
  const [email, setEmail] = useState("");
  const [clave, setClave] = useState("");
  const [error, setError] = useState("");
  const [enviando, setEnviando] = useState(false);

  const enviar = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(""); setEnviando(true);
    try { await ingresar(email.trim(), clave); }
    catch (err) { setError(mensajeDe(err)); setEnviando(false); }
  };

  return (
    <div className="grid min-h-dvh place-items-center bg-noche px-4">
      <form onSubmit={enviar} className="caja w-full max-w-sm space-y-4 p-6">
        <div className="text-center">
          <img src="/logo.png" alt="" className="mx-auto mb-3 size-16 rounded-2xl" />
          <h1 className="text-xl font-bold">JS Logistics</h1>
          <p className="text-sm text-suave">Ingresa con el correo y la contraseña que te dio administración.</p>
        </div>
        <Campo etiqueta="Correo" type="email" autoComplete="username" value={email} onChange={e => setEmail(e.target.value)} required />
        <Campo etiqueta="Contraseña" type="password" autoComplete="current-password" value={clave} onChange={e => setClave(e.target.value)} required />
        {error && <Aviso tipo="error">{error}</Aviso>}
        <Boton type="submit" className="w-full" cargando={enviando}>Ingresar</Boton>
        <p className="text-center text-xs text-suave">¿Olvidaste la contraseña? Pídele a administración que te asigne una nueva.</p>
      </form>
    </div>
  );
}
