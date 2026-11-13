/* Modo Patinador de administración: como el modo Mensajero, el admin elige un patinador y ve y anota en su caja
   (Mi caja e Historial), con las mismas pantallas que usa el patinador. Lo que anota queda en la caja de ese patinador. */
import { E, guardarLocal } from "../estado";
import { S, listaOrdenada, tipoDe } from "../motor";
import { VistaPatinador } from "./Vista";

export default function PatinadorDesdeOficina({ pintar }: { pintar: () => void }) {
  const pats = listaOrdenada(S.mensajeros, "nombre").filter(m => tipoDe(m) === "patinador");
  const elegido = S.mensajeros[E.miPatinador] && tipoDe(S.mensajeros[E.miPatinador]) === "patinador" ? S.mensajeros[E.miPatinador] : null;
  const elegir = (id: string) => { if (!id) return; E.miPatinador = id; guardarLocal("js_patinador", id); pintar(); scrollTo(0, 0); };
  const cambiar = (e: React.MouseEvent) => { e.preventDefault(); E.miPatinador = ""; guardarLocal("js_patinador", ""); pintar(); };

  if (!pats.length) return <><h1>Caja del patinador</h1><div className="vacio">Todavía no hay patinadores. Créalos en Administración → Más → Personal con el tipo Patinador.</div></>;
  if (!elegido) return <>
    <h1>Caja del patinador</h1>
    <p className="sub">Elige el patinador. Verás su caja y lo que anotes quedará a su nombre, como si lo anotara él.</p>
    <div className="campo"><label htmlFor="selPat">¿De cuál patinador?</label>
      <select id="selPat" value="" onChange={e => elegir(e.target.value)}><option value="">Elige el patinador…</option>{pats.map(m => <option key={m.id} value={m.id}>{m.nombre}</option>)}</select></div>
  </>;
  const ajeno = { id: elegido.id, nombre: elegido.nombre, cambiar: <> · <a href="#" onClick={cambiar}>cambiar</a></> };
  return <VistaPatinador tab={E.tabP} ajeno={ajeno} ir={t => { E.tabP = t; pintar(); scrollTo(0, 0); }} />;
}
