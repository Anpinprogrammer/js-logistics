/* Oficina → Clientes, la cuenta de un cliente, el formulario y el envío de saldos por WhatsApp, igual al prototipo. */
import { useCallback, useEffect, useRef, useState } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import {
  S, yo, hoy, hora, pesos, diaDe, listaOrdenada, saldoCliente, filasCuenta, sinTildes, normNom, normTel, parecidos, gruposRepetidos, telWhatsApp, linkSaldo, textoSaldo,
  nombreCliente, servicio, gastoDe, cargoEnvio, cambiaLoContado, yaContado, mueveCaja, esPago, fechaCaja, fechaDia,
  MOVS, MOVS_OFICINA, MEDIOS, type Medio, type TipoMov,
} from "../motor";
import { Cab, FiltroDia, Icono, IconoAgregarUsuario, IconoEditar, IconoFiltro, IconoInfo, Paginador, pl, useVentana } from "../ui";
import { WhatsAppIcon } from "../../components/icons/WhatsAppIcon";
import { E, guardarLocal } from "../estado";
import { actualizarPedido, borrarDe, guardarCliente, guardarMovimiento, unirClientes } from "../acciones";
import { motivoError, useDatos } from "../datos";
import { DEMO } from "../demo";
import { clientes as apiClientes } from "../../api/servicios";
import { usePorPagina } from "../../lib/pantalla";
import type { ClienteConSaldo, PaginaClientes } from "../../api/tipos";
import { avisoContado, diaAntesDelArqueo } from "./comun";
import { SelectorFecha } from "../Calendario";
import { armarListaClientes } from "../tiquete";
import { RecibosVarios, VentanaTiquete } from "./impresion";
import { ChevronDown, FileSpreadsheet, Plus, Printer } from "lucide-react";

const trazo = { viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": true } as const;
const IconoImprimir = () => <svg {...trazo}><path d="M7 9V3.5h10V9" /><rect x="3" y="9" width="18" height="8" rx="2" /><path d="M7 14h10v6.5H7z" /></svg>;
const IconoExcel = () => <svg {...trazo}><path d="M14 3H6.5A1.5 1.5 0 0 0 5 4.5v15A1.5 1.5 0 0 0 6.5 21h11a1.5 1.5 0 0 0 1.5-1.5V8z" /><path d="M14 3v5h5" /><path d="m9 12 5 5M14 12l-5 5" /></svg>;


/** Todos los clientes con su saldo (y lo de ese día, si hay día), separados en por cobrar y por pagar, como el
 *  prototipo. `k` da el valor con el que se mide cada uno: lo de ese día o el saldo. */
function clientesConSaldo(dia: string) {
  const cs: ClienteConSaldo[] = listaOrdenada(S.clientes, "nombre").map(c => ({
    ...c,
    saldo: saldoCliente(c.id),
    ...(dia ? { delDia: filasCuenta(c.id).filter(r => diaDe(r.fecha) === dia).reduce((a, r) => a + r.v, 0) } : {})
  }));
  const k = (c: ClienteConSaldo) => (dia ? c.delDia ?? 0 : c.saldo);
  return { cs, k, cobrar: cs.filter(c => k(c) < 0), pagar: cs.filter(c => k(c) > 0) };
}

/** La misma página que arma el servidor, calculada con los datos en memoria (modo demo). */
function paginaClientesDemo(filtro: string, dia: string, buscar: string, pagina: number, porPagina: number): PaginaClientes {
  const { cs, k, cobrar, pagar } = clientesConSaldo(dia);
  const q = sinTildes(buscar.trim()), qt = buscar.replace(/\D/g, "");
  const pasa = (c: ClienteConSaldo) => {
    const bus = sinTildes(c.nombre) + " " + normTel(c.telefono);
    return !q || bus.includes(q) || (qt.length >= 3 && bus.includes(qt));
  };
  const base = filtro === "cobrar" ? cobrar : filtro === "pagar" ? pagar : dia ? cs.filter(c => c.delDia) : cs;
  const filtrados = base.filter(pasa);
  const total = filtrados.length, paginas = Math.max(1, Math.ceil(total / porPagina)), actual = Math.min(Math.max(1, pagina), paginas);
  return {
    clientes: filtrados.slice((actual - 1) * porPagina, actual * porPagina),
    pagina: actual, porPagina, total, paginas, totalClientes: cs.length,
    porCobrar: { total: cobrar.reduce((a, c) => a - k(c), 0), clientes: cobrar.length },
    porPagar: { total: pagar.reduce((a, c) => a + k(c), 0), clientes: pagar.length },
    repetidos: yo.esAdmin ? gruposRepetidos().length : undefined
  };
}

export default function Clientes({ pintar }: { pintar: () => void }) {
  const v = useVentana();
  const { version } = useDatos();
  const porPagina = usePorPagina();
  const [buscar, setBuscar] = useState(E.buscarCli);
  const tBuscar = useRef<number>(0);
  const arriba = useRef<HTMLDivElement>(null);
  const dia = E.diaCliF;

  // La página, el filtro, el día y la búsqueda los resuelve el servidor; en demo se imitan en memoria.
  const q = useQuery({
    queryKey: ["clientes", "pagina", E.filtroCli, dia, E.buscarCli, E.paginaCli, porPagina, version],
    placeholderData: keepPreviousData,
    queryFn: () => DEMO
      ? Promise.resolve(paginaClientesDemo(E.filtroCli, dia, E.buscarCli, E.paginaCli, porPagina))
      : apiClientes.pagina({ filtro: E.filtroCli, dia, buscar: E.buscarCli }, E.paginaCli, porPagina)
  });
  const pag = q.data, filas = pag?.clientes ?? [], reps = pag?.repetidos ?? 0;
  const poner = (cambio: Partial<typeof E>) => { Object.assign(E, cambio); pintar(); };
  const irA = (n: number) => { E.paginaCli = n; pintar(); arriba.current?.scrollIntoView({ block: "start", behavior: "smooth" }); };
  const cambiarBusqueda = (x: string) => { setBuscar(x); clearTimeout(tBuscar.current); tBuscar.current = window.setTimeout(() => poner({ buscarCli: x, paginaCli: 1 }), 300); };
  const enviarSaldos = () => v.abrir(<EnvioMasivo tipo0={E.filtroCli === "pagar" ? "pagar" : "cobrar"} />, "drawer-ancho");
  const registrar = () => v.abrir(<FormCliente />, "centrada");

  // Imprimir y Excel (como el prototipo): se arman con todos los clientes en memoria, no solo con la página que se ve.
  const textoImprimir = "Imprimir " + (E.filtroCli === "cobrar" ? "por cobrar" : E.filtroCli === "pagar" ? "por pagar" : "por cobrar y por pagar");
  const textoCuadre = "Excel del cuadre " + (dia && dia !== hoy() ? "del día elegido" : "de hoy");
  const imprimirLista = () => {
    const { k, cobrar, pagar } = clientesConSaldo(dia);
    const fila = (c: ClienteConSaldo) => ({ nombre: c.nombre, v: k(c) });
    const secciones: [string, string, { nombre: string; v: number }[], number][] = [];
    if (E.filtroCli !== "pagar") secciones.push(["Cuentas por cobrar", "Te deben", cobrar.map(fila), cobrar.reduce((a, c) => a - k(c), 0)]);
    if (E.filtroCli !== "cobrar") secciones.push(["Cuentas por pagar", "Les debes", pagar.map(fila), pagar.reduce((a, c) => a + k(c), 0)]);
    v.abrir(<VentanaTiquete titulo="Imprimir lista" lista={[armarListaClientes(secciones, dia)]} />);
  };
  const imprimirRecibos = () => {
    const { cs, k, cobrar, pagar } = clientesConSaldo(dia);
    const lista = E.filtroCli === "cobrar" ? cobrar : E.filtroCli === "pagar" ? pagar : dia ? cs.filter(c => c.delDia) : cs;
    const valor = new Map(lista.map(c => [c.id, k(c)]));
    v.abrir(<RecibosVarios clientes={lista} k={id => valor.get(id) ?? 0} dia={dia} />);
  };
  const [preparando, setPreparando] = useState("");
  const excel = async (cual: "cartera" | "cuadre") => {
    if (preparando) return;
    setPreparando(cual);
    try {
      const { descargarCartera, descargarCuadre } = await import("./excelClientes");
      if (cual === "cartera") await descargarCartera();
      else if (!await descargarCuadre(dia || hoy())) v.avisar("No hay entregas ni pagos de clientes ese día");
    } catch (e) { console.error(e); v.avisar("No se pudo generar el Excel. Revisa la conexión e intenta otra vez."); }
    finally { setPreparando(""); }
  };
  // Celular: hoja con las cuatro opciones. La impresión abre su ventana encima (reemplaza la hoja); el Excel la cierra y se descarga.
  const abrirOpciones = () => v.abrir(<>
    <Cab><h2>Imprimir y Excel</h2></Cab>
    <div className="cli-opciones">
      {yo.esAdmin && <button type="button" className="btn sec" disabled={!!preparando} onClick={() => { v.cerrar(); void excel("cartera"); }}><IconoExcel /><span>Descargar cartera en Excel</span></button>}
      <button type="button" className="btn sec" onClick={imprimirLista}><IconoImprimir /><span>{textoImprimir}</span></button>
      <button type="button" className="btn sec" onClick={imprimirRecibos}><Icono n="recibos" /><span>Imprimir recibos{dia ? " del día" : ""}</span></button>
      {yo.esAdmin && <button type="button" className="btn sec" disabled={!!preparando} onClick={() => { v.cerrar(); void excel("cuadre"); }}><IconoExcel /><span>{textoCuadre}</span></button>}
    </div>
  </>, "centrada");

  // Celular: la cuenta y el día se preparan en una hoja y se aplican juntos, igual que en Pedidos y Solicitudes.
  const [filtrosAbiertos, setFiltrosAbiertos] = useState(false);
  const [borrador, setBorrador] = useState({ cuenta: E.filtroCli, dia });
  const cerrarFiltros = () => setFiltrosAbiertos(false);
  const abrirFiltros = () => { setBorrador({ cuenta: E.filtroCli, dia }); setFiltrosAbiertos(true); };
  const aplicarFiltros = () => { poner({ filtroCli: borrador.cuenta, diaCliF: borrador.dia, paginaCli: 1 }); cerrarFiltros(); };
  const filtrosActivos = Number(E.filtroCli !== "todos") + Number(!!dia);
  useEffect(() => {
    if (!filtrosAbiertos) return;
    const anterior = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const tecla = (e: KeyboardEvent) => { if (e.key === "Escape") cerrarFiltros(); };
    const pantalla = window.matchMedia("(min-width: 768px)");
    const alCambiarPantalla = () => { if (pantalla.matches) cerrarFiltros(); };
    document.addEventListener("keydown", tecla);
    pantalla.addEventListener("change", alCambiarPantalla);
    return () => { document.body.style.overflow = anterior; document.removeEventListener("keydown", tecla); pantalla.removeEventListener("change", alCambiarPantalla); };
  }, [filtrosAbiertos]);

  return <>
    <div className="cli-cab">
      <div className="cli-cab-titulo"><h1>Clientes</h1><p className="sub">Saldo de cada cliente = lo cobrado menos el valor del servicio.</p></div>
      <div className="cli-cab-acciones">
        <button type="button" className="btn cli-wa" id="waMasivo" onClick={enviarSaldos}><WhatsAppIcon /><span>Enviar saldos por WhatsApp</span></button>
        <MenuExportar ocupado={!!preparando} opciones={[
          ...(yo.esAdmin ? [
            { grupo: "Reportes Excel", texto: preparando === "cartera" ? "Preparando…" : "Descargar cartera en Excel", tipo: "excel" as const, accion: () => void excel("cartera"), off: !!preparando },
            { grupo: "Reportes Excel", texto: preparando === "cuadre" ? "Preparando…" : textoCuadre, tipo: "excel" as const, accion: () => void excel("cuadre"), off: !!preparando },
          ] : []),
          { grupo: "Impresión", texto: textoImprimir, tipo: "imprimir" as const, accion: imprimirLista },
          { grupo: "Impresión", texto: "Imprimir recibos" + (dia ? " del día" : ""), tipo: "imprimir" as const, accion: imprimirRecibos },
        ]} />
        <button type="button" className="btn cli-registrar" id="nuevoCli" onClick={registrar}><Plus aria-hidden="true" strokeWidth={2.5} /><span>Registrar cliente</span></button>
      </div>
    </div>
    <div className="cifras" style={{ marginBottom: 12 }}>
      <div className="cifra"><span>{dia ? "Ese día te quedaron debiendo" : "Cuentas por cobrar (te deben)"}</span><b className="neg">{pesos(pag?.porCobrar.total ?? 0)}</b><span>{pag?.porCobrar.clientes ?? 0} {pl(pag?.porCobrar.clientes ?? 0, "cliente")}</span></div>
      <div className="cifra"><span>{dia ? "Ese día les quedaste debiendo" : "Cuentas por pagar (les debes)"}</span><b className="pos">{pesos(pag?.porPagar.total ?? 0)}</b><span>{pag?.porPagar.clientes ?? 0} {pl(pag?.porPagar.clientes ?? 0, "cliente")}</span></div>
    </div>
    <div className="cli-movil">
      <div className="tp-movil">
        <div className="tp-movil-buscar" role="search"><input type="search" value={buscar} placeholder="Buscar por nombre o número…" autoComplete="off" aria-label="Buscar cliente por nombre o número" onChange={e => cambiarBusqueda(e.target.value)} />{buscar && <button type="button" aria-label="Limpiar búsqueda" onClick={() => { clearTimeout(tBuscar.current); setBuscar(""); poner({ buscarCli: "", paginaCli: 1 }); }}>×</button>}</div>
        <button type="button" className="tp-movil-abrir" onClick={abrirFiltros} aria-haspopup="dialog" aria-label={`Filtros${filtrosActivos ? `, ${filtrosActivos} activos` : ""}`}><IconoFiltro /><span>Filtros</span>{filtrosActivos > 0 && <b>{filtrosActivos}</b>}</button>
      </div>
      <div className="cli-movil-acciones">
        <button type="button" className="btn ok" onClick={enviarSaldos}><WhatsAppIcon /><span>Enviar saldos</span></button>
        <button type="button" className="btn" onClick={registrar}><IconoAgregarUsuario /><span>Registrar cliente</span></button>
        <button type="button" className="btn sec cli-movil-mas" onClick={abrirOpciones} aria-haspopup="dialog"><IconoImprimir /><span>{preparando ? "Preparando Excel…" : "Imprimir y Excel"}</span></button>
      </div>
    </div>
    {filtrosAbiertos && <div className="tp-capa" onMouseDown={e => { if (e.target === e.currentTarget) cerrarFiltros(); }}>
      <div className="tp-hoja" role="dialog" aria-modal="true" aria-labelledby="cli-filtros-titulo">
        <header><h2 id="cli-filtros-titulo"><IconoFiltro /> Filtrar clientes</h2><button type="button" className="cerrar" aria-label="Cerrar filtros" onClick={cerrarFiltros}>×</button></header>
        <div className="tp-hoja-cuerpo">
          <div className="campo"><label htmlFor="cli-cuenta">Estado de cuenta</label><div className="tp-hoja-select"><select id="cli-cuenta" value={borrador.cuenta} onChange={e => setBorrador(b => ({ ...b, cuenta: e.target.value }))}><option value="todos">Todos</option><option value="cobrar">Por cobrar (te deben)</option><option value="pagar">Por pagar (les debes)</option></select><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6" /></svg></div></div>
          <div className="campo"><label htmlFor="cli-dia">Día de movimiento</label><FiltroDia compacto id="cli-dia" d={borrador.dia} poner={d => setBorrador(b => ({ ...b, dia: d }))} /></div>
        </div>
        <footer><button type="button" className="btn sec" onClick={() => setBorrador({ cuenta: "todos", dia: "" })}>Limpiar filtros</button><button type="button" className="btn" onClick={aplicarFiltros}>Aplicar filtros</button></footer>
      </div>
    </div>}
    <div className="cli-filtros tp-escritorio">
      <div className="campo cli-filtros-buscar" role="search"><input id="buscarCli" type="search" placeholder="Buscar por nombre o número" value={buscar} autoComplete="off" aria-label="Buscar cliente por nombre o número"
        onChange={e => cambiarBusqueda(e.target.value)} /></div>
      <div className="seg" role="group" aria-label="Filtrar por estado de la cuenta">{[["todos", "Todos"], ["cobrar", "Por cobrar"], ["pagar", "Por pagar"]].map(([x, t]) => <button key={x} aria-pressed={E.filtroCli === x} onClick={() => poner({ filtroCli: x, paginaCli: 1 })}>{t}</button>)}</div>
      <FiltroDia compacto d={dia} poner={x => poner({ diaCliF: x, paginaCli: 1 })} />
    </div>
    {dia && <p className="sub">Clientes con movimiento ese día: lo que les quedó de ese día y, al lado, su saldo total de hoy.</p>}
    {reps > 0 ? <div className="aviso">{reps === 1 ? "Hay 1 cliente que parece repetido" : "Hay " + reps + " clientes que parecen repetidos"} (mismo nombre o mismo número). <button className="btn sec chico" id="cliRep" onClick={() => v.abrir(<Repetidos />)}>Revisar y unir</button></div> : null}
    <div ref={arriba} style={{ scrollMarginTop: 90 }} />
    {q.isError ? <div className="aviso alerta">No se pudo traer la lista de clientes: {motivoError(q.error)} <button className="btn chico" onClick={() => q.refetch()}>Intentar otra vez</button></div>
      : !pag ? <div className="vacio">Cargando clientes…</div>
      : filas.length ? <>
        <div className="cli-lista" aria-busy={q.isFetching} style={q.isPlaceholderData ? { opacity: .6 } : undefined}>
          {filas.map(c => <FilaClienteMovil key={c.id} c={c} dia={dia} abrir={() => v.abrir(<FichaCliente cid={c.id} direccion={c.direccionRecogida} />, "cliente")} />)}
        </div>
        <div className="tabla-env cli-tabla" aria-busy={q.isFetching} style={q.isPlaceholderData ? { opacity: .6 } : undefined}><table><thead><tr><th>Cliente</th><th>Número</th><th>Cuenta</th>{dia && <th className="n">Ese día</th>}<th className="n">Saldo</th><th></th></tr></thead><tbody>
          {filas.map(c => <tr key={c.id}><td><b>{c.nombre}</b>{Number(c.tarifa) ? <><br /><span className="sub" style={{ fontSize: ".8rem" }}>Domicilio {pesos(c.tarifa)}</span></> : null}</td><td>{c.telefono || ""}</td>
            <td>{c.saldo < 0 ? <span className="etq sin">Por cobrar</span> : c.saldo > 0 ? <span className="etq ent">Por pagar</span> : <span className="sub">Paz y salvo</span>}</td>
            {dia && <td className={"n " + ((c.delDia ?? 0) < 0 ? "neg" : "pos")}>{(c.delDia ?? 0) < 0 ? "Debe " : "A favor "}{pesos(Math.abs(c.delDia ?? 0))}</td>}
            <td className={"n " + (c.saldo < 0 ? "neg" : c.saldo > 0 ? "pos" : "")}>{pesos(Math.abs(c.saldo))}</td><td><button className="btn sec chico" onClick={() => abrirCuenta(v, c.id)}>Ver cuenta</button></td></tr>)}
        </tbody></table></div>
        <Paginador pagina={pag.pagina} paginas={pag.paginas} total={pag.total} porPagina={pag.porPagina} ir={irA} cargando={q.isPlaceholderData} />
      </>
      : <div className="vacio">{!buscar.trim() && E.filtroCli === "todos" && !dia && pag.totalClientes === 0
        ? "Registra tus clientes (los remitentes) para llevar su saldo."
        : buscar.trim() ? "Ningún cliente con ese nombre o número en esta lista." : "No hay clientes en esta lista."}</div>}
  </>;
}

/** Menú "Exportar / Imprimir" de la cabecera de escritorio: las opciones van agrupadas (Excel e Impresión) en un
 *  popover que se cierra al elegir, al tocar afuera o con Escape. */
interface OpcionExportar { grupo: string; texto: string; tipo: "excel" | "imprimir"; accion: () => void; off?: boolean }
function MenuExportar({ opciones, ocupado }: { opciones: OpcionExportar[]; ocupado: boolean }) {
  const [abierto, setAbierto] = useState(false);
  const caja = useRef<HTMLDivElement>(null), boton = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!abierto) return;
    const fuera = (e: MouseEvent) => { if (!caja.current?.contains(e.target as Node)) setAbierto(false); };
    const tecla = (e: KeyboardEvent) => { if (e.key === "Escape") { setAbierto(false); boton.current?.focus(); } };
    document.addEventListener("mousedown", fuera);
    document.addEventListener("keydown", tecla);
    return () => { document.removeEventListener("mousedown", fuera); document.removeEventListener("keydown", tecla); };
  }, [abierto]);
  // Flechas arriba y abajo recorren las opciones, como en un menú.
  const flechas = (e: React.KeyboardEvent) => {
    if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
    e.preventDefault();
    const items = [...(caja.current?.querySelectorAll<HTMLButtonElement>("[role=menuitem]:not(:disabled)") ?? [])];
    const i = items.indexOf(document.activeElement as HTMLButtonElement);
    items[(i + (e.key === "ArrowDown" ? 1 : items.length - 1) + items.length) % items.length]?.focus();
  };
  const grupos = [...new Set(opciones.map(o => o.grupo))];
  return <div className="cli-exportar" ref={caja} onKeyDown={abierto ? flechas : undefined}>
    <button type="button" ref={boton} className="btn sec cli-exportar-boton" aria-haspopup="menu" aria-expanded={abierto} onClick={() => setAbierto(x => !x)}>
      <FileSpreadsheet aria-hidden="true" className="cli-exportar-ico" /><span>{ocupado ? "Preparando Excel…" : "Exportar / Imprimir"}</span>
      <ChevronDown aria-hidden="true" className={"cli-exportar-flecha" + (abierto ? " girada" : "")} />
    </button>
    {abierto && <div className="cli-exportar-menu" role="menu" aria-label="Exportar o imprimir">
      {grupos.map((g, i) => <div key={g} role="group" aria-label={g}>
        {i > 0 && <div className="cli-exportar-sep" role="separator" />}
        <p className="cli-exportar-grupo" aria-hidden="true">{g}</p>
        {opciones.filter(o => o.grupo === g).map(o => <button key={o.tipo + o.texto} type="button" role="menuitem" disabled={o.off} className="cli-exportar-item"
          onClick={() => { setAbierto(false); o.accion(); }}>
          {o.tipo === "excel" ? <FileSpreadsheet aria-hidden="true" className="ico-excel" /> : <Printer aria-hidden="true" className="ico-imprimir" />}<span>{o.texto}</span>
        </button>)}
      </div>)}
    </div>}
  </div>;
}

/** Nuevo cliente o editar uno. Avisa si ya hay otro con el mismo nombre o número. */
export function FormCliente({ id, alGuardar, nombre: nombre0 }: { id?: string; alGuardar?: (cid: string) => void; nombre?: string }) {
  const v = useVentana(), c = id ? S.clientes[id] : undefined;
  const [nombre, setNombre] = useState(c?.nombre || nombre0 || ""), [tel, setTel] = useState(c?.telefono || ""), [tarifa, setTarifa] = useState(String(Number(c?.tarifa) || ""));
  const [aunAsi, setAunAsi] = useState(false), [dups, setDups] = useState<ReturnType<typeof parecidos>>([]);
  const cambio = () => { setAunAsi(false); setDups([]); };
  const exacto = dups.some(x => x.igual);
  const guardar = async () => {
    const n = nombre.trim(), t = tel.trim();
    if (!n) return v.avisar("Escribe el nombre"); if (!t) return v.avisar("Escribe el número");
    const cambiado = !id || normNom(n) !== normNom(c?.nombre || "") || normTel(t) !== normTel(c?.telefono || ""), ds = cambiado ? parecidos(n, t, id) : [];
    if (ds.length && (!aunAsi || ds.some(x => x.igual))) { setDups(ds); if (!ds.some(x => x.igual)) setAunAsi(true); return; }
    try {
      const cid = await guardarCliente(id || null, { nombre: n, telefono: t, tarifa: Number(tarifa) || 0, confirmarRepetido: aunAsi || undefined });
      v.avisar("Cliente " + n + " guardado");
      if (alGuardar) alGuardar(cid); else v.cerrar();
    } catch (e) { v.avisar("No se pudo guardar: " + motivoError(e)); }
  };
  return <>
    <Cab><h2>{id ? "Editar cliente" : "Nuevo cliente"}</h2></Cab>
    <div className="campo"><label htmlFor="cNom">Nombre</label><input id="cNom" autoComplete="off" value={nombre} autoFocus onChange={e => { setNombre(e.target.value); cambio(); }} /></div>
    <div className="campo"><label htmlFor="cTel">Número de celular</label><input id="cTel" type="tel" inputMode="tel" autoComplete="off" value={tel} onChange={e => { setTel(e.target.value); cambio(); }} /></div>
    <div className="campo"><label htmlFor="cTar">Valor del domicilio de este cliente (opcional)</label><input id="cTar" type="number" inputMode="numeric" min="0" step="100" value={tarifa} onChange={e => setTarifa(e.target.value)} placeholder="Se llena solo al asignarle una guía" /></div>
    {dups.length ? <div className="aviso alerta" id="cDup"><b>{exacto ? "Este cliente ya existe" : "Hay un cliente parecido"}:</b>
      {dups.map(x => <div key={x.c.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, marginTop: 6 }}><span>{x.c.nombre} · {x.c.telefono || ""}<br /><span className="sub" style={{ fontSize: ".8rem" }}>{x.igual ? "mismo nombre y número" : x.mismoNom ? "mismo nombre" : "mismo número"}</span></span>
        <button className="btn sec chico" onClick={() => (alGuardar ? alGuardar(x.c.id) : abrirCuenta(v, x.c.id))}>Usar este</button></div>)}
      <p className="sub" style={{ margin: "6px 0 0" }}>{exacto ? "No se puede crear otro con el mismo nombre y número." : "Si de verdad es otro cliente, toca otra vez “Guardar de todos modos”."}</p></div> : null}
    <button className="btn" id="cGuardar" style={{ width: "100%" }} onClick={guardar}>{aunAsi ? "Guardar de todos modos" : "Guardar cliente"}</button>
  </>;
}

/** Formulario de pago o ajuste de la cuenta de un cliente. Se usa dentro de la ficha del celular y en la ventana
 *  "Registrar pago o ajuste" de la cuenta en el computador. `alListo` se llama después de guardar. */
function FormMovimiento({ cid, alListo, alCancelar }: { cid: string; alListo: () => void; alCancelar?: () => void }) {
  const v = useVentana(), s0 = saldoCliente(cid);
  const tipos = (Object.keys(MOVS) as TipoMov[]).filter(k => yo.esAdmin || MOVS_OFICINA.includes(k));
  const [tipo, setTipo] = useState<TipoMov>(yo.esAdmin ? (s0 < 0 ? "pago_de_cliente" : "pago_a_cliente") : s0 > 0 ? "pago_a_cliente" : tipos[0]);
  const [dia, setDia] = useState(hoy()), [val, setVal] = useState(!yo.esAdmin && s0 === 0 ? "" : String(Math.abs(s0) || "")), [medio, setMedio] = useState<Medio>("efectivo"), [nota, setNota] = useState("");
  const [guardando, setGuardando] = useState(false);
  const registrar = async () => {
    const valor = Number(val); if (!(valor > 0)) return v.avisar("Escribe un valor mayor a cero");
    const caja = mueveCaja({ tipo }); if (yo.esAdmin && caja && diaAntesDelArqueo(v, dia)) return;
    const fecha = !yo.esAdmin && esPago({ tipo }) ? Date.now() : caja ? fechaCaja(dia) : fechaDia(dia); // el pago que registra el asistente queda con la hora del momento
    setGuardando(true);
    try { await guardarMovimiento(null, { clienteId: cid, tipo, valor, medio, nota: nota.trim(), fecha }); v.avisar("Movimiento registrado"); alListo(); }
    catch (e) { v.avisar("No se pudo guardar: " + motivoError(e)); }
    finally { setGuardando(false); }
  };
  const flecha = <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6" /></svg>;
  return <>
    <div className="campo"><label htmlFor="mTipo">Tipo</label><div className="cuenta-select"><select id="mTipo" value={tipo} onChange={e => setTipo(e.target.value as TipoMov)}>{tipos.map(x => <option key={x} value={x}>{MOVS[x].t}</option>)}</select>{flecha}</div></div>
    <div className="cuenta-fila cuenta-fila-dia">
      <div className="campo"><label htmlFor="mFecha">Día</label><SelectorFecha id="mFecha" valor={dia} alCambiar={setDia} etiqueta="Día" vacio="Elige el día" obligatorio alinear="izquierda" /></div>
      <div className="campo"><label htmlFor="mVal">Valor</label><div className="cuenta-pesos"><span aria-hidden="true">$</span><input id="mVal" type="number" inputMode="numeric" min="0" step="100" placeholder="0" value={val} onChange={e => setVal(e.target.value)} /></div></div>
    </div>
    <div className="cuenta-fila cuenta-fila-medio">
      <div className="campo"><label htmlFor="mMedio">{alCancelar ? "Medio (para pagos)" : "Medio"}</label><div className="cuenta-select"><select id="mMedio" value={medio} onChange={e => setMedio(e.target.value as Medio)}>{Object.entries(MEDIOS).map(([x, t]) => <option key={x} value={x}>{t}</option>)}</select>{flecha}</div></div>
      <div className="campo"><label htmlFor="mNota">Nota (opcional)</label><input id="mNota" placeholder="Ej: compra, transferencia Nequi" value={nota} onChange={e => setNota(e.target.value)} /></div>
    </div>
    {alCancelar
      ? <div className="cuenta-modal-pie"><button type="button" className="btn sec" onClick={alCancelar}>Cancelar</button><button type="button" className="btn ok" id="mReg" disabled={guardando} onClick={registrar}>{guardando ? "Registrando…" : "Registrar"}</button></div>
      : <button className="btn ok cuenta-registrar" id="mReg" disabled={guardando} onClick={registrar}>Registrar movimiento</button>}
  </>;
}

/** Ventana encima de la cuenta (computador) con el formulario de pago o ajuste. Escape o tocar afuera la cierran
 *  sin cerrar la cuenta; al registrar se cierra y la cuenta se pinta sola con el saldo nuevo (useDatos). */
function ModalMovimiento({ cid, alCerrar }: { cid: string; alCerrar: () => void }) {
  const c = S.clientes[cid], s = saldoCliente(cid);
  useEffect(() => {
    // La tecla Escape cerraría también la cuenta (el <dialog>): aquí solo cierra esta ventana.
    const tecla = (e: KeyboardEvent) => { if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); alCerrar(); } };
    document.addEventListener("keydown", tecla, true);
    return () => document.removeEventListener("keydown", tecla, true);
  }, [alCerrar]);
  return <div className="modal-fondo cuenta-modal-fondo" onClick={e => { if (e.target === e.currentTarget) alCerrar(); }}>
    <div className="modal-caja cuenta-modal" role="dialog" aria-modal="true" aria-labelledby="cuentaModalTit">
      <header className="cuenta-modal-cab">
        <div><h2 id="cuentaModalTit">{yo.esAdmin ? "Registrar pago o ajuste" : "Registrar pago, compra o ganancia"}</h2>
          <p className="sub">{c?.nombre} · Saldo actual: <b className={s < 0 ? "neg" : s > 0 ? "pos" : ""}>{pesos(Math.abs(s))}</b></p></div>
        <button type="button" className="cerrar" aria-label="Cerrar" onClick={alCerrar}>×</button>
      </header>
      <div className="cuenta-form cuenta-form-modal"><FormMovimiento cid={cid} alListo={alCerrar} alCancelar={alCerrar} /></div>
    </div>
  </div>;
}

/** Enviar el saldo por WhatsApp (o copiar el mensaje). Solo aparece si hay saldo. */
function CompartirSaldo({ cid }: { cid: string }) {
  const v = useVentana(), c = S.clientes[cid], s = saldoCliente(cid);
  if (!c || !s) return null;
  const marcarEnviado = () => { try { const k = "js_wa_saldos_" + hoy(), e = new Set(JSON.parse(localStorage.getItem(k) || "[]")); e.add(cid); guardarLocal(k, JSON.stringify([...e])); } catch { /* sin almacenamiento */ } };
  return telWhatsApp(c.telefono) ? <div className="acciones cuenta-compartir" style={{ margin: "0 0 6px" }}><a className="btn ok" id="cWa" href={linkSaldo(cid)} target="_blank" rel="noopener" onClick={marcarEnviado}><WhatsAppIcon />Enviar {s < 0 ? "cobro" : "saldo a favor"} por WhatsApp</a>
      <button className="btn sec" id="cWaCopiar" type="button" onClick={async () => { try { await navigator.clipboard.writeText(textoSaldo(cid)); v.avisar("Mensaje copiado. Pégalo en WhatsApp."); } catch { v.avisar("No se pudo copiar en este navegador"); } }}>Copiar mensaje</button></div>
    : <div className="aviso">Agrega el celular del cliente para enviarle el saldo por WhatsApp.</div>;
}

/** Abre la cuenta de un cliente en el panel lateral de la izquierda (variante "cuenta"). */
export const abrirCuenta = (v: ReturnType<typeof useVentana>, cid: string) => v.abrir(<AbrirCuenta cid={cid} />, "cuenta");

/** Cuenta de un cliente: saldo, WhatsApp, registrar pago o ajuste y sus movimientos (abrirCuenta del prototipo).
 *  En la ficha del celular (`enFicha`, pestaña "Ver cuenta") solo muestra los movimientos, en tarjetas: la información,
 *  el WhatsApp y el formulario van en sus propias pestañas. Suelta (panel lateral del computador) el formulario se abre
 *  en una ventana desde el botón "Registrar pago o ajuste" y los movimientos ocupan todo el alto. */
export function AbrirCuenta({ cid, enFicha, volver }: { cid: string; enFicha?: boolean; volver?: () => void }) {
  useDatos();
  const v = useVentana(), c = S.clientes[cid];
  // Dentro de la ficha móvil se vuelve a la pestaña "Ver cuenta"; suelta, a esta misma ventana.
  const reabrir = volver ?? (() => abrirCuenta(v, cid));
  const [formAbierto, setFormAbierto] = useState(false);
  const cerrarForm = useCallback(() => setFormAbierto(false), []);
  if (!c) return null;
  const rows = filasCuenta(cid), pendientes = Object.values(S.pedidos).filter(p => p.clienteId === cid && p.estado === "pendiente").length, s = saldoCliente(cid);
  const domi = async (g: string) => {
    const ped = S.pedidos[g]; if (!ped) return;
    if (ped.domiPagado) {
      if (cambiaLoContado(ped, { ...ped, domiPagado: false, domiPagoMedio: "" })) return avisoContado(v);
      if (!await v.confirmar("Desmarcar el pago de " + g, "El pago del domicilio se quita de la caja y vuelve a sumarse al saldo del cliente.", "Desmarcar")) return reabrir();
      try { await actualizarPedido(g, { domiPagado: false, domiPagoMedio: "" }); v.avisar("Guía " + g + " actualizada"); } catch (e) { v.avisar("No se pudo guardar: " + motivoError(e)); }
      return reabrir();
    }
    v.abrir(<PagoDomicilio guia={g} despues={reabrir} />);
  };
  const quitarMov = async (mid: string) => {
    const m = S.movimientos[mid]; if (!m) return;
    if (mueveCaja(m) && yaContado(m.fecha)) return avisoContado(v);
    if (!await v.confirmar("Quitar movimiento", `${MOVS[m.tipo]?.corto || "Movimiento"} · ${pesos(m.valor)}. Se quita de la cuenta del cliente${mueveCaja(m) ? " y de la caja" : ""}.`, "Quitar")) return reabrir();
    try { await borrarDe("movimientos", mid); v.avisar("Movimiento quitado"); } catch (e) { v.avisar("No se pudo quitar: " + motivoError(e)); }
    reabrir();
  };
  const editar = () => v.abrir(<FormCliente id={cid} />, "centrada");
  const explicacion = s > 0 ? "Cuenta por pagar: JS le debe este valor al cliente." : s < 0 ? "Cuenta por cobrar: el cliente le debe este valor a JS." : "Cuenta a paz y salvo.";
  if (enFicha) return <div className="cuenta-movs-movil">
    <div className="cuenta-movs-cab"><h3>Movimientos</h3><span>{rows.length} {rows.length === 1 ? "registro" : "registros"}</span></div>
    {rows.length ? <ul className="cuenta-movs">
      {rows.map((r, i) => <li key={(r.pid || r.mid || "") + i}>
        <div className="cuenta-mov-arriba"><p className="cuenta-mov-det" title={r.det}>{r.det}</p><span className={"cuenta-mov-valor " + (r.v < 0 ? "neg" : r.v > 0 ? "pos" : "cero")}>{pesos(r.v)}</span></div>
        <div className="cuenta-mov-abajo"><small>{hora(r.fecha)}</small>
          {r.mid ? (yo.esAdmin ? <button type="button" className="cuenta-mov-quitar" onClick={() => quitarMov(r.mid!)}>Quitar</button> : null) : r.pid && (r.v < 0 || r.dp) ? <button type="button" className="cuenta-mov-domi" onClick={() => domi(r.pid!)}>{r.dp ? "Desmarcar" : "Pagó domicilio"}</button> : null}</div>
      </li>)}
    </ul> : <div className="vacio">Sin movimientos.</div>}
  </div>;
  const estado = s < 0 ? "Por cobrar" : s > 0 ? "Por pagar" : "Cuenta a paz y salvo";
  return <div className="cuenta-panel">
    <header className="cuenta-cab">
      {/* Fila 1: quién es y cuánto debe o tiene a favor, con el cerrar a la derecha */}
      <div className="cuenta-fila-uno">
        <div className="cuenta-quien">
          <div className="cuenta-nombre"><h2>{c.nombre}</h2><p className="sub">{c.telefono || "Sin celular"}{pendientes ? ` · ${pendientes} en ruta` : ""}</p></div>
          <span className="cuenta-sep" aria-hidden="true" />
          <div className="cuenta-saldo" title={explicacion}><b className={s < 0 ? "neg" : s > 0 ? "pos" : ""}>{pesos(Math.abs(s))}</b><small>{estado}</small></div>
        </div>
        <button type="button" className="cerrar" data-cerrar aria-label="Cerrar cuenta">×</button>
      </div>
      {/* Fila 2: las acciones */}
      <div className="cuenta-botones">
        <button type="button" className="btn ok" id="cRegistrar" onClick={() => setFormAbierto(true)}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg><span>{yo.esAdmin ? "Registrar pago o ajuste" : "Registrar movimiento"}</span></button>
        <button type="button" className="btn sec" id="cEdit" onClick={editar}><IconoEditar /><span>Editar cliente</span></button>
      </div>
    </header>
    <div className="cuenta-cuerpo">
      {s ? <div className="cuenta-wa"><p className="sub">{explicacion}</p><CompartirSaldo cid={cid} /></div> : null}
      <div className="cuenta-movs-cab"><h3>Movimientos</h3><span>{rows.length} {rows.length === 1 ? "registro" : "registros"}</span></div>
      {rows.length ? <div className="cuenta-tabla"><table><thead><tr><th>Fecha</th><th>Detalle</th><th className="n">Valor</th><th className="n">Acción</th></tr></thead><tbody>
        {rows.map((r, i) => <tr key={(r.pid || r.mid || "") + i}><td className="cuenta-fecha">{hora(r.fecha)}</td><td className="cuenta-det">{r.det}</td><td className={"n " + (r.v < 0 ? "neg" : "pos")}>{pesos(r.v)}</td>
          <td className="n">{r.mid ? (yo.esAdmin ? <button className="btn peligro chico" onClick={() => quitarMov(r.mid!)}>Quitar</button> : null) : r.pid && (r.v < 0 || r.dp) ? <button className="btn sec chico" onClick={() => domi(r.pid!)}>{r.dp ? "Desmarcar pago" : "Ya pagó domicilio"}</button> : null}</td></tr>)}
      </tbody></table></div> : <div className="vacio">Sin movimientos.</div>}
      {/* En el celular la tabla no cabe: cada movimiento es una fila compacta (fecha y detalle, valor y Quitar) */}
      {rows.length > 0 && <ul className="cuenta-movs-compacta" aria-label="Movimientos">
        {rows.map((r, i) => <li key={(r.pid || r.mid || "") + i}>
          <div className="cmc-txt">
            <b>{hora(r.fecha)}</b>
            <span>{r.det}</span>
            {!r.mid && r.pid && (r.v < 0 || r.dp) ? <button type="button" className="cmc-domi" onClick={() => domi(r.pid!)}>{r.dp ? "Desmarcar pago" : "Ya pagó domicilio"}</button> : null}
          </div>
          <span className={"cmc-valor " + (r.v < 0 ? "neg" : r.v > 0 ? "pos" : "cero")}>{pesos(r.v)}</span>
          {yo.esAdmin && <div className="cmc-accion">{r.mid ? <button type="button" onClick={() => quitarMov(r.mid!)}>Quitar</button> : null}</div>}
        </li>)}
      </ul>}
    </div>
    {formAbierto && <ModalMovimiento cid={cid} alCerrar={cerrarForm} />}
  </div>;
}

/** Fila de la lista de clientes en el celular: nombre, domicilio, saldo con su estado y flecha. */
function FilaClienteMovil({ c, dia, abrir }: { c: ClienteConSaldo; dia: string; abrir: () => void }) {
  const estado = c.saldo < 0 ? "Por cobrar" : c.saldo > 0 ? "Por pagar" : "Paz y salvo";
  const delDia = c.delDia ?? 0;
  return <button type="button" className="cli-fila" onClick={abrir} aria-label={`${c.nombre}: ${estado} ${pesos(Math.abs(c.saldo))}. Ver detalle`}>
    <span className="cli-fila-nombre"><b>{c.nombre}</b><small>{Number(c.tarifa) ? "Domicilio " + pesos(c.tarifa) : c.telefono || "Sin tarifa fija"}</small></span>
    <span className="cli-fila-saldo"><b className={c.saldo < 0 ? "neg" : c.saldo > 0 ? "pos" : ""}>{pesos(Math.abs(c.saldo))}</b><small>{estado}</small>
      {dia && <small className={delDia < 0 ? "neg" : "pos"}>Ese día: {delDia < 0 ? "debe " : "a favor "}{pesos(Math.abs(delDia))}</small>}</span>
    <span className="cli-fila-flecha" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m9 6 6 6-6 6" /></svg></span>
  </button>;
}

/** Ficha del cliente en el celular: hoja con dos pestañas, la información y la misma cuenta del botón "Ver cuenta". */
type PestanaFicha = "info" | "cuenta" | "pago";
const PESTANAS_FICHA: PestanaFicha[] = ["info", "cuenta", "pago"];
export function FichaCliente({ cid, pestana = "info", direccion }: { cid: string; pestana?: PestanaFicha; direccion?: string }) {
  useDatos();
  const v = useVentana(), c = S.clientes[cid];
  const [tab, setTab] = useState(pestana);
  const cuerpo = useRef<HTMLDivElement>(null);
  if (!c) return null;
  const s = saldoCliente(cid), estado = s < 0 ? "Por cobrar" : s > 0 ? "Por pagar" : "Paz y salvo";
  const enRuta = Object.values(S.pedidos).filter(p => p.clienteId === cid && p.estado === "pendiente").length;
  const wa = telWhatsApp(c.telefono);
  const reabrir = (t: PestanaFicha) => v.abrir(<FichaCliente cid={cid} pestana={t} direccion={direccion} />, "cliente");
  const cambiar = (t: PestanaFicha) => { setTab(t); if (cuerpo.current) cuerpo.current.scrollTop = 0; };
  const teclas = (e: React.KeyboardEvent) => {
    if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
    e.preventDefault();
    const n = PESTANAS_FICHA.length, t = PESTANAS_FICHA[(PESTANAS_FICHA.indexOf(tab) + (e.key === "ArrowRight" ? 1 : n - 1)) % n];
    cambiar(t); document.getElementById("cli-tab-" + t)?.focus();
  };
  return <div className="cli-ficha">
    <header className="cli-ficha-cab">
      <div className="cli-ficha-titulo">
        <div><h2>{c.nombre} <span className={"etq " + (s < 0 ? "sin" : s > 0 ? "ent" : "")}>{estado}</span></h2>
          <p>Saldo actual: <b className={s < 0 ? "neg" : s > 0 ? "pos" : ""}>{pesos(Math.abs(s))}</b></p></div>
        <button className="cerrar" type="button" data-cerrar aria-label="Cerrar">×</button>
      </div>
      <div className="seg cli-ficha-tabs" role="tablist" aria-label="Ficha del cliente" onKeyDown={teclas}>
        <button type="button" role="tab" id="cli-tab-info" aria-controls="cli-panel" aria-selected={tab === "info"} tabIndex={tab === "info" ? 0 : -1} onClick={() => cambiar("info")}><IconoInfo /><span>Información</span></button>
        <button type="button" role="tab" id="cli-tab-cuenta" aria-controls="cli-panel" aria-selected={tab === "cuenta"} tabIndex={tab === "cuenta" ? 0 : -1} onClick={() => cambiar("cuenta")}><Icono n="cuentas" /><span>Ver cuenta</span></button>
        <button type="button" role="tab" id="cli-tab-pago" aria-controls="cli-panel" aria-selected={tab === "pago"} tabIndex={tab === "pago" ? 0 : -1} onClick={() => cambiar("pago")}><Icono n="plata" /><span>Registrar pago</span></button>
      </div>
    </header>
    <div className="cli-ficha-cuerpo" ref={cuerpo} id="cli-panel" role="tabpanel" aria-labelledby={"cli-tab-" + tab}>
      {tab === "info" ? <div className="cli-info">
        <dl>
          <div><dt>Teléfono / WhatsApp</dt><dd>{c.telefono ? <a href={"tel:" + c.telefono.replace(/[^\d+]/g, "")}>{c.telefono}</a> : "Sin número"}</dd></div>
          {direccion ? <div><dt>Dirección de recogida</dt><dd>{direccion}</dd></div> : null}
          <div><dt>Valor del domicilio</dt><dd>{Number(c.tarifa) ? pesos(c.tarifa) : "Sin tarifa fija"}</dd></div>
          <div><dt>Pedidos en ruta</dt><dd>{enRuta}</dd></div>
          <div><dt>Saldo</dt><dd className={s < 0 ? "neg" : s > 0 ? "pos" : ""}>{pesos(Math.abs(s))}</dd></div>
        </dl>
        <p className="sub">{s > 0 ? "Cuenta por pagar: JS le debe este valor al cliente." : s < 0 ? "Cuenta por cobrar: el cliente le debe este valor a JS." : "Cuenta a paz y salvo."}</p>
        <CompartirSaldo cid={cid} />
        <div className="cli-info-acciones">
          {wa ? <a className="btn ok" href={"https://wa.me/" + wa} target="_blank" rel="noopener"><WhatsAppIcon /><span>WhatsApp</span></a> : <button type="button" className="btn ok" disabled><WhatsAppIcon /><span>WhatsApp</span></button>}
          <button type="button" className="btn sec" onClick={() => v.abrir(<FormCliente id={cid} alGuardar={id => (id === cid ? reabrir("info") : v.abrir(<FichaCliente cid={id} />, "cliente"))} />, "centrada")}><IconoEditar /><span>Editar ficha</span></button>
        </div>
      </div>
        : tab === "cuenta" ? <AbrirCuenta cid={cid} enFicha volver={() => reabrir("cuenta")} />
        : <div className="cuenta-form">
          <h2>{yo.esAdmin ? "Registrar pago o ajuste" : "Registrar pago, compra o ganancia"}</h2>
          <FormMovimiento cid={cid} alListo={() => reabrir("cuenta")} />
        </div>}
    </div>
  </div>;
}

/** Registrar que el cliente pagó el domicilio de una guía: cómo y cuánto; entra a la caja. */
function PagoDomicilio({ guia, despues }: { guia: string; despues: () => void }) {
  const v = useVentana(), p = S.pedidos[guia];
  const [medio, setMedio] = useState(""), [val, setVal] = useState(String(p ? cargoEnvio(p) || "" : "")), [guardando, setGuardando] = useState(false);
  if (!p) return null;
  const guardar = async () => {
    const valor = Number(val) || 0; if (!medio) return v.avisar("Elige cómo pagó"); if (!(valor > 0)) return v.avisar("Escribe el valor que pagó");
    setGuardando(true);
    try { await actualizarPedido(guia, { domiPagado: true, domiPagoMedio: medio as Medio, domiPagoValor: valor }); v.avisar("Pago de " + pesos(valor) + " registrado"); despues(); }
    catch (e) { setGuardando(false); v.avisar("No se pudo guardar: " + motivoError(e)); }
  };
  return <>
    <Cab sub={<span className="sub guia">{guia}</span>}><h2>Pago del domicilio</h2></Cab>
    <p className="sub">Domicilio {pesos(servicio(p))}{gastoDe(p) ? " + flete " + pesos(gastoDe(p)) : ""}. El valor entra a la caja.</p>
    <div className="linea2"><div className="campo"><label htmlFor="dpMedio">¿Cómo pagó?</label><select id="dpMedio" value={medio} onChange={e => setMedio(e.target.value)}><option value="">Elige…</option>{Object.entries(MEDIOS).map(([k, t]) => <option key={k} value={k}>{t}</option>)}</select></div>
      <div className="campo"><label htmlFor="dpVal">Valor que pagó</label><input id="dpVal" type="number" inputMode="numeric" min="0" step="100" value={val} onChange={e => setVal(e.target.value)} /></div></div>
    <button className="btn ok" id="dpGuardar" style={{ width: "100%" }} disabled={guardando} onClick={guardar}>Registrar pago</button>
  </>;
}

/* Envío en cadena: WhatsApp no permite mandar mensajes solos desde una página, así que se abre un chat tras otro. */
const CLAVE_ENVIADOS = () => "js_wa_saldos_" + hoy();
const enviadosHoy = () => { try { return new Set<string>(JSON.parse(localStorage.getItem(CLAVE_ENVIADOS()) || "[]")); } catch { return new Set<string>(); } };
function EnvioMasivo({ tipo0 }: { tipo0: "cobrar" | "pagar" }) {
  const [tipo, setTipo] = useState(tipo0), [, setN] = useState(0);
  const env = enviadosHoy();
  const lista = listaOrdenada(S.clientes, "nombre").map(c => ({ ...c, s: saldoCliente(c.id) })).filter(c => (tipo === "cobrar" ? c.s < 0 : c.s > 0));
  const conTel = lista.filter(c => telWhatsApp(c.telefono)), sinTel = lista.filter(c => !telWhatsApp(c.telefono));
  const pend = conTel.filter(c => !env.has(c.id)), sig = pend[0];
  const tras = (cid: string) => { env.add(cid); guardarLocal(CLAVE_ENVIADOS(), JSON.stringify([...env])); setTimeout(() => setN(x => x + 1), 300); };
  return <div className="envio-masivo">
    <Cab sub={<span className="sub">{conTel.length - pend.length} de {conTel.length} enviados hoy</span>}><h2>Enviar saldos por WhatsApp</h2></Cab>
    <div className="filtros">{([["cobrar", "Clientes que deben"], ["pagar", "Saldos a favor"]] as const).map(([k, t]) => <button key={k} aria-pressed={tipo === k} onClick={() => setTipo(k)}>{t}</button>)}</div>
    <p className="sub">Toca “Enviar al siguiente”: se abre el chat con el mensaje listo; envíalo en WhatsApp y vuelve aquí para el próximo.</p>
    {sig ? <a className="btn ok envio-siguiente" id="waSig" href={linkSaldo(sig.id)} target="_blank" rel="noopener" onClick={() => tras(sig.id)}><WhatsAppIcon />Enviar al siguiente: {sig.nombre} ({pesos(Math.abs(sig.s))})</a>
      : <div className="vacio">{conTel.length ? "¡Listo! Ya se envió a todos." : "No hay clientes en esta lista."}</div>}
    {conTel.length ? <div className="envio-tabla"><table className="tabla-envio"><thead><tr><th className="col-cliente">Cliente</th><th className="col-saldo">Saldo</th><th className="col-accion">Acción</th></tr></thead><tbody>
      {conTel.map(c => <tr key={c.id}><td className="col-cliente"><b className="envio-nombre">{c.nombre}</b></td><td className="col-saldo">{pesos(Math.abs(c.s))}</td><td className="col-accion">{env.has(c.id) ? <><span className="etq ent">✓ Enviado</span> </> : null}<a className="btn enviar-fila" href={linkSaldo(c.id)} target="_blank" rel="noopener" onClick={() => tras(c.id)}>{env.has(c.id) ? "Reenviar" : "Enviar"}</a></td></tr>)}
    </tbody></table></div> : null}
    {sinTel.length ? <div className="aviso" style={{ marginTop: 12 }}>Sin celular registrado: {sinTel.map(c => c.nombre).join(", ")}.</div> : null}
    {env.size ? <div className="acciones"><button className="btn sec chico" id="waReiniciar" onClick={() => { guardarLocal(CLAVE_ENVIADOS(), "[]"); setN(x => x + 1); }}>Volver a empezar la lista de hoy</button></div> : null}
  </div>;
}

/** Clientes repetidos (mismo nombre o mismo número). Unirlos lo hace el servidor. */
function Repetidos() {
  const gs = gruposRepetidos(), uso = (id: string) => ({ ped: Object.values(S.pedidos).filter(p => p.clienteId === id).length, mov: Object.values(S.movimientos).filter(m => m.clienteId === id).length, cuenta: Object.values(S.usuarios).some(u => u.clienteId === id) });
  return <>
    <Cab sub={<span className="sub">{gs.length} {pl(gs.length, "grupo")}</span>}><h2>Clientes repetidos</h2></Cab>
    <p className="sub">En cada grupo toca “Quedarse con este” en el que quieres conservar. Los pedidos, pagos y la cuenta de acceso de los otros pasan a ese cliente, el saldo se suma y los repetidos se borran. Si son clientes distintos (por ejemplo, dos tiendas del mismo dueño), no hagas nada.</p>
    {gs.length ? gs.map(g => <div className="mcard" key={g[0].id} style={{ marginBottom: 10 }}>{g.map(c => { const u = uso(c.id), s = saldoCliente(c.id); return (
      <div key={c.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, padding: "6px 0", borderBottom: "1px solid var(--borde,#ddd)" }}>
        <span><b>{c.nombre}</b> · {c.telefono || ""}<br /><span className="sub" style={{ fontSize: ".8rem" }}>{u.ped} {pl(u.ped, "pedido")} · {u.mov} {pl(u.mov, "movimiento")} · {s < 0 ? "debe " + pesos(-s) : s > 0 ? "a favor " + pesos(s) : "paz y salvo"}{u.cuenta ? " · tiene cuenta" : ""}</span></span>
        <BotonUnir k={c.id} otros={g.map(x => x.id).filter(x => x !== c.id)} /></div>); })}</div>) : <div className="vacio">No hay clientes repetidos.</div>}
  </>;
}
function BotonUnir({ k, otros }: { k: string; otros: string[] }) {
  const v = useVentana();
  const unir = async () => {
    if (!await v.confirmar("Unir clientes", `Se queda ${S.clientes[k].nombre} (${S.clientes[k].telefono || ""}). Se le pasa todo de: ${otros.map(o => S.clientes[o].nombre + " (" + (S.clientes[o].telefono || "") + ")").join(", ")}, y esos se borran.`, "Unir")) return v.abrir(<Repetidos />);
    try { await unirClientes(k, otros); v.avisar("Clientes unidos en " + nombreCliente(k)); }
    catch (e) { v.avisar("No se pudo unir: " + motivoError(e)); }
    v.abrir(<Repetidos />);
  };
  return <button className="btn sec chico" onClick={unir}>Quedarse con este</button>;
}
