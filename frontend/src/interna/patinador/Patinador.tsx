/* App del patinador: anota el dinero que le pagan los clientes en su ruta y ve su caja. Es la única pantalla de este rol:
   no baja la oficina ni el mensajero, y no usa los datos en memoria (`S`). Todo lo suma el servidor. */
import { useEffect, useState } from "react";
import { useSesion, useUsuario } from "../../auth/Sesion";
import { DEMO, datosDemo } from "../demo";
import { Icono, IconoSalir, ProveedorVentana } from "../ui";
import { fechaLarga, hoy, horaActual } from "../motor";
import { useTema } from "../tema";
import { VistaPatinador } from "./Vista";
import { CLAVE_NAV_ADMIN, leerNavegacion, usePersistedTab } from "../../hooks/usePersistedTab";
import "../estilos.css";
import "../ajustes.css";

type Pestana = "inicio" | "historial";
const PESTANAS: [Pestana, string][] = [["inicio", "Mi caja"], ["historial", "Historial"]];

const IconoSol = () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" /></svg>;
const IconoLuna = () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M21 12.8A8.5 8.5 0 1 1 11.2 3a6.5 6.5 0 0 0 9.8 9.8z" /></svg>;

export default function AppPatinador() {
  const { tema, oscuro, cambiar } = useTema();
  return (
    <div className="jsl" data-theme={tema === "sistema" ? undefined : tema}>
      <ProveedorVentana><Marco oscuro={oscuro} cambiarTema={cambiar} /></ProveedorVentana>
    </div>
  );
}

function Marco({ oscuro, cambiarTema }: { oscuro: boolean; cambiarTema: () => void }) {
  const usuario = useUsuario(), { salir } = useSesion();
  // Al recargar (F5) vuelve a la pestaña en la que estaba.
  const [tab, setTab] = useState<Pestana>(() => {
    const nav = leerNavegacion(CLAVE_NAV_ADMIN, usuario.id);
    return PESTANAS.some(([k]) => k === nav?.tab) ? (nav!.tab as Pestana) : "inicio";
  });
  usePersistedTab(CLAVE_NAV_ADMIN, usuario.id, { tab });
  useState(() => { if (DEMO) datosDemo(usuario); }); // en la demo, deja listos los clientes para buscar
  useEffect(() => { document.title = "JS Logistics"; }, []);
  const nom = usuario.nombre || usuario.email, h = horaActual();
  const iniciales = nom.replace(/@.*/, "").split(/\s+/).filter(Boolean).slice(0, 2).map(x => x[0]).join("").toUpperCase();
  const ir = (k: Pestana) => { setTab(k); scrollTo(0, 0); };
  const boton = ([k, t]: [Pestana, string]) => (
    <button key={k} aria-current={tab === k ? "page" : undefined} aria-label={t} title={t} onClick={() => ir(k)}><Icono n={k === "inicio" ? "caja" : "historial"} /><span className="t">{t}</span></button>
  );
  return <>
    <aside className="lateral" id="lateral">
      <div className="marca-lat"><img src="/logo_JS_sin_texto.webp" alt="" /><div className="marca-lat-txt"><b className="marca-lat-nombre">JS Logistics</b><small className="marca-lat-eslogan">Servir es nuestra labor</small></div></div>
      <nav id="navLateral" aria-label="Menú principal"><div className="lat-grupo"><span className="lat-titulo">Patinador</span>{PESTANAS.map(boton)}</div></nav>
    </aside>
    <header className="barra">
      <div className="barra-escritorio">
        <div className="marca"><img src="/logo_JS_sin_texto.webp" alt="" /><span>JS Logistics<small>Servir es nuestra labor</small></span></div>
        <div className="saludo"><b>{h < 12 ? "Buenos días" : h < 19 ? "Buenas tardes" : "Buenas noches"}{nom ? ", " + (nom.includes("@") ? nom.split("@")[0] : nom.split(" ")[0]) : ""}</b><span>{fechaLarga(hoy())}</span></div>
        <span className="avatar" aria-hidden="true">{iniciales}</span>
        <button type="button" className="tema" onClick={cambiarTema} aria-label={oscuro ? "Cambiar a modo claro" : "Cambiar a modo oscuro"} title={oscuro ? "Cambiar a modo claro" : "Cambiar a modo oscuro"}>{oscuro ? <IconoSol /> : <IconoLuna />}</button>
        <button className="salir" aria-label="Cerrar sesión" onClick={() => void salir()}><IconoSalir /><span>Salir</span></button>
      </div>
      <div className="barra-movil">
        <div className="marca marca-movil"><img src="/logo_JS_sin_texto.webp" alt="JS Logistics" /></div>
        <div className="barra-movil-acciones">
          <button type="button" className="campana" aria-label={oscuro ? "Cambiar a modo claro" : "Cambiar a modo oscuro"} onClick={cambiarTema}>{oscuro ? <IconoSol /> : <IconoLuna />}</button>
          <button type="button" className="campana" aria-label="Cerrar sesión" onClick={() => void salir()}><IconoSalir /></button>
        </div>
      </div>
    </header>
    <main id="vista"><VistaPatinador tab={tab} irHistorial={() => ir("historial")} /></main>
    <nav className="pestanas" id="pestanas" aria-label="Secciones">{PESTANAS.map(boton)}</nav>
  </>;
}

