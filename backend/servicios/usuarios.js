/* Accesos a la app (usuarios): página de la lista para la sub-pestaña Acceso de Personal.
   Ordena igual que la app (por nombre y, si empatan, por correo) y corta la página pedida. */
import * as Usuario from "../models/usuario.model.js";
import { exigirAdmin } from "./contexto.js";
import { sinTildes } from "../helpers/texto.js";

/** Filtra por rol y por nombre o correo, y corta la página; sin tamaño devuelve 10 (5 en celular, 10 en computador). */
export function armarPaginaUsuarios(usuarios, { buscar = "", rol = "", pagina, porPagina } = {}) {
  const q = sinTildes(String(buscar || "").trim());
  const lista = [...usuarios]
    .filter(u => !rol || u.rol === rol)
    .filter(u => !q || sinTildes((u.nombre || "") + " " + (u.email || "")).includes(q))
    .sort((a, b) =>
      String(a.nombre || "").localeCompare(String(b.nombre || ""), "es")
      || String(a.email || "").localeCompare(String(b.email || ""), "es"));
  const tam = Math.max(1, Math.min(100, Number(porPagina) || 10));
  const paginas = Math.max(1, Math.ceil(lista.length / tam));
  const actual = Math.min(Math.max(1, Number(pagina) || 1), paginas);
  return { usuarios: lista.slice((actual - 1) * tam, actual * tam), pagina: actual, porPagina: tam, total: lista.length, paginas };
}

/** GET /usuarios/pagina: los accesos filtrados, por páginas. */
export async function paginaAccesos(ctx, { buscar, rol, pagina, porPagina } = {}) {
  exigirAdmin(ctx.actor);
  return armarPaginaUsuarios(await Usuario.listar(), { buscar, rol, pagina, porPagina });
}
