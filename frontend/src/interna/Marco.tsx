/* Marco de la app interna, igual al prototipo: menú lateral en computador, barra arriba y pestañas abajo en el celular. */
import { DashboardSkeleton } from "../components/skeletons/DashboardSkeleton";
import { Suspense, useEffect, useRef, useState } from "react";
import { useSesion, useUsuario } from "../auth/Sesion";
import { necesarias, ProveedorDatos, useColecciones, useDatos } from "./datos";
import { ProveedorVentana, Icono, IconoSalir, useVentana } from "./ui";
import { E, estadoInicialPedidos, guardarLocal } from "./estado";
import { useTema } from "./tema";
import { AvisoSolicitud, Campanita, IconoCampana, useSolicitudes } from "./Solicitudes";
import { S, fechaLarga, hoy, horaActual, type Pedido } from "./motor";
import { pendientesMios, porRecogerMios, devolucionesPorDefinirMios } from "./mensajero/pendientes";
import { useEscritorio } from "../lib/pantalla";
import { perezoso } from "../lib/perezoso";
import { useEventos } from "./eventos";
import { CLAVE_NAV_ADMIN, usePersistedTab } from "../hooks/usePersistedTab";
import { navegacionActual, restaurarNavegacion } from "./navegacion";
import { precargarPestana } from "./oficina/pestanas";
import { precargarAvisos } from "../lib/alertasAdmin";
import "./estilos.css";
import "./ajustes.css";

// Cada modo se descarga solo cuando se usa: el mensajero en el celular no baja las pantallas de la oficina, y al revés.
const Oficina = perezoso(() => import("./oficina/Oficina"));
const Mensajero = perezoso(() => import("./mensajero/Mensajero"));
const cargando = <div className="vacio" role="status">Cargando…</div>;

export type ItemNav = [clave: string, nombre: string, num?: number];

/** En el escritorio las sub-pestañas de "Más" son accesos directos del menú; la clave es la misma de `E.subMas`. */
const ADMIN_ESCRITORIO: ItemNav[] = [["resultados", "Resultados"], ["personal", "Personal"], ["historial", "Historial"], ["papelera", "Papelera"], ["respaldo", "Respaldo y espacio"]];

/** Grupos del menú lateral en computador (las mismas pestañas de siempre, agrupadas). */
const SECCIONES: [string, string[]][] = [
  ["Principal", ["inicio", "recepcion", "pend", "entregados", "pedidos", "solicitudes", "clientes"]],
  ["Gestión financiera", ["caja", "cuentas", "sueldo", "sueldos"]],
  ["Administración", ["mas", ...ADMIN_ESCRITORIO.map(([k]) => k)]],
];

const iconoTema = { viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, "aria-hidden": true };
const IconoSol = () => <svg {...iconoTema}><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" /></svg>;
const IconoLuna = () => <svg {...iconoTema}><path d="M21 12.8A8.5 8.5 0 1 1 11.2 3a6.5 6.5 0 0 0 9.8 9.8z" /></svg>;
const IconoContraer = () => <svg {...iconoTema}><path d="M11 17l-5-5 5-5M18 17l-5-5 5-5" /></svg>;
const IconoExpandir = () => <svg {...iconoTema}><path d="M13 17l5-5-5-5M6 17l5-5-5-5" /></svg>;

export default function AppInterna() {
  const usuario = useUsuario();
  // Al entrar (o al recargar con F5) se vuelve a la pestaña en la que estaba, si le corresponde a esta cuenta.
  useState(() => restaurarNavegacion(usuario.id, usuario.rol));
  const { tema, oscuro, cambiar } = useTema();
  const [menuColapsado, setMenuColapsado] = useState(false);
  return (
    <div className={"jsl" + (menuColapsado ? " menu-colapsado" : "")} data-theme={tema === "sistema" ? undefined : tema}>
      <ProveedorDatos usuario={usuario}>
        <ProveedorVentana><Marco oscuro={oscuro} cambiarTema={cambiar} colapsado={menuColapsado} alternarMenu={() => setMenuColapsado(v => !v)} /></ProveedorVentana>
      </ProveedorDatos>
    </div>
  );
}

function Marco({ oscuro, cambiarTema, colapsado, alternarMenu }: { oscuro: boolean; cambiarTema: () => void; colapsado: boolean; alternarMenu: () => void }) {
  useEventos();
  const { usuario, salir } = useSesion();
  const { version, tocar, error } = useDatos();
  const ventana = useVentana();
  const escritorio = useEscritorio();
  const [perfilAbierto, setPerfilAbierto] = useState(false);
  const perfilRef = useRef<HTMLDivElement>(null);
  const esAdmin = usuario?.rol === "admin", esAsistente = usuario?.rol === "asistente";
  if (esAsistente) E.rol = "admin"; else if (!esAdmin) E.rol = "mensajero";
  const pintar = () => tocar();
  const enMensajero = E.rol === "mensajero";
  // Misma consulta que la campanita (comparten caché): el número de la pestaña Solicitudes.
  const solicitudesAbiertas = useSolicitudes(!enMensajero);

  // Pestañas de cada modo, como en el prototipo
  let items: ItemNav[], actual: string, elegir: (k: string) => void;
  if (enMensajero) {
    items = [["inicio", "Inicio"], ["recepcion", "Recepción"], ["pend", "Pedidos", pendientesMios().length + porRecogerMios().length + devolucionesPorDefinirMios().length], ["caja", "Mi caja"], ["sueldo", "Mi sueldo"], ["entregados", "Entregados"]];
    actual = E.tabM; elegir = k => { E.tabM = k; };
  } else {
    const sin = Object.values(S.pedidos).filter((p: Pedido) => !p.clienteId).length;
    const nSol = solicitudesAbiertas.data ? solicitudesAbiertas.data.conteo.pendiente + solicitudesAbiertas.data.conteo.cotizada + solicitudesAbiertas.data.conteo.confirmada : 0;
    const base: ItemNav[] = [["inicio", "Inicio"], ["pedidos", "Pedidos", sin], ["solicitudes", "Solicitudes", nSol], ["clientes", "Clientes"], ["caja", "Caja"], ["cuentas", "Cuentas"], ["sueldos", "Sueldos"]];
    // El asistente no ve Sueldos ni Administración, como en el prototipo.
    const propias = esAdmin ? base : base.filter(([k]) => ["inicio", "pedidos", "solicitudes", "clientes", "caja", "cuentas"].includes(k));
    // En el escritorio no hay "Más": sus sub-pestañas se abren desde el menú lateral. En el celular sigue igual.
    items = esAdmin ? (escritorio ? [...propias, ...ADMIN_ESCRITORIO] : [...propias, ["mas", "Más"]]) : propias;
    if (!items.some(([k]) => k === E.tabA) && !(esAdmin && E.tabA === "mas")) E.tabA = "inicio";
    actual = escritorio && esAdmin && E.tabA === "mas" ? E.subMas : E.tabA;
    elegir = k => { if (ADMIN_ESCRITORIO.some(([x]) => x === k)) { E.tabA = "mas"; E.subMas = k; } else E.tabA = k; };
  }
  // Apuntar o tocar un botón del menú ya empieza a bajar esa pestaña (solo en la oficina; el mensajero va en un solo archivo).
  const intencion = (k: string) => { if (!enMensajero) precargarPestana(k); };
  const ir = (k: string) => {
    if (k === "pedidos" && !enMensajero) Object.assign(E, { filtroA: estadoInicialPedidos(), buscarA: "", mensPedA: "", diaPedA: "", paginaA: 1 });
    elegir(k); pintar(); scrollTo(0, 0);
  };
  const boton = ([k, t, n]: ItemNav) => (
    <button key={k} aria-current={actual === k ? "page" : undefined} aria-label={t} title={t} onClick={() => ir(k)} onPointerEnter={() => intencion(k)} onFocus={() => intencion(k)} onTouchStart={() => intencion(k)}><Icono n={k} /><span className="t">{t}</span>{n ? <span className="num">{n}</span> : null}</button>
  );
  // Solo se piden al servidor las colecciones que usa la vista abierta (las demás, al abrirla).
  const cargaVista = !enMensajero && E.tabA === "inicio" ? <DashboardSkeleton /> : cargando;
  const listo = useColecciones(necesarias(E.rol, enMensajero ? E.tabM : E.tabA));
  // La pestaña y sub-pestaña quedan en la URL y en sessionStorage para la próxima recarga.
  usePersistedTab(CLAVE_NAV_ADMIN, usuario?.id || "", navegacionActual());
  const cabe = items.length <= 5, vis = cabe ? items : items.slice(0, 4), resto = cabe ? [] : items.slice(4);
  const enResto = resto.find(([k]) => k === actual), nResto = resto.reduce((a, [, , n]) => a + (n || 0), 0);
  const abrirMenu = () => ventana.abrir(<>
    <header><h2>Menú</h2><button className="cerrar" data-cerrar aria-label="Cerrar">×</button></header>
    <div className="menu-grid">
      {items.map(([k, t, n]) => <button key={k} aria-current={actual === k ? "page" : undefined} onTouchStart={() => intencion(k)} onFocus={() => intencion(k)} onClick={() => { ventana.cerrar(); ir(k); }}><Icono n={k} /><span>{t}{n ? <> <span className="etq sin">{n}</span></> : null}</span></button>)}
      <button type="button" onClick={() => { cambiarTema(); ventana.cerrar(); }}>
        {oscuro ? <IconoSol /> : <IconoLuna />}
        <span>{oscuro ? "Modo claro" : "Modo oscuro"}</span>
      </button>
    </div>
  </>);

  // Saludo con la hora de Colombia
  const nom = usuario?.nombre || usuario?.email || "", h = horaActual();
  const corto = nom.includes("@") ? nom.split("@")[0] : nom.split(" ")[0];
  const iniciales = nom.replace(/@.*/, "").split(/\s+/).filter(Boolean).slice(0, 2).map(x => x[0]).join("").toUpperCase();
  const cambiarRol = (r: "mensajero" | "admin") => { E.rol = r; guardarLocal("js_rol", r); pintar(); scrollTo(0, 0); };
  const pendientesMensajero = pendientesMios().length + porRecogerMios().length + devolucionesPorDefinirMios().length;

  useEffect(() => {
    if (!perfilAbierto) return;
    const alTocar = (e: PointerEvent) => { if (!perfilRef.current?.contains(e.target as Node)) setPerfilAbierto(false); };
    const alTeclado = (e: KeyboardEvent) => { if (e.key === "Escape") setPerfilAbierto(false); };
    document.addEventListener("pointerdown", alTocar);
    document.addEventListener("keydown", alTeclado);
    return () => { document.removeEventListener("pointerdown", alTocar); document.removeEventListener("keydown", alTeclado); };
  }, [perfilAbierto]);
  useEffect(() => { if (escritorio) setPerfilAbierto(false); }, [escritorio]);

  useEffect(() => { document.title = "JS Logistics"; }, []);
  // Mientras llegan los datos, se baja la pantalla del modo actual: así no se espera una cosa después de la otra.
  useEffect(() => { (enMensajero ? Mensajero : Oficina).precargar().catch(() => { /* se reintenta al pintarla */ }); }, [enMensajero]);
  // Cuando el navegador queda libre se baja la librería de avisos, para que el primer aviso no espere (sobre todo sin señal).
  useEffect(() => {
    if ("requestIdleCallback" in window) { const id = requestIdleCallback(precargarAvisos, { timeout: 5000 }); return () => cancelIdleCallback(id); }
    const id = setTimeout(precargarAvisos, 3000);
    return () => clearTimeout(id);
  }, []);
  void version;

  return <>
    <aside className="lateral" id="lateral">
      <div className="marca-lat"><img src="/logo_JS_sin_texto.webp" alt="" /><div className="marca-lat-txt"><b className="marca-lat-nombre">JS Logistics</b><small className="marca-lat-eslogan">Servir es nuestra labor</small></div></div>
      <nav id="navLateral" aria-label="Menú principal">
        {SECCIONES.map(([titulo, claves]) => { const xs = items.filter(([k]) => claves.includes(k)); return xs.length ? <div className="lat-grupo" key={titulo}><span className="lat-titulo">{titulo}</span>{xs.map(boton)}</div> : null; })}
      </nav>
      <div className="lat-pie">
        <button type="button" className="plegar" onClick={alternarMenu} aria-label={colapsado ? "Expandir menú" : "Colapsar menú"} title={colapsado ? "Expandir menú" : "Colapsar menú"}>
          {colapsado ? <IconoExpandir /> : <><span>Colapsar menú</span><IconoContraer /></>}
        </button>
      </div>
    </aside>
    <header className="barra">
      <div className="barra-escritorio">
        <div className="marca"><img src="/logo_JS_sin_texto.webp" alt="" /><span>JS Logistics<small>Servir es nuestra labor</small></span></div>
        <div className="saludo" id="saludo"><b>{h < 12 ? "Buenos días" : h < 19 ? "Buenas tardes" : "Buenas noches"}{corto ? ", " + corto : ""}</b><span>{fechaLarga(hoy())}</span></div>
        {!esAsistente && (
          <div className="rol" id="rol" role="group" aria-label="Modo">
            <button aria-pressed={E.rol === "mensajero"} onClick={() => cambiarRol("mensajero")}>Mensajero</button>
            {esAdmin && <button aria-pressed={E.rol === "admin"} id="btnAdmin" onClick={() => cambiarRol("admin")}>Administración</button>}
          </div>
        )}
        {!enMensajero && <Campanita />}
        {nom && <span className="avatar" id="avatar" aria-hidden="true">{iniciales}</span>}
        <button type="button" className="tema" onClick={cambiarTema} aria-label={oscuro ? "Cambiar a modo claro" : "Cambiar a modo oscuro"} title={oscuro ? "Cambiar a modo claro" : "Cambiar a modo oscuro"}>{oscuro ? <IconoSol /> : <IconoLuna />}</button>
        <button className="salir" id="btnSalir" aria-label="Cerrar sesión" onClick={() => salir()}><IconoSalir /><span>Salir</span></button>
      </div>
      <div className="barra-movil">
        <div className="marca marca-movil"><img src="/logo_JS_sin_texto.webp" alt="JS Logistics" /></div>
        <div className="barra-movil-acciones">
          {!enMensajero ? <Campanita /> : <button type="button" className="campana" aria-label={`Pedidos pendientes: ${pendientesMensajero}`} onClick={() => ir("pend")}><IconoCampana />{pendientesMensajero > 0 && <span className="campana-num" aria-hidden="true">{pendientesMensajero > 9 ? "9+" : pendientesMensajero}</span>}</button>}
          <div className="perfil-area" ref={perfilRef}>
            <button type="button" className="perfil-disparador avatar" aria-label="Menú de perfil y opciones" aria-expanded={perfilAbierto} aria-controls="perfil-movil" onClick={() => setPerfilAbierto(v => !v)}>{iniciales || "JS"}</button>
            {perfilAbierto && <div className="perfil-popover" id="perfil-movil" role="group" aria-label="Opciones de perfil">
              <div className="perfil-info"><b>{nom}</b><small>Vista: {enMensajero ? "Mensajero" : "Administración"}</small></div>
              {esAdmin && <div className="perfil-modos"><span>Cambiar modo de vista</span><div role="group" aria-label="Modo"><button type="button" aria-pressed={enMensajero} onClick={() => { cambiarRol("mensajero"); setPerfilAbierto(false); }}>Mensajero</button><button type="button" aria-pressed={!enMensajero} onClick={() => { cambiarRol("admin"); setPerfilAbierto(false); }}>Administración</button></div></div>}
              <button type="button" className="perfil-opcion" onClick={() => { cambiarTema(); setPerfilAbierto(false); }}>{oscuro ? <IconoSol /> : <IconoLuna />}<span>{oscuro ? "Modo claro" : "Modo oscuro"}</span></button>
              <button type="button" className="perfil-opcion perfil-salir" onClick={() => { setPerfilAbierto(false); void salir(); }}><IconoSalir /><span>Cerrar sesión</span></button>
            </div>}
          </div>
        </div>
      </div>
    </header>
    <main id="vista" className={!enMensajero && E.tabA === "pedidos" ? "vista-pedidos-oficina" : !enMensajero && E.tabA === "solicitudes" ? "vista-solicitudes-oficina" : !enMensajero && E.tabA === "clientes" ? "vista-clientes-oficina" : undefined}>
      {error && <div className="aviso alerta">No se pudieron traer los datos: {error} Se vuelve a intentar solo en unos segundos.</div>}
      {!listo && !error ? cargaVista : <Suspense fallback={cargaVista}>{enMensajero ? <Mensajero pintar={pintar} /> : <Oficina pintar={pintar} />}</Suspense>}
    </main>
    <nav className="pestanas" id="pestanas" aria-label="Secciones">
      {vis.map(boton)}
      {resto.length > 0 && <button aria-current={enResto ? "page" : undefined} onClick={abrirMenu}><Icono n={enResto ? enResto[0] : "menu"} /><span className="t">{enResto ? enResto[1] : "Menú"}</span>{nResto ? <span className="num">{nResto}</span> : null}</button>}
    </nav>
    {!enMensajero && <AvisoSolicitud solicitudes={solicitudesAbiertas.data?.solicitudes} />}
  </>;
}
