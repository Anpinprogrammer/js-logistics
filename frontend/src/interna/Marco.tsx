/* Marco de la app interna, igual al prototipo: menú lateral en computador, barra arriba y pestañas abajo en el celular. */
import { Suspense, useEffect, useState } from "react";
import { useSesion, useUsuario } from "../auth/Sesion";
import { ProveedorDatos, useDatos } from "./datos";
import { ProveedorVentana, Icono, IconoSalir, useVentana } from "./ui";
import { E, guardarLocal } from "./estado";
import { useTema } from "./tema";
import { Campanita, useSolicitudes } from "./Solicitudes";
import { S, fechaLarga, hoy, horaActual, type Pedido } from "./motor";
import { pendientesMios } from "./mensajero/pendientes";
import { useEscritorio } from "../lib/pantalla";
import { perezoso } from "../lib/perezoso";
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
  ["Principal", ["inicio", "nuevo", "pend", "entregados", "pedidos", "solicitudes", "clientes"]],
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
  const { usuario, salir } = useSesion();
  const { version, tocar, error, cargado } = useDatos();
  const ventana = useVentana();
  const escritorio = useEscritorio();
  const esAdmin = usuario?.rol === "admin", esAsistente = usuario?.rol === "asistente";
  if (esAsistente) E.rol = "admin"; else if (!esAdmin) E.rol = "mensajero";
  const pintar = () => tocar();
  const enMensajero = E.rol === "mensajero";
  // Misma consulta que la campanita (comparten caché): el número de la pestaña Solicitudes.
  const solicitudesAbiertas = useSolicitudes(!enMensajero);

  // Pestañas de cada modo, como en el prototipo
  let items: ItemNav[], actual: string, elegir: (k: string) => void;
  if (enMensajero) {
    items = [["inicio", "Inicio"], ["nuevo", "Nuevo"], ["pend", "Por entregar", pendientesMios().length], ["caja", "Mi caja"], ["sueldo", "Mi sueldo"], ["entregados", "Entregados"]];
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
  const ir = (k: string) => { elegir(k); pintar(); scrollTo(0, 0); };
  const boton = ([k, t, n]: ItemNav) => (
    <button key={k} aria-current={actual === k ? "page" : undefined} aria-label={t} title={t} onClick={() => ir(k)}><Icono n={k} /><span className="t">{t}</span>{n ? <span className="num">{n}</span> : null}</button>
  );
  const cabe = items.length <= 5, vis = cabe ? items : items.slice(0, 4), resto = cabe ? [] : items.slice(4);
  const enResto = resto.find(([k]) => k === actual), nResto = resto.reduce((a, [, , n]) => a + (n || 0), 0);
  const abrirMenu = () => ventana.abrir(<>
    <header><h2>Menú</h2><button className="cerrar" data-cerrar aria-label="Cerrar">×</button></header>
    <div className="menu-grid">
      {items.map(([k, t, n]) => <button key={k} aria-current={actual === k ? "page" : undefined} onClick={() => { ventana.cerrar(); ir(k); }}><Icono n={k} /><span>{t}{n ? <> <span className="etq sin">{n}</span></> : null}</span></button>)}
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

  useEffect(() => { document.title = "JS Logistics"; }, []);
  // Mientras llegan los datos, se baja la pantalla del modo actual: así no se espera una cosa después de la otra.
  useEffect(() => { (enMensajero ? Mensajero : Oficina).precargar().catch(() => { /* se reintenta al pintarla */ }); }, [enMensajero]);
  void version;

  return <>
    <aside className="lateral" id="lateral">
      <div className="marca-lat"><img src="/logo.png" alt="" /><div className="marca-lat-txt"><b className="marca-lat-nombre">JS Logistics</b><small className="marca-lat-eslogan">Servir es nuestra labor</small></div></div>
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
      <div className="marca"><img src="/logo.png" alt="" /><span>JS Logistics<small>Servir es nuestra labor</small></span></div>
      <div className="saludo" id="saludo"><b>{h < 12 ? "Buenos días" : h < 19 ? "Buenas tardes" : "Buenas noches"}{corto ? ", " + corto : ""}</b><span>{fechaLarga(hoy())}</span></div>
      {!esAsistente && (
        <div className="rol" id="rol" role="group" aria-label="Modo">
          <button aria-pressed={E.rol === "mensajero"} onClick={() => cambiarRol("mensajero")}>Mensajero</button>
          {esAdmin && <button aria-pressed={E.rol === "admin"} id="btnAdmin" onClick={() => cambiarRol("admin")}>Administración</button>}
        </div>
      )}
      {!enMensajero && <Campanita />}
      {nom && <span className="avatar" id="avatar" aria-hidden="true">{iniciales}</span>}
      <button
        type="button"
        className="tema"
        onClick={cambiarTema}
        aria-label={oscuro ? "Cambiar a modo claro" : "Cambiar a modo oscuro"}
        title={oscuro ? "Cambiar a modo claro" : "Cambiar a modo oscuro"}
      >
        {oscuro ? <IconoSol /> : <IconoLuna />}
      </button>
      <button className="salir" id="btnSalir" aria-label="Cerrar sesión" onClick={() => salir()}><IconoSalir /><span>Salir</span></button>
    </header>
    <main id="vista">
      {error && <div className="aviso alerta">No se pudieron traer los datos: {error} Se vuelve a intentar solo en unos segundos.</div>}
      {!cargado && !error ? cargando : <Suspense fallback={cargando}>{enMensajero ? <Mensajero pintar={pintar} /> : <Oficina pintar={pintar} />}</Suspense>}
    </main>
    <nav className="pestanas" id="pestanas" aria-label="Secciones">
      {vis.map(boton)}
      {resto.length > 0 && <button aria-current={enResto ? "page" : undefined} onClick={abrirMenu}><Icono n={enResto ? enResto[0] : "menu"} /><span className="t">{enResto ? enResto[1] : "Menú"}</span>{nResto ? <span className="num">{nResto}</span> : null}</button>}
    </nav>
  </>;
}
