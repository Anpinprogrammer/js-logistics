/* Marco de la app interna, igual al prototipo: menú lateral en computador, barra arriba y pestañas abajo en el celular. */
import { useEffect } from "react";
import { useSesion, useUsuario } from "../auth/Sesion";
import { ProveedorDatos, useDatos } from "./datos";
import { ProveedorVentana, Icono, IconoSalir, useVentana } from "./ui";
import { E, guardarLocal } from "./estado";
import { S, fechaLarga, hoy, horaActual, type Pedido } from "./motor";
import Oficina from "./oficina/Oficina";
import Mensajero, { pendientesMios } from "./mensajero/Mensajero";
import "./estilos.css";
import "./ajustes.css";

export type ItemNav = [clave: string, nombre: string, num?: number];

export default function AppInterna() {
  const usuario = useUsuario();
  return (
    <div className="jsl">
      <ProveedorDatos usuario={usuario}>
        <ProveedorVentana><Marco /></ProveedorVentana>
      </ProveedorDatos>
    </div>
  );
}

function Marco() {
  const { usuario, salir } = useSesion();
  const { version, tocar, error, cargado } = useDatos();
  const ventana = useVentana();
  const esAdmin = usuario?.rol === "admin", esAsistente = usuario?.rol === "asistente";
  if (esAsistente) E.rol = "admin"; else if (!esAdmin) E.rol = "mensajero";
  const pintar = () => tocar();
  const enMensajero = E.rol === "mensajero";

  // Pestañas de cada modo, como en el prototipo
  let items: ItemNav[], actual: string, elegir: (k: string) => void;
  if (enMensajero) {
    items = [["inicio", "Inicio"], ["nuevo", "Nuevo"], ["pend", "Por entregar", pendientesMios().length], ["caja", "Mi caja"], ["sueldo", "Mi sueldo"], ["entregados", "Entregados"]];
    actual = E.tabM; elegir = k => { E.tabM = k; };
  } else {
    const sin = Object.values(S.pedidos).filter((p: Pedido) => !p.clienteId).length;
    items = ([["inicio", "Inicio"], ["pedidos", "Pedidos", sin], ["clientes", "Clientes"], ["caja", "Caja"], ["cuentas", "Cuentas"], ["sueldos", "Sueldos"], ["mas", "Más"]] as ItemNav[])
      .filter(([k]) => esAdmin || ["inicio", "pedidos", "clientes", "caja", "cuentas"].includes(k));
    if (!items.some(([k]) => k === E.tabA)) E.tabA = "inicio";
    actual = E.tabA; elegir = k => { E.tabA = k; };
  }
  const ir = (k: string) => { elegir(k); pintar(); scrollTo(0, 0); };
  const boton = ([k, t, n]: ItemNav) => (
    <button key={k} aria-current={actual === k ? "page" : undefined} onClick={() => ir(k)}><Icono n={k} /><span className="t">{t}</span>{n ? <span className="num">{n}</span> : null}</button>
  );
  const cabe = items.length <= 5, vis = cabe ? items : items.slice(0, 4), resto = cabe ? [] : items.slice(4);
  const enResto = resto.find(([k]) => k === actual), nResto = resto.reduce((a, [, , n]) => a + (n || 0), 0);
  const abrirMenu = () => ventana.abrir(<>
    <header><h2>Menú</h2><button className="cerrar" data-cerrar aria-label="Cerrar">×</button></header>
    <div className="menu-grid">{items.map(([k, t, n]) => <button key={k} aria-current={actual === k ? "page" : undefined} onClick={() => { ventana.cerrar(); ir(k); }}><Icono n={k} /><span>{t}{n ? <> <span className="etq sin">{n}</span></> : null}</span></button>)}</div>
  </>);

  // Saludo con la hora de Colombia
  const nom = usuario?.nombre || usuario?.email || "", h = horaActual();
  const corto = nom.includes("@") ? nom.split("@")[0] : nom.split(" ")[0];
  const iniciales = nom.replace(/@.*/, "").split(/\s+/).filter(Boolean).slice(0, 2).map(x => x[0]).join("").toUpperCase();
  const cambiarRol = (r: "mensajero" | "admin") => { E.rol = r; guardarLocal("js_rol", r); pintar(); scrollTo(0, 0); };

  useEffect(() => { document.title = "JS Logistics"; }, []);
  void version;

  return <>
    <aside className="lateral" id="lateral">
      <div className="marca-lat"><img src="/logo.png" alt="" /><span>JS Logistics<small>Servir es nuestra labor</small></span></div>
      <nav id="navLateral" aria-label="Menú principal">{items.map(boton)}</nav>
      <div className="lat-pie">JS Logistics · Cali</div>
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
      {nom && <span className="avatar" id="avatar" aria-hidden="true">{iniciales}</span>}
      <button className="salir" id="btnSalir" aria-label="Cerrar sesión" onClick={() => salir()}><IconoSalir /><span>Salir</span></button>
    </header>
    <main id="vista">
      {error && <div className="aviso alerta">No se pudieron traer los datos: {error} Se vuelve a intentar solo en unos segundos.</div>}
      {!cargado && !error ? <div className="vacio">Cargando…</div> : enMensajero ? <Mensajero pintar={pintar} /> : <Oficina pintar={pintar} />}
    </main>
    <nav className="pestanas" id="pestanas" aria-label="Secciones">
      {vis.map(boton)}
      {resto.length > 0 && <button aria-current={enResto ? "page" : undefined} onClick={abrirMenu}><Icono n={enResto ? enResto[0] : "menu"} /><span className="t">{enResto ? enResto[1] : "Menú"}</span>{nResto ? <span className="num">{nResto}</span> : null}</button>}
    </nav>
  </>;
}
