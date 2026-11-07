/* Estructura de la app: menú lateral en computador y barra de íconos abajo en el celular (como la app actual). */
import { NavLink, Outlet } from "react-router";
import type { ReactNode } from "react";
import { useSesion, useUsuario } from "../auth/Sesion";
import { ROLES } from "../lib/formato";
import { IcInicio, IcPaquete, IcRuta, IcCheck, IcClientes, IcPersonal, IcLlave, IcCaja, IcCuenta, IcSalir } from "./Iconos";
import { cx } from "./ui";

interface Item { a: string; t: string; ic: ReactNode; corto?: string }
interface Grupo { titulo: string; items: Item[] }

function grupos(rol: string): Grupo[] {
  const cuenta: Grupo = { titulo: "Configuración", items: [{ a: "/cuenta", t: "Mi cuenta", ic: <IcCuenta />, corto: "Cuenta" }] };
  if (rol === "mensajero") return [
    { titulo: "Principal", items: [
      { a: "/ruta", t: "Mi ruta", ic: <IcRuta /> },
      { a: "/entregados", t: "Entregados", ic: <IcCheck /> }
    ] },
    cuenta
  ];
  const g: Grupo[] = [
    { titulo: "Principal", items: [
      { a: "/", t: "Inicio", ic: <IcInicio /> },
      { a: "/pedidos", t: "Pedidos", ic: <IcPaquete /> },
      { a: "/clientes", t: "Clientes", ic: <IcClientes /> }
    ] },
    { titulo: "Gestión financiera", items: [{ a: "/caja", t: "Caja", ic: <IcCaja /> }] }
  ];
  if (rol === "admin") g.push({ titulo: "Administración", items: [
    { a: "/personal", t: "Personal", ic: <IcPersonal /> },
    { a: "/accesos", t: "Accesos", ic: <IcLlave /> }
  ] });
  g.push(cuenta);
  return g;
}

const iniciales = (n: string) => n.trim().split(/\s+/).slice(0, 2).map(p => p[0]?.toUpperCase() ?? "").join("") || "?";

export default function Marco() {
  const u = useUsuario();
  const { salir } = useSesion();
  const secciones = grupos(u.rol);
  const items = secciones.flatMap(g => g.items);
  const nombre = u.nombre || u.email;

  return (
    <div className="min-h-dvh md:pl-64">
      {/* Menú lateral (computador) */}
      <aside className="fixed inset-y-0 left-0 hidden w-64 flex-col border-r border-[#1e293b] bg-[#0b0f19] text-white md:flex">
        <div className="flex items-center gap-3 border-b border-[#1e293b] px-5 py-5">
          {/* Badge claro: el isotipo es azul oscuro y sobre fondo oscuro se pierde. El .webp trae el texto en blanco, por eso se recorta. */}
          <div className="grid size-12 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-white to-sky-100 p-1 shadow-[0_0_16px_2px_rgba(56,189,248,.35)]">
            <div className="relative size-full overflow-hidden rounded-lg">
              <img src="/icono-96.webp" alt="" width={96} height={96} className="absolute left-[-10%] top-[3%] w-[120%] max-w-none" />
            </div>
          </div>
          <div className="min-w-0 leading-tight">
            <p className="truncate font-semibold text-white">JS Logistics</p>
            <p className="mt-0.5 truncate text-xs text-[#94a3b8]">Servir es nuestra labor</p>
          </div>
        </div>

        <nav aria-label="Menú principal" className="flex-1 space-y-5 overflow-y-auto px-3 py-5">
          {secciones.map(g => (
            <div key={g.titulo}>
              <p className="mb-2 px-3 text-xs font-semibold uppercase tracking-wider text-slate-500">{g.titulo}</p>
              <div className="space-y-1">
                {g.items.map(i => (
                  <NavLink key={i.a} to={i.a} end={i.a === "/"}
                    className={({ isActive }) => cx(
                      "flex items-center gap-3 rounded-lg border-l-[3px] px-3 py-2.5 text-sm font-medium transition-colors",
                      isActive
                        ? "border-[#38bdf8] bg-gradient-to-r from-sky-500/15 to-sky-500/5 text-sky-400 [&>svg]:drop-shadow-[0_0_6px_rgba(56,189,248,.7)]"
                        : "border-transparent text-[#94a3b8] hover:bg-slate-800/50 hover:text-[#f8fafc]")}>
                    {i.ic}{i.t}
                  </NavLink>
                ))}
              </div>
            </div>
          ))}
        </nav>

        <div className="border-t border-[#1e293b] p-4">
          <div className="flex items-center gap-3">
            <span aria-hidden className="grid size-10 shrink-0 place-items-center rounded-full bg-gradient-to-br from-[#0284c7] to-[#38bdf8] text-sm font-bold text-white ring-2 ring-sky-400/30">
              {iniciales(nombre)}
            </span>
            <div className="min-w-0 leading-tight">
              <p className="truncate text-sm font-semibold text-white">{nombre}</p>
              <p className="mt-0.5 text-xs text-[#94a3b8]">{ROLES[u.rol]}</p>
            </div>
          </div>
          <button onClick={salir}
            className="mt-3 flex w-full items-center justify-center gap-2 rounded-lg border border-[#1e293b] bg-slate-800/40 px-3 py-2 text-sm font-medium text-[#94a3b8] transition-colors hover:border-red-400/40 hover:bg-red-500/10 hover:text-red-300">
            <IcSalir />Salir
          </button>
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
