import { useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Moon, Sun } from "lucide-react";
import { useTema } from "../interna/tema";
import { Link } from "react-router";
import { useSesion } from "../auth/Sesion";
import { mensajeDe } from "../api/cliente";
import {
  MarcoAcceso, CabeceraAcceso, BotonAcceso, AvisoError,
  TARJETA, ENTRADA, ICONO, ENLACE, IcCorreo, IcCandado, IcOjo, IcOjoTachado
} from "./AccesoComun";
import { useIntroIngreso } from "./intro/useIntroIngreso";
import { escenaIntro } from "./intro/escena";
import { medir, type Medidas } from "./intro/medidas";

const TITULO = "JS Logistics";

export default function Ingreso() {
  const { ingresar } = useSesion();
  const { oscuro, cambiar } = useTema();
  const idCorreo = useId();
  const idClave = useId();
  const [email, setEmail] = useState("");
  const [clave, setClave] = useState("");
  const [ver, setVer] = useState(false);
  const [error, setError] = useState("");
  const [enviando, setEnviando] = useState(false);

  // Animación de entrada ("La ruta de entrega"): sale en cada carga del ingreso y se salta con cualquier gesto.
  // Mientras corre, `intro` trae el estilo del cuadro actual para cada pieza; al terminar es `undefined` y el ingreso queda como siempre.
  const { activa, cuadro, saltar } = useIntroIngreso();
  const raiz = useRef<HTMLDivElement>(null), tarjeta = useRef<HTMLDivElement>(null), insignia = useRef<HTMLDivElement>(null);
  const placa = useRef<HTMLDivElement>(null), tituloRef = useRef<HTMLHeadingElement>(null), boton = useRef<HTMLButtonElement>(null);
  const refs = useMemo(() => ({ raiz, tarjeta, insignia, placa, titulo: tituloRef, boton }), []);
  const [medidas, setMedidas] = useState<Medidas | null>(null);
  useLayoutEffect(() => {
    if (!activa) return;
    const tomar = () => {
      const p = { raiz: raiz.current, tarjeta: tarjeta.current, insignia: insignia.current, placa: placa.current, titulo: tituloRef.current, boton: boton.current };
      if (p.raiz && p.tarjeta && p.insignia && p.placa && p.titulo && p.boton) setMedidas(medir(p as Parameters<typeof medir>[0]));
    };
    tomar();
    // Si cambia el tamaño de la ventana o llega la letra (Poppins) a mitad de la animación, se mide otra vez.
    let vivo = true;
    window.addEventListener("resize", tomar);
    document.fonts?.ready.then(() => { if (vivo) tomar(); });
    return () => { vivo = false; window.removeEventListener("resize", tomar); };
  }, [activa]);
  const intro = activa ? escenaIntro(cuadro, medidas, refs, TITULO, oscuro) : undefined;

  const enviar = async (e: React.FormEvent) => {
    e.preventDefault();
    saltar();
    setError(""); setEnviando(true);
    try { await ingresar(email.trim(), clave); }
    catch (err) { setError(mensajeDe(err)); setEnviando(false); }
  };

  return (
    <MarcoAcceso intro={intro?.marco} seguirTema controles={
      <button type="button" onClick={() => { saltar(); cambiar(); }}
        aria-label={oscuro ? "Activar modo claro" : "Activar modo oscuro"}
        className="fixed top-4 right-4 z-50 flex min-h-11 min-w-11 items-center justify-center gap-2 rounded-full border border-slate-200 bg-white/90 px-3.5 py-2 text-xs font-bold text-slate-700 shadow-lg shadow-slate-900/5 backdrop-blur-md transition-all hover:border-sky-500/50 active:scale-95 dark:border-slate-800 dark:bg-slate-900/90 dark:text-slate-200 dark:shadow-black/30 sm:top-6 sm:right-6">
        {oscuro ? <Sun aria-hidden className="size-4 text-amber-400" /> : <Moon aria-hidden className="size-4 text-sky-600" />}
        <span className="hidden sm:inline">{oscuro ? "Modo claro" : "Modo oscuro"}</span>
      </button>
    }>
      <form onSubmit={enviar} className={TARJETA} style={intro?.formulario}>
        <CabeceraAcceso
          titulo={TITULO}
          descripcion="Ingresa con el correo y la contraseña que te dio administración."
          intro={intro?.cabecera}
        />

        <div className="space-y-2.5 sm:space-y-4">
          <div style={intro?.campos[0].estilo}>
            <label htmlFor={idCorreo} className="mb-1 block text-sm font-bold text-slate-700 dark:font-medium dark:text-slate-300 sm:mb-1.5">Correo</label>
            <div className="relative">
              <input
                id={idCorreo} type="email" autoComplete="username" placeholder="tu@correo.co"
                value={email} onChange={e => setEmail(e.target.value)} required disabled={enviando}
                className={`${ENTRADA} pr-4`}
              />
              {intro?.campos[0].escaner}
              <span className={ICONO}><IcCorreo /></span>
            </div>
          </div>

          <div style={intro?.campos[1].estilo}>
            <label htmlFor={idClave} className="mb-1 block text-sm font-bold text-slate-700 dark:font-medium dark:text-slate-300 sm:mb-1.5">Contraseña</label>
            <div className="relative">
              <input
                id={idClave} type={ver ? "text" : "password"} autoComplete="current-password" placeholder="••••••••"
                value={clave} onChange={e => setClave(e.target.value)} required disabled={enviando}
                className={`${ENTRADA} pr-12`}
              />
              {intro?.campos[1].escaner}
              <span className={ICONO}><IcCandado /></span>
              <button
                type="button" onClick={() => setVer(v => !v)}
                aria-label={ver ? "Ocultar contraseña" : "Mostrar contraseña"} aria-pressed={ver}
                className="absolute right-2 top-1/2 grid size-9 -translate-y-1/2 place-items-center rounded-lg text-slate-500 transition hover:bg-slate-200/70 dark:hover:bg-slate-700/50 hover:text-[#38bdf8] focus-visible:outline-2 focus-visible:outline-[#38bdf8]"
              >
                {ver ? <IcOjoTachado /> : <IcOjo />}
              </button>
            </div>
          </div>
        </div>

        {error && <AvisoError>{error}</AvisoError>}

        {intro?.barra}
        <BotonAcceso cargando={enviando} cargandoTexto="Ingresando…" intro={intro?.boton}>Ingresar</BotonAcceso>

        <p className="text-center text-xs leading-relaxed text-slate-400" style={intro?.enlace}>
          <Link to="/recuperar" className={ENLACE}>¿Olvidaste tu contraseña?</Link>
        </p>
      </form>
    </MarcoAcceso>
  );
}
