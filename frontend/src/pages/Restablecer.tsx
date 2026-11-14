import { useEffect, useId, useState } from "react";
import { Link, useSearchParams } from "react-router";
import { auth } from "../api/servicios";
import { mensajeDe } from "../api/cliente";
import type { EnlaceCorreo } from "../api/tipos";
import { useSesion } from "../auth/Sesion";
import { DEMO } from "../interna/cuentasDemo";
import { useTema } from "../interna/tema";
import {
  MarcoAcceso, CabeceraAcceso, BotonAcceso, AvisoError, BotonTema,
  ETIQUETA, AYUDA, BOTON_OJO, BOTON_ENLACE,
  TARJETA, ENTRADA, ICONO, ENLACE, IcCandado, IcOjo, IcOjoTachado, IcCheck, IcVolver
} from "./AccesoComun";

const CLAVE_MINIMA = 10;

/** Cambiar la contraseña con el enlace del correo, o crearla si es una activación. */
export default function Restablecer() {
  const [params] = useSearchParams();
  const token = params.get("token") ?? "";
  const { salir } = useSesion();
  const { oscuro, cambiar } = useTema();
  const tema = <BotonTema oscuro={oscuro} alCambiar={cambiar} />;
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
      <MarcoAcceso controles={tema}>
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
      <MarcoAcceso controles={tema}>
        <div className={TARJETA}>
          <CabeceraAcceso titulo="Este enlace no sirve" descripcion="Puede que ya se haya usado o que lo haya reemplazado un correo más reciente. Usa el último que te llegó o pide uno nuevo." />
          {errorEnlace && <AvisoError>{errorEnlace}</AvisoError>}
          <Link
            to="/recuperar"
            className={BOTON_ENLACE}
          >
            Pedir un enlace nuevo
          </Link>
          <p className={`text-center ${AYUDA}`}>
            <Link to="/" className={ENLACE}>Volver al ingreso</Link>
          </p>
        </div>
      </MarcoAcceso>
    );
  }

  if (listo) {
    return (
      <MarcoAcceso controles={tema}>
        <div className={TARJETA}>
          <CabeceraAcceso titulo="Contraseña lista" descripcion="Ya puedes entrar con tu contraseña nueva." />
          <div className="flex justify-center py-1">
            <span className="grid size-14 place-items-center rounded-full border border-[#38bdf8]/40 bg-[#38bdf8]/10 text-[#38bdf8]">
              <IcCheck />
            </span>
          </div>
          <Link
            to="/"
            className={BOTON_ENLACE}
          >
            Ingresar
          </Link>
        </div>
      </MarcoAcceso>
    );
  }

  const activacion = enlace.tipo === "activacion";
  return (
    <MarcoAcceso controles={tema}>
      <div className={TARJETA}>
        <CabeceraAcceso
          titulo={activacion ? "Activa tu cuenta" : "Cambia tu contraseña"}
          descripcion={<>{activacion ? "Crea la contraseña con la que entrarás" : "Escribe una contraseña nueva"} para <b className="font-semibold text-slate-900 dark:text-slate-100">{enlace.email}</b>.</>}
        />
        <form onSubmit={enviar} className="space-y-3 sm:space-y-4">
          <div>
            <label htmlFor={idClave} className={ETIQUETA}>Contraseña nueva</label>
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
                className={BOTON_OJO}
              >
                {ver ? <IcOjoTachado /> : <IcOjo />}
              </button>
            </div>
          </div>

          <div>
            <label htmlFor={idRepetir} className={ETIQUETA}>Repite la contraseña</label>
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
                className={BOTON_OJO}
              >
                {ver ? <IcOjoTachado /> : <IcOjo />}
              </button>
            </div>
          </div>

          <p className={AYUDA}>Mínimo {CLAVE_MINIMA} caracteres.</p>

          {error && <AvisoError>{error}</AvisoError>}

          <BotonAcceso cargando={enviando} cargandoTexto="Guardando…">
            {activacion ? "Crear contraseña" : "Guardar contraseña"}
          </BotonAcceso>

          <p className={`text-center ${AYUDA}`}>
            <Link to="/" className={ENLACE}><span className="inline-flex items-center gap-1.5"><IcVolver /> Volver al ingreso</span></Link>
          </p>
        </form>
      </div>
    </MarcoAcceso>
  );
}
