/* Oficina: resumen del día. */
import { Link } from "react-router";
import { useQuery } from "@tanstack/react-query";
import { pedidos } from "../../api/servicios";
import { mensajeDe } from "../../api/cliente";
import { useUsuario } from "../../auth/Sesion";
import { hoy, inicioDia, moverDia, pesos } from "../../lib/formato";
import { Aviso, Cargando, Titulo } from "../../components/ui";

const Cifra = ({ t, v, sub, tono }: { t: string; v: string | number; sub?: string; tono?: string }) => (
  <div className="caja p-4">
    <p className="text-sm text-suave">{t}</p>
    <p className={`mt-1 text-2xl font-bold ${tono ?? ""}`}>{v}</p>
    {sub && <p className="text-xs text-suave">{sub}</p>}
  </div>
);

export default function Inicio() {
  const u = useUsuario();
  const d = hoy();
  const hoyQ = useQuery({ queryKey: ["pedidos", "hoy", d], queryFn: () => pedidos.listar({ desde: inicioDia(d), hasta: inicioDia(moverDia(d, 1)), limite: 500 }) });
  const enRuta = useQuery({ queryKey: ["pedidos", "enruta"], queryFn: () => pedidos.listar({ estado: "pendiente", limite: 500 }) });
  const conDif = useQuery({ queryKey: ["pedidos", "dif"], queryFn: () => pedidos.listar({ conDiferencia: true, limite: 500 }) });

  if (hoyQ.isPending || enRuta.isPending) return <Cargando />;
  if (hoyQ.error) return <Aviso tipo="error">{mensajeDe(hoyQ.error)}</Aviso>;

  const P = hoyQ.data.pedidos, R = enRuta.data?.pedidos ?? [];
  const entregados = P.filter(p => p.estado === "entregado"), devueltos = P.filter(p => p.estado === "devuelto");
  const sinRemitente = P.filter(p => !p.clienteId).length;
  const viejos = R.filter(p => p.creado < inicioDia(d)).length;
  const cobrado = entregados.reduce((s, p) => s + (p.metodo === "transf_cliente" ? 0 : p.valorCobrado), 0);
  const domicilios = P.reduce((s, p) => s + p.valorServicio, 0);

  // Por mensajero: lo de hoy
  const porMens = new Map<string, { nombre: string; total: number; ent: number; ruta: number }>();
  for (const p of P) {
    const m = porMens.get(p.mensajeroId) ?? { nombre: p.mensajeroNombre || "?", total: 0, ent: 0, ruta: 0 };
    m.total++; if (p.estado === "entregado") m.ent++; if (p.estado === "pendiente") m.ruta++;
    porMens.set(p.mensajeroId, m);
  }

  return (
    <>
      <Titulo sub={new Date().toLocaleDateString("es-CO", { timeZone: "America/Bogota", weekday: "long", day: "numeric", month: "long" })}>
        Hola, {u.nombre.split(" ")[0] || "equipo"}
      </Titulo>
      <div className="space-y-2">
        {sinRemitente > 0 && <Aviso tipo="alerta">{sinRemitente} guía(s) de hoy sin remitente. <Link className="font-semibold underline" to="/pedidos">Asignarlas</Link></Aviso>}
        {(conDif.data?.pedidos.length ?? 0) > 0 && <Aviso tipo="alerta">{conDif.data!.pedidos.length} entrega(s) con un valor cobrado distinto al que debían cobrar. <Link className="font-semibold underline" to="/pedidos?dif=1">Revisarlas</Link></Aviso>}
        {viejos > 0 && <Aviso tipo="info">{viejos} guía(s) de días anteriores siguen en ruta.</Aviso>}
      </div>
      <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Cifra t="Guías de hoy" v={P.length} sub={`${R.length} en ruta en total`} />
        <Cifra t="Entregadas" v={entregados.length} tono="text-verde" />
        <Cifra t="Devueltas" v={devueltos.length} tono={devueltos.length ? "text-rojo" : ""} />
        <Cifra t="Cobrado hoy" v={pesos(cobrado)} sub={`Domicilios ${pesos(domicilios)}`} />
      </div>
      <section className="caja mt-4 p-5">
        <h2 className="mb-3 font-bold">Mensajeros hoy</h2>
        {!porMens.size ? <p className="text-sm text-suave">Todavía no hay guías hoy.</p> : (
          <ul className="divide-y divide-linea">
            {[...porMens.entries()].sort((a, b) => b[1].total - a[1].total).map(([id, m]) => (
              <li key={id} className="flex items-center justify-between gap-3 py-2 text-sm">
                <span className="font-medium">{m.nombre}</span>
                <span className="text-suave">{m.total} guías · {m.ent} entregadas · {m.ruta} en ruta</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
