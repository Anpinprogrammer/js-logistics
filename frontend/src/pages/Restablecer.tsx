import { useEffect, useId, useState } from "react";
import { Link, useSearchParams } from "react-router";
import { auth } from "../api/servicios";
import { mensajeDe } from "../api/cliente";
import type { EnlaceCorreo } from "../api/tipos";
import { useSesion } from "../auth/Sesion";
import { DEMO } from "../interna/cuentasDemo";
import {
  MarcoAcceso, CabeceraAcceso, BotonAcceso, AvisoError,
  TARJETA, ENTRADA, ICONO, ENLACE, IcCandado, IcOjo, IcOjoTachado, IcCheck, IcVolver
} from "./AccesoComun";

const CLAVE_MINIMA = 10;

/** Cambiar la contraseña con el enlace del correo, o crearla si es una activación. */
export default function Restablecer() {
  const [params] = useSearchParams();
  const token = params.get("token") ?? "";
  const { salir } = useSesion();
  const idClave = useId();
  const idRepetir = useId();

  const [enlace, setEnlace] = useState<EnlaceCorreo | null>(null);
  const [revisando, setRevisando] = useState(true);
  const [errorEnlace, setErrorEnlace] = useState("");
  const [clave, setClave] = useState("");
  const [repetir, setRepetir] = useState("");
  const [ver, setVer] = useState(false);
  const [error, setError] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [listo, setListo] = useState(false);

  useEffect(() => {
    let vivo = true;
    if (!token) {
      setErrorEnlace("El enlace no trae el token. Pide uno nuevo.");
      setRevisando(false);
      return;
    }
    if (DEMO) {
      setEnlace({ tipo: "clave", nombre: "Cuenta demo", email: "c***@demo.co", expira: new Date(Date.now() + 3_600_000).toISOString() });
      setRevisando(false);
      return;
    }
    auth.enlace(token)
      .then(e => { if (vivo) setEnlace(e); })
      .catch(e => { if (vivo) setErrorEnlace(mensajeDe(e)); })
      .finally(() => { if (vivo) setRevisando(false); });
    return () => { vivo = false; };
  }, [token]);

  const enviar = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (clave.length < CLAVE_MINIMA) {
      setError(`La contraseña debe tener al menos ${CLAVE_MINIMA} caracteres.`);
      return;
    }
    if (clave !== repetir) {
      setError("Las dos contraseñas no coinciden.");
      return;
    }
    setEnviando(true);
    try {
      if (!DEMO) {
        if (enlace?.tipo === "activacion") await auth.activarCuenta(token, clave);
        else await auth.restablecer(token, clave);
      }
      // El servidor cierra las sesiones al cambiar la contraseña: se limpia la sesión local si había una.
      await salir().catch(() => {});
      setListo(true);
    } catch (err) {
      setError(mensajeDe(err));
    } finally {
      setEnviando(false);
    }
  };

  if (revisando) {
    return (
      <MarcoAcceso>
        <div className={`${TARJETA} text-center`}>
          <CabeceraAcceso titulo="Revisando el enlace" descripcion="Un momento, estamos comprobando que el enlace siga sirviendo." />
          <div className="flex justify-center py-2">
            <svg className="size-8 animate-spin text-[#38bdf8]" viewBox="0 0 24 24" fill="none" aria-hidden>
              <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity=".25" strokeWidth="3" />
              <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
            </svg>
          </div>
        </div>
      </MarcoAcceso>
    );
  }

  if (errorEnlace || !enlace) {
    return (
      <MarcoAcceso>
        <div className={TARJETA}>
          <CabeceraAcceso titulo="Este enlace no sirve" descripcion="Puede que ya se haya usado o que lo haya reemplazado un correo más reciente. Usa el último que te llegó o pide uno nuevo." />
          {errorEnlace && <AvisoError>{errorEnlace}</AvisoError>}
          <Link
            to="/recuperar"
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-[#0284c7] to-[#22d3ee] px-5 py-3 text-base font-bold text-white shadow-[0_8px_24px_-8px_rgba(34,211,238,.6)] transition duration-200 hover:-translate-y-0.5 hover:shadow-[0_14px_34px_-8px_rgba(34,211,238,.8)] active:translate-y-0"
          >
            Pedir un enlace nuevo
          </Link>
          <p className="text-center text-xs leading-relaxed text-slate-400">
            <Link to="/" className={ENLACE}>Volver al ingreso</Link>
          </p>
        </div>
      </MarcoAcceso>
    );
  }

  if (listo) {
    return (
      <MarcoAcceso>
        <div className={TARJETA}>
          <CabeceraAcceso titulo="Contraseña lista" descripcion="Ya puedes entrar con tu contraseña nueva." />
          <div className="flex justify-center py-1">
            <span className="grid size-14 place-items-center rounded-full border border-[#38bdf8]/40 bg-[#38bdf8]/10 text-[#38bdf8]">
              <IcCheck />
            </span>
          </div>
          <Link
            to="/"
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-[#0284c7] to-[#22d3ee] px-5 py-3 text-base font-bold text-white shadow-[0_8px_24px_-8px_rgba(34,211,238,.6)] transition duration-200 hover:-translate-y-0.5 hover:shadow-[0_14px_34px_-8px_rgba(34,211,238,.8)] active:translate-y-0"
          >
            Ingresar
          </Link>
        </div>
      </MarcoAcceso>
    );
  }

  const activacion = enlace.tipo === "activacion";
  return (
    <MarcoAcceso>
      <div className={TARJETA}>
        <CabeceraAcceso
          titulo={activacion ? "Activa tu cuenta" : "Cambia tu contraseña"}
          descripcion={<>{activacion ? "Crea la contraseña con la que entrarás" : "Escribe una contraseña nueva"} para <b className="font-semibold text-slate-100">{enlace.email}</b>.</>}
        />
        <form onSubmit={enviar} className="space-y-3 sm:space-y-4">
          <div>
            <label htmlFor={idClave} className="mb-1.5 block text-sm font-medium text-slate-300">Contraseña nueva</label>
            <div className="relative">
              <input
                id={idClave} type={ver ? "text" : "password"} autoComplete="new-password" placeholder="••••••••••" autoFocus
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

          <div>
            <label htmlFor={idRepetir} className="mb-1.5 block text-sm font-medium text-slate-300">Repite la contraseña</label>
            <div className="relative">
              <input
                id={idRepetir} type={ver ? "text" : "password"} autoComplete="new-password" placeholder="••••••••••"
                value={repetir} onChange={e => setRepetir(e.target.value)} required disabled={enviando}
                className={`${ENTRADA} pr-12`}
              />
              <span className={ICONO}><IcCandado /></span>
              <button
                type="button" onClick={() => setVer(v => !v)}
                aria-label={ver ? "Ocultar contraseñas" : "Mostrar contraseñas"} aria-pressed={ver}
                className="absolute right-2 top-1/2 grid size-9 -translate-y-1/2 place-items-center rounded-lg text-slate-500 transition hover:bg-slate-700/50 hover:text-[#38bdf8] focus-visible:outline-2 focus-visible:outline-[#38bdf8]"
              >
                {ver ? <IcOjoTachado /> : <IcOjo />}
              </button>
            </div>
          </div>

          <p className="text-xs leading-relaxed text-slate-400">Mínimo {CLAVE_MINIMA} caracteres.</p>

          {error && <AvisoError>{error}</AvisoError>}

          <BotonAcceso cargando={enviando} cargandoTexto="Guardando…">
            {activacion ? "Crear contraseña" : "Guardar contraseña"}
          </BotonAcceso>

          <p className="text-center text-xs leading-relaxed text-slate-400">
            <Link to="/" className={ENLACE}><span className="inline-flex items-center gap-1.5"><IcVolver /> Volver al ingreso</span></Link>
          </p>
        </form>
      </div>
    </MarcoAcceso>
  );
}
