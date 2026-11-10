import { useId, useState } from "react";
import { Link } from "react-router";
import { useSesion } from "../auth/Sesion";
import { mensajeDe } from "../api/cliente";
import {
  MarcoAcceso, CabeceraAcceso, BotonAcceso, AvisoError,
  TARJETA, ENTRADA, ICONO, ENLACE, IcCorreo, IcCandado, IcOjo, IcOjoTachado
} from "./AccesoComun";
import CapaIntro from "./intro/CapaIntro";
import { useIntroIngreso } from "./intro/useIntroIngreso";

export default function Ingreso() {
  const { ingresar } = useSesion();
  const intro = useIntroIngreso();
  const idCorreo = useId();
  const idClave = useId();
  const [email, setEmail] = useState("");
  const [clave, setClave] = useState("");
  const [ver, setVer] = useState(false);
  const [error, setError] = useState("");
  const [enviando, setEnviando] = useState(false);

  const enviar = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(""); setEnviando(true);
    try { await ingresar(email.trim(), clave); }
    catch (err) { setError(mensajeDe(err)); setEnviando(false); }
  };

  return <>
    <MarcoAcceso intro={intro.activa}>
      <form onSubmit={enviar} className={TARJETA} data-intro-card>
        <CabeceraAcceso
          intro={intro.activa}
          titulo="JS Logistics"
          descripcion="Ingresa con el correo y la contraseña que te dio administración."
        />

        <div className="space-y-3 sm:space-y-4">
          <div className={intro.activa ? "jsl-intro-campo jsl-intro-campo-1" : undefined}>
            <label htmlFor={idCorreo} className="mb-1.5 block text-sm font-medium text-slate-300">Correo</label>
            <div className="relative">
              <input
                id={idCorreo} type="email" autoComplete="username" placeholder="tu@correo.co"
                value={email} onChange={e => setEmail(e.target.value)} required disabled={enviando}
                className={`${ENTRADA} pr-4`}
              />
              <span className={ICONO}><IcCorreo /></span>
            </div>
          </div>

          <div className={intro.activa ? "jsl-intro-campo jsl-intro-campo-2" : undefined}>
            <label htmlFor={idClave} className="mb-1.5 block text-sm font-medium text-slate-300">Contraseña</label>
            <div className="relative">
              <input
                id={idClave} type={ver ? "text" : "password"} autoComplete="current-password" placeholder="••••••••"
                value={clave} onChange={e => setClave(e.target.value)} required disabled={enviando}
                className={`${ENTRADA} pr-12`}
              />
              <span className={ICONO}><IcCandado /></span>
              <button
                type="button" onClick={() => setVer(v => !v)}
                aria-label={ver ? "Ocultar contraseña" : "Mostrar contraseña"} aria-pressed={ver}
                className="absolute right-2 top-1/2 grid size-9 -translate-y-1/2 place-items-center rounded-lg text-slate-500 transition hover:bg-slate-700/50 hover:text-[#38bdf8] focus-visible:outline-2 focus-visible:outline-[#38bdf8]"
              >
                {ver ? <IcOjoTachado /> : <IcOjo />}
              </button>
            </div>
          </div>
        </div>

        {error && <AvisoError>{error}</AvisoError>}

        <BotonAcceso cargando={enviando} cargandoTexto="Ingresando…" intro={intro.activa}>Ingresar</BotonAcceso>

        <p className={"text-center text-xs leading-relaxed text-slate-400" + (intro.activa ? " jsl-intro-enlace" : "")}>
          <Link to="/recuperar" className={ENLACE}>¿Olvidaste tu contraseña?</Link>
        </p>
      </form>
    </MarcoAcceso>
    {intro.activa ? <CapaIntro /> : null}
  </>;
}
