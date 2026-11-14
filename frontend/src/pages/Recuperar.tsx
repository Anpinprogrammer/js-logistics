import { useId, useState } from "react";
import { Link } from "react-router";
import { auth } from "../api/servicios";
import { mensajeDe } from "../api/cliente";
import { DEMO } from "../interna/cuentasDemo";
import {
  MarcoAcceso, CabeceraAcceso, BotonAcceso, AvisoError,
  TARJETA, ENTRADA, ICONO, ENLACE, IcCorreo, IcCandado, IcOjo, IcOjoTachado, IcCheck, IcVolver
} from "./AccesoComun";

const CLAVE_MINIMA = 10;
const BOTON_OJO = "absolute right-2 top-1/2 grid size-9 -translate-y-1/2 place-items-center rounded-lg text-slate-500 transition hover:bg-slate-700/50 hover:text-[#38bdf8] focus-visible:outline-2 focus-visible:outline-[#38bdf8]";

type Paso = "correo" | "codigo" | "listo";

/**
 * Recuperar la contraseña con un código de 6 dígitos que llega al correo:
 * 1) se pide con el correo, 2) se escribe el código con la contraseña nueva, 3) listo.
 */
export default function Recuperar() {
  const idCorreo = useId();
  const idCodigo = useId();
  const idClave = useId();
  const idRepetir = useId();
  const [paso, setPaso] = useState<Paso>("correo");
  const [email, setEmail] = useState("");
  const [codigo, setCodigo] = useState("");
  const [clave, setClave] = useState("");
  const [repetir, setRepetir] = useState("");
  const [ver, setVer] = useState(false);
  const [error, setError] = useState("");
  const [aviso, setAviso] = useState("");
  const [enviando, setEnviando] = useState(false);

  const pedirCodigo = async () => {
    if (!DEMO) await auth.recuperar(email.trim());
  };

  const enviarCorreo = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(""); setAviso(""); setEnviando(true);
    try {
      await pedirCodigo();
      setPaso("codigo");
    } catch (err) {
      setError(mensajeDe(err));
    } finally {
      setEnviando(false);
    }
  };

  const reenviar = async () => {
    setError(""); setAviso(""); setEnviando(true);
    try {
      await pedirCodigo();
      setCodigo("");
      setAviso("Listo. Si la cuenta existe, te mandamos un código nuevo; el anterior ya no sirve.");
    } catch (err) {
      setError(mensajeDe(err));
    } finally {
      setEnviando(false);
    }
  };

  const guardar = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(""); setAviso("");
    if (!/^\d{6}$/.test(codigo)) { setError("El código tiene 6 números."); return; }
    if (clave.length < CLAVE_MINIMA) { setError(`La contraseña debe tener al menos ${CLAVE_MINIMA} caracteres.`); return; }
    if (clave !== repetir) { setError("Las dos contraseñas no coinciden."); return; }
    setEnviando(true);
    try {
      if (!DEMO) await auth.restablecerConCodigo(email.trim(), codigo, clave);
      setPaso("listo");
    } catch (err) {
      setError(mensajeDe(err));
    } finally {
      setEnviando(false);
    }
  };

  const ojo = (
    <button
      type="button" onClick={() => setVer(v => !v)}
      aria-label={ver ? "Ocultar contraseñas" : "Mostrar contraseñas"} aria-pressed={ver}
      className={BOTON_OJO}
    >
      {ver ? <IcOjoTachado /> : <IcOjo />}
    </button>
  );

  return (
    <MarcoAcceso>
      <div className={TARJETA}>
        {paso === "listo" && (
          <>
            <CabeceraAcceso titulo="Contraseña cambiada" descripcion="Ya puedes entrar con tu contraseña nueva. Cerramos las sesiones que tenías abiertas." />
            <div className="flex justify-center py-1">
              <span className="grid size-14 place-items-center rounded-full border border-[#38bdf8]/40 bg-[#38bdf8]/10 text-[#38bdf8]"><IcCheck /></span>
            </div>
            <Link to="/" className="flex w-full items-center justify-center gap-2 rounded-xl border border-[#334155] bg-[#070B19]/70 px-5 py-3 text-base font-bold text-slate-200 transition duration-200 hover:border-slate-500 hover:text-white">
              <IcVolver /> Ir al ingreso
            </Link>
          </>
        )}

        {paso === "codigo" && (
          <>
            <CabeceraAcceso
              titulo="Escribe el código"
              descripcion={<>Si <b className="font-semibold text-slate-100">{email.trim()}</b> tiene una cuenta, te enviamos un código de 6 números. Vence en 10 minutos.</>}
            />
            <form onSubmit={guardar} className="space-y-3 sm:space-y-4">
              <div>
                <label htmlFor={idCodigo} className="mb-1.5 block text-sm font-medium text-slate-300">Código del correo</label>
                <input
                  id={idCodigo} inputMode="numeric" pattern="\d{6}" maxLength={6} autoComplete="one-time-code" placeholder="000000" autoFocus
                  value={codigo} onChange={e => setCodigo(e.target.value.replace(/\D/g, "").slice(0, 6))} required disabled={enviando}
                  className={`${ENTRADA} px-4 text-center font-mono text-2xl tracking-[0.5em]`}
                />
              </div>
              <div>
                <label htmlFor={idClave} className="mb-1.5 block text-sm font-medium text-slate-300">Contraseña nueva</label>
                <div className="relative">
                  <input id={idClave} type={ver ? "text" : "password"} autoComplete="new-password" placeholder="••••••••••"
                    value={clave} onChange={e => setClave(e.target.value)} required disabled={enviando} className={`${ENTRADA} pr-12`} />
                  <span className={ICONO}><IcCandado /></span>
                  {ojo}
                </div>
              </div>
              <div>
                <label htmlFor={idRepetir} className="mb-1.5 block text-sm font-medium text-slate-300">Repite la contraseña</label>
                <div className="relative">
                  <input id={idRepetir} type={ver ? "text" : "password"} autoComplete="new-password" placeholder="••••••••••"
                    value={repetir} onChange={e => setRepetir(e.target.value)} required disabled={enviando} className={`${ENTRADA} pr-12`} />
                  <span className={ICONO}><IcCandado /></span>
                </div>
              </div>
              <p className="text-xs leading-relaxed text-slate-400">Mínimo {CLAVE_MINIMA} caracteres. Si no llega, revisa la carpeta de spam.</p>

              {error && <AvisoError>{error}</AvisoError>}
              {aviso && <p role="status" className="rounded-xl border border-[#38bdf8]/25 bg-[#38bdf8]/10 px-3.5 py-3 text-sm leading-relaxed text-slate-300">{aviso}</p>}

              <BotonAcceso cargando={enviando} cargandoTexto="Guardando…">Guardar contraseña</BotonAcceso>

              <p className="text-center text-xs leading-relaxed text-slate-400">
                ¿No te llegó?{" "}
                <button type="button" onClick={reenviar} disabled={enviando} className={ENLACE}>Pedir otro código</button>
                {" · "}
                <button type="button" onClick={() => { setPaso("correo"); setError(""); setAviso(""); setCodigo(""); }} className={ENLACE}>Cambiar correo</button>
              </p>
            </form>
          </>
        )}

        {paso === "correo" && (
          <>
            <CabeceraAcceso
              titulo="Recuperar contraseña"
              descripcion="Escribe el correo de tu cuenta y te enviamos un código de 6 números para crear una contraseña nueva."
            />
            <form onSubmit={enviarCorreo} className="space-y-3 sm:space-y-4">
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

              <BotonAcceso cargando={enviando} cargandoTexto="Enviando…">Enviar código</BotonAcceso>

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
