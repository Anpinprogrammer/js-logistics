import { useId, useState } from "react";
import { Link } from "react-router";
import { auth } from "../api/servicios";
import { mensajeDe } from "../api/cliente";
import { DEMO } from "../interna/cuentasDemo";
import {
  MarcoAcceso, CabeceraAcceso, BotonAcceso, AvisoError,
  TARJETA, ENTRADA, ICONO, ENLACE, IcCorreo, IcCheck, IcVolver
} from "./AccesoComun";

/** Pedir por correo el enlace para recuperar la contraseña (o activar una cuenta que nunca se abrió). */
export default function Recuperar() {
  const idCorreo = useId();
  const [email, setEmail] = useState("");
  const [enviado, setEnviado] = useState(false);
  const [error, setError] = useState("");
  const [enviando, setEnviando] = useState(false);

  const enviar = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(""); setEnviando(true);
    try {
      if (!DEMO) await auth.recuperar(email.trim());
      setEnviado(true);
    } catch (err) {
      setError(mensajeDe(err));
    } finally {
      setEnviando(false);
    }
  };

  return (
    <MarcoAcceso>
      <div className={TARJETA}>
        {enviado ? (
          <>
            <CabeceraAcceso
              titulo="Revisa tu correo"
              descripcion={<>Si <b className="font-semibold text-slate-100">{email.trim()}</b> tiene una cuenta, te enviamos un enlace para crear una contraseña nueva.</>}
            />
            <div className="flex justify-center py-1">
              <span className="grid size-14 place-items-center rounded-full border border-[#38bdf8]/40 bg-[#38bdf8]/10 text-[#38bdf8]">
                <IcCheck />
              </span>
            </div>
            <p className="rounded-xl border border-[#38bdf8]/25 bg-[#38bdf8]/10 px-3.5 py-3 text-center text-sm leading-relaxed text-slate-300">
              El enlace vence en 60 minutos. Si pides otro, el anterior deja de servir. Si no llega, revisa la carpeta de spam.
            </p>
            <Link
              to="/"
              className="flex w-full items-center justify-center gap-2 rounded-xl border border-[#334155] bg-[#070B19]/70 px-5 py-3 text-base font-bold text-slate-200 transition duration-200 hover:border-slate-500 hover:text-white"
            >
              <IcVolver /> Volver al ingreso
            </Link>
            <p className="text-center text-xs leading-relaxed text-slate-400">
              ¿Escribiste mal el correo?{" "}
              <button type="button" onClick={() => { setEnviado(false); setError(""); }} className={ENLACE}>
                Intentar de nuevo
              </button>
            </p>
          </>
        ) : (
          <>
            <CabeceraAcceso
              titulo="Recuperar contraseña"
              descripcion="Escribe el correo de tu cuenta y te enviamos un enlace para crear una contraseña nueva."
            />
            <form onSubmit={enviar} className="space-y-3 sm:space-y-4">
              <div>
                <label htmlFor={idCorreo} className="mb-1.5 block text-sm font-medium text-slate-300">Correo</label>
                <div className="relative">
                  <input
                    id={idCorreo} type="email" autoComplete="email" placeholder="tu@correo.co" autoFocus
                    value={email} onChange={e => setEmail(e.target.value)} required disabled={enviando}
                    className={`${ENTRADA} pr-4`}
                  />
                  <span className={ICONO}><IcCorreo /></span>
                </div>
              </div>

              {error && <AvisoError>{error}</AvisoError>}

              <BotonAcceso cargando={enviando} cargandoTexto="Enviando…">Enviar enlace</BotonAcceso>

              <p className="text-center text-xs leading-relaxed text-slate-400">
                <Link to="/" className={ENLACE}>Volver al ingreso</Link>
              </p>
            </form>
          </>
        )}
      </div>
    </MarcoAcceso>
  );
}
