/* Estructura de la app: menú lateral en computador y barra de íconos abajo en el celular (como la app actual). */
import { NavLink, Outlet } from "react-router";
import type { ReactNode } from "react";
import { useSesion, useUsuario } from "../auth/Sesion";
import { ROLES } from "../lib/formato";
import { IcInicio, IcPaquete, IcRuta, IcCheck, IcClientes, IcPersonal, IcLlave, IcCaja, IcCuenta, IcSalir } from "./Iconos";
import { cx } from "./ui";

interface Item { a: string; t: string; ic: ReactNode; corto?: string }

function menu(rol: string): Item[] {
  if (rol === "mensajero") return [
    { a: "/ruta", t: "Mi ruta", ic: <IcRuta /> },
    { a: "/entregados", t: "Entregados", ic: <IcCheck /> },
    { a: "/cuenta", t: "Mi cuenta", ic: <IcCuenta />, corto: "Cuenta" }
  ];
  const items: Item[] = [
    { a: "/", t: "Inicio", ic: <IcInicio /> },
    { a: "/pedidos", t: "Pedidos", ic: <IcPaquete /> },
    { a: "/clientes", t: "Clientes", ic: <IcClientes /> },
    { a: "/caja", t: "Caja", ic: <IcCaja /> }
  ];
  if (rol === "admin") items.push(
    { a: "/personal", t: "Personal", ic: <IcPersonal /> },
    { a: "/accesos", t: "Accesos", ic: <IcLlave /> }
  );
  items.push({ a: "/cuenta", t: "Mi cuenta", ic: <IcCuenta />, corto: "Cuenta" });
  return items;
}

export default function Marco() {
  const u = useUsuario();
  const { salir } = useSesion();
  const items = menu(u.rol);

  return (
    <div className="min-h-dvh md:pl-64">
      {/* Menú lateral (computador) */}
      <aside className="fixed inset-y-0 left-0 hidden w-64 flex-col bg-noche text-white md:flex">
        <div className="flex items-center gap-3 px-5 py-6">
          <img src="/logo.png" alt="" className="size-10 rounded-xl" />
          <div className="leading-tight"><b>JS Logistics</b><small className="block text-xs text-lateral-suave">Servir es nuestra labor</small></div>
        </div>
        <nav aria-label="Menú principal" className="flex-1 space-y-1 px-3">
          {items.map(i => (
            <NavLink key={i.a} to={i.a} end={i.a === "/"}
              className={({ isActive }) => cx("flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition",
                isActive ? "bg-white/10 text-white" : "text-lateral-suave hover:bg-white/5 hover:text-white")}>
              {i.ic}{i.t}
            </NavLink>
          ))}
        </nav>
        <div className="border-t border-white/10 p-4 text-sm">
          <p className="truncate font-semibold">{u.nombre || u.email}</p>
          <p className="text-xs text-lateral-suave">{ROLES[u.rol]}</p>
          <button onClick={salir} className="mt-3 flex items-center gap-2 text-lateral-suave hover:text-white"><IcSalir />Salir</button>
        </div>
      </aside>

      {/* Barra superior (celular) */}
      <header className="sticky top-0 z-30 flex items-center gap-3 bg-noche px-4 py-3 text-white md:hidden" style={{ paddingTop: "max(12px, env(safe-area-inset-top))" }}>
        <img src="/logo.png" alt="" className="size-8 rounded-lg" />
        <b className="flex-1">JS Logistics</b>
        <span className="truncate text-xs text-lateral-suave">{u.nombre || u.email}</span>
      </header>

      <main className="mx-auto max-w-6xl px-4 pb-28 pt-5 md:px-8 md:pb-10 md:pt-8">
        <Outlet />
      </main>

      {/* Barra de íconos (celular) */}
      <nav aria-label="Secciones" className="fixed inset-x-0 bottom-0 z-30 flex border-t border-linea bg-papel md:hidden"
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}>
        {items.filter(i => !["/personal", "/accesos"].includes(i.a)).map(i => (
          <NavLink key={i.a} to={i.a} end={i.a === "/"}
            className={({ isActive }) => cx("flex min-h-14 flex-1 flex-col items-center justify-center gap-0.5 text-[11px] font-medium",
              isActive ? "text-marca" : "text-suave")}>
            {i.ic}{i.corto || i.t}
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
