/* Cálculos del negocio, copiados de app/js/app.js función por función y sin cambiar la lógica.
   En la app trabajan sobre el estado global S; aquí reciben S (cargado de la base con cargarEstado)
   para que el servidor y la app den exactamente los mismos saldos, períodos, caja, arqueos y sueldos.
   Ningún saldo se guarda: todo se calcula a partir de los documentos. */
import { MOVS, METODOS, MOTIVOS, MEDIOS, CATS, PAGO_FIJO, ORDEN_TIPO, PCT_SUELDO, DESC_SUELDO, SUELDO_POR_SALIDA } from "./constantes.js";
import { diaDe, hoy, fechaDia, semanaDe, diasSemana, moverSemana, hora, fechaCorta, fechaLarga, diaSemana } from "./fechas.js";
import { pesos, sinTildes } from "./texto.js";
import { ahora } from "./reloj.js";

/* ---------- pedidos y clientes (no dependen de S) ---------- */
export const cerrado = p => p.estado === "entregado" || p.estado === "devuelto";
export const servicio = p => (p.estado === "devuelto" && !p.cobrarDev ? 0 : (Number(p.valorServicio) || 0));
export const gastoDe = p => Number(p.gasto) || 0;
export const pagoDomi = p => (!p.domiPagado ? 0 : p.domiPagoValor != null && p.domiPagoValor !== "" ? (Number(p.domiPagoValor) || 0) : servicio(p));
export const cargoEnvio = p => servicio(p) + gastoDe(p);
/** + cuenta por pagar al cliente, − cuenta por cobrar al cliente. */
export function saldoPedido(p) {
  if (!cerrado(p)) return 0;
  const cob = p.metodo === "transf_cliente" || p.estado === "devuelto" ? 0 : (Number(p.valorCobrado) || 0);
  return cob - cargoEnvio(p) + pagoDomi(p);
}
export const metodoTxt = p => (p.estado === "devuelto" ? "Devolución" + (p.motivoDev ? " (" + (MOTIVOS[p.motivoDev] || "").toLowerCase() + ")" : "") : (METODOS[p.metodo]?.t || ""));
export const textoDomi = p => (p.domiPagado ? "pagó domicilio " + pesos(pagoDomi(p)) : "domicilio " + pesos(servicio(p))) + (gastoDe(p) ? " · flete " + pesos(gastoDe(p)) : "");
export const signoMov = m => (MOVS[m.tipo]?.s || -1) * (Number(m.valor) || 0);
export const esPago = m => !!MOVS[m.tipo]?.pago;
/** Un pago que recibió un mensajero en la calle (mensajeroId) abona al cliente pero no mueve la caja: entra cuando él lo
    entrega (recaudo). Mientras tanto suma a lo que debe (periodoMensajero). La app vieja no tiene estos pagos. */
export const mueveCaja = m => !m.mensajeroId && (esPago(m) || !!MOVS[m.tipo]?.caja);
/** Pagos de clientes que recibió un mensajero: + lo que le dieron, − si se le devolvió al cliente. */
export const esCobroMensajero = (m, mid) => !!m.mensajeroId && m.mensajeroId === mid && esPago(m);
export const cambioPendiente = p => !!p.cambio && !p.cambioRecibido;
export const sinServicio = p => p.estado === "entregado" && !!p.clienteId && !Number(p.valorServicio);
export const textoLiq = d => (d > 0 ? "Debe " + pesos(d) : d < 0 ? "Sobró " + pesos(-d) : "Quedó en $ 0");
export const tipoDe = m => m?.tipo || "mensajero";
export const esRepartidor = m => ["mensajero", "dueno", "oficina"].includes(tipoDe(m));
export const ganaPorcentaje = m => tipoDe(m) === "mensajero";
export const sueldoDe = domicilios => domicilios * PCT_SUELDO - DESC_SUELDO;
/** El domicilio va al sueldo del día en que salió el pedido (desde la semana del 31-oct-2026). */
export const diaSueldo = p => { const s = diaDe(p.creado || p.entregado); return s >= SUELDO_POR_SALIDA ? s : diaDe(p.entregado); };
export const sueldoPedidos = ps => { const g = {}; ps.forEach(p => { const d = diaSueldo(p); g[d] = (g[d] || 0) + servicio(p); }); return Object.values(g).reduce((a, x) => a + sueldoDe(x), 0); };
export const valorAdel = c => Math.max(0, (Number(c.valor) || 0) - (Number(c.devuelto) || 0));
export const esDeSemana = (c, sem, dias) => (c.semana ? c.semana === sem : dias.includes(diaDe(c.fecha)));
export const normNom = x => sinTildes(x).replace(/[^a-z0-9]/g, "");
export const normTel = x => String(x || "").replace(/\D/g, "").slice(-10);
export const netoArqueo = a => Math.round(Object.values(a.dif).reduce((x, y) => x + y, 0));
export function resultadoArqueo(a) {
  const f = Object.entries(a.dif).filter(([, x]) => Math.round(x)); if (!f.length) return "Cuadró exacto";
  const n = netoArqueo(a), det = f.map(([m, x]) => `${MEDIOS[m] || m} ${x < 0 ? "−" : "+"}${pesos(Math.abs(x))}`).join(", ");
  return n === 0 ? `La plata da exacto · se reacomodó entre medios (${det})` : `${n < 0 ? "Faltó" : "Sobró"} ${pesos(Math.abs(n))} en total (${det})`;
}
export function totales(ps) {
  const t = { efectivo: 0, transfJs: 0, transfCli: 0, servicio: 0 };
  for (const p of ps) {
    const v = Number(p.valorCobrado) || 0;
    if (p.metodo === "efectivo") t.efectivo += v; else if (p.metodo === "transf_js") t.transfJs += v; else t.transfCli += v;
    t.servicio += servicio(p);
  }
  return t;
}
/** Las líneas de caja que produce un pedido: transferencia a JS y pago del domicilio. */
export const lineasCajaPedido = p => [
  ...(cerrado(p) && p.metodo === "transf_js" ? [[p.entregado, p.cuentaJs || "cuentas", Number(p.valorCobrado) || 0]] : []),
  ...(p.domiPagado && p.domiPagoMedio ? [[p.domiPagoFecha || p.entregado || p.creado, p.domiPagoMedio, pagoDomi(p)]] : [])
];

/* ---------- cálculos que necesitan el estado S ---------- */
/** S: { pedidos, clientes, mensajeros, movimientos, recaudos, liquidaciones, jornadas, cajamovs, vinculos, usuarios, cuentas }.
    corteRemoto: hora del último arqueo guardada en meta/caja. */
export function crearCalculos(S, { corteRemoto = 0 } = {}) {
  const V = col => Object.values(S[col] || {});

  /* Saldo de cada cliente en una sola pasada por pedidos y movimientos (antes se recorrían todos por cada cliente:
     la lista de Clientes era cuadrática). S no se modifica después de crear los cálculos (cada petición arma los suyos). */
  let saldos = null;
  function saldoCliente(cid) {
    if (!cid) { // sin id se conserva el recorrido de siempre (suma lo que tenga ese mismo valor vacío)
      let s = 0;
      for (const p of V("pedidos")) if (p.clienteId === cid) s += saldoPedido(p);
      for (const m of V("movimientos")) if (m.clienteId === cid) s += signoMov(m);
      return s;
    }
    if (!saldos) {
      saldos = new Map();
      for (const p of V("pedidos")) if (p.clienteId) saldos.set(p.clienteId, (saldos.get(p.clienteId) || 0) + saldoPedido(p));
      for (const m of V("movimientos")) if (m.clienteId) saldos.set(m.clienteId, (saldos.get(m.clienteId) || 0) + signoMov(m));
    }
    return saldos.get(cid) || 0;
  }
  const nombreCliente = id => S.clientes[id]?.nombre || (id && V("pedidos").find(p => p.clienteId === id && p.clienteNombre)?.clienteNombre) || "";
  const listaOrdenada = (obj, campo, desc) => Object.values(obj).sort((a, b) => (desc ? (b[campo] || 0) - (a[campo] || 0) : String(a[campo] || "").localeCompare(String(b[campo] || ""), "es")));

  // Pedidos y movimientos agrupados por cliente, en el mismo orden de S (para no recorrerlos todos por cada cliente).
  let grupos = null;
  const deCliente = (col, cid) => {
    if (!cid) return V(col).filter(x => x.clienteId === cid);
    if (!grupos) {
      grupos = { pedidos: new Map(), movimientos: new Map() };
      for (const k of ["pedidos", "movimientos"]) for (const x of V(k)) if (x.clienteId) { const g = grupos[k].get(x.clienteId); if (g) g.push(x); else grupos[k].set(x.clienteId, [x]); }
    }
    return grupos[col].get(cid) || [];
  };
  function filasCuenta(cid) {
    const ps = deCliente("pedidos", cid).filter(p => cerrado(p)).map(p => ({ fecha: p.entregado, det: `${p.guia} · ${p.destinatario || ""} · ${metodoTxt(p)} · cobró ${pesos(p.valorCobrado)} · ${textoDomi(p)}`, v: saldoPedido(p), pid: p.guia, dp: !!p.domiPagado, nom: p.destinatario || (p.estado === "devuelto" ? "Devolucion" : "") }));
    const ms = deCliente("movimientos", cid).map(m => ({ fecha: m.fecha, det: (MOVS[m.tipo]?.corto || "Movimiento") + (m.nota ? " · " + m.nota : ""), v: signoMov(m), mid: m.id, nom: (MOVS[m.tipo]?.corto || "Movimiento") + (m.nota ? " " + m.nota : "") }));
    return [...ps, ...ms].sort((a, b) => b.fecha - a.fecha);
  }

  /* ---- clientes repetidos ---- */
  function parecidos(nombre, tel, excluir) {
    const nn = normNom(nombre), nt = normTel(tel);
    return V("clientes").filter(c => c.id !== excluir).map(c => { const mismoNom = !!nn && normNom(c.nombre) === nn, mismoTel = nt.length >= 7 && normTel(c.telefono) === nt; return { c, mismoNom, mismoTel, igual: mismoNom && mismoTel }; })
      .filter(d => d.mismoNom || d.mismoTel).sort((a, b) => b.igual - a.igual);
  }
  function gruposRepetidos() {
    const cs = V("clientes"), padre = {}, raiz = x => (padre[x] === x ? x : (padre[x] = raiz(padre[x])));
    cs.forEach(c => (padre[c.id] = c.id));
    const juntar = clave => { const vistos = {}; cs.forEach(c => { const k = clave(c); if (!k) return; if (vistos[k]) padre[raiz(c.id)] = raiz(vistos[k]); else vistos[k] = c.id; }); };
    juntar(c => normNom(c.nombre)); juntar(c => { const t = normTel(c.telefono); return t.length >= 7 ? t : ""; });
    const g = {}; cs.forEach(c => (g[raiz(c.id)] = g[raiz(c.id)] || []).push(c));
    return Object.values(g).filter(x => x.length > 1);
  }

  /* ---- mensajeros: período abierto y liquidaciones ---- */
  const liquidacionesDe = mid => V("liquidaciones").filter(l => l.mensajeroId === mid).sort((a, b) => b.fecha - a.fecha);
  const yaLiquidado = (mid, fecha) => { const ul = liquidacionesDe(mid)[0]; return !!ul && fecha <= ul.fecha; };
  const guiasLiquidadas = mid => new Set(liquidacionesDe(mid).flatMap(l => l.guias || []));
  const pedidoLiquidado = p => cerrado(p) && guiasLiquidadas(p.mensajeroId).has(p.guia);
  /** Período abierto: entregas que no están en ninguna liquidación (por pertenencia, no por hora), más las
      correcciones hechas después a liquidaciones cerradas. Así lo que debe el mensajero siempre cuadra con la caja. */
  function periodoMensajero(mid) {
    const liqs = liquidacionesDe(mid), ul = liqs[0] || null, desde = ul ? ul.fecha : 0, anterior = ul ? (Number(ul.debe) || 0) : 0;
    const enLiq = new Set(liqs.flatMap(l => l.guias || [])), sinGuias = Math.max(0, ...liqs.filter(l => !Array.isArray(l.guias)).map(l => l.fecha));
    const ps = V("pedidos").filter(p => cerrado(p) && p.mensajeroId === mid && !enLiq.has(p.guia) && p.entregado > sinGuias).sort((a, b) => a.entregado - b.entregado);
    const todosRecs = V("recaudos").filter(r => r.mensajeroId === mid), todasBases = V("cajamovs").filter(c => c.cat === "base" && c.personaId === mid);
    const todosCobros = V("movimientos").filter(m => esCobroMensajero(m, mid)).map(m => ({ ...m, valor: signoMov(m) }));
    const recs = todosRecs.filter(r => r.fecha > desde).sort((a, b) => a.fecha - b.fecha);
    const cobrosCli = todosCobros.filter(m => m.fecha > desde).sort((a, b) => a.fecha - b.fecha);
    const bases = todasBases.filter(c => c.fecha > desde).sort((a, b) => a.fecha - b.fecha);
    const enVentana = (xs, l) => xs.filter(x => x.fecha > (Number(l.desde) || 0) && x.fecha <= l.fecha).reduce((a, x) => a + (Number(x.valor) || 0), 0);
    let ajuste = 0;
    for (const l of liqs) {
      if (!Array.isArray(l.guias)) continue;
      const lp = l.guias.map(g => S.pedidos[g]).filter(p => p && cerrado(p));
      ajuste += (totales(lp).efectivo - (Number(l.efectivo) || 0)) - (lp.reduce((a, p) => a + gastoDe(p), 0) - (Number(l.gastos) || 0))
        + (enVentana(todasBases, l) - (Number(l.base) || 0)) - (enVentana(todosRecs, l) - (Number(l.recibido) || 0)) - (Number(l.ajuste) || 0)
        + (enVentana(todosCobros, l) - (Number(l.cobros) || 0));
    }
    ajuste = Math.round(ajuste);
    const efectivo = totales(ps).efectivo, recibido = recs.reduce((a, r) => a + (Number(r.valor) || 0), 0), base = bases.reduce((a, c) => a + (Number(c.valor) || 0), 0), gastos = ps.reduce((a, p) => a + gastoDe(p), 0);
    const cobros = cobrosCli.reduce((a, m) => a + m.valor, 0);
    return { ul, desde, anterior, ajuste, ps, recs, bases, base, gastos, efectivo, recibido, cobros, cobrosCli, debe: anterior + ajuste + efectivo + base + cobros - gastos - recibido };
  }
  const recibidoDia = (mid, dia) => V("recaudos").filter(r => r.mensajeroId === mid && diaDe(r.fecha) === dia).reduce((a, r) => a + (Number(r.valor) || 0), 0);

  /* ---- cajas de oficina (una por asistente) ---- */
  const asistentes = () => V("usuarios").filter(u => u.rol === "asistente").sort((a, b) => String(a.nombre).localeCompare(String(b.nombre), "es"));
  const antesTxt = x => (x.medioAntes && x.medioAntes !== x.medio ? ` (antes ${MEDIOS[x.medioAntes] || x.medioAntes})` : "");
  function cajaOficina(auid) {
    const L = [], nomM = id => S.mensajeros[id]?.nombre || "", add = (fecha, concepto, valor, medio, ref) => L.push({ fecha, concepto, valor, medio: MEDIOS[medio] ? medio : "efectivo", ref });
    for (const c of V("cajamovs")) {
      if (c.cat === "oficina" && c.personaUid === auid) add(c.fecha, (c.nivel ? "Ajuste al cierre (cuenta de la empresa)" : c.tipo === "base" ? "Base de caja que entregó administración" : "Entregado a administración (cierre)") + (c.concepto ? " · " + c.concepto : ""), (c.tipo === "base" ? 1 : -1) * (Number(c.valor) || 0), c.medio, c.id);
      else if (c.cat === "sobrante" && c.personaUid === auid) add(c.fecha, "Sobrante registrado al cierre" + (c.concepto ? " · " + c.concepto : ""), Number(c.valor) || 0, c.medio, c.id);
      else if (c.cat === "base" && c.porUid === auid) add(c.fecha, "Base para vueltos a " + nomM(c.personaId), -(Number(c.valor) || 0), c.medio);
      else if (c.cat === "interna" && !c.inicial && c.porUid === auid) add(c.fecha, (c.tipo === "entra" ? "Entrada de " : "Salida a ") + (S.cuentas[c.cuentaId]?.nombre || "cuenta interna"), (c.tipo === "entra" ? 1 : -1) * (Number(c.valor) || 0), c.medio);
    }
    for (const r of V("recaudos")) if (r.porUid === auid) add(r.fecha, "Entrega de " + nomM(r.mensajeroId) + antesTxt(r), Number(r.valor) || 0, r.medio);
    for (const m of V("movimientos")) if (m.porUid === auid && !m.mensajeroId && ["pago_de_cliente", "pago_a_cliente", "compra_cliente"].includes(m.tipo))
      add(m.fecha, (m.tipo === "pago_de_cliente" ? "Pago de " : m.tipo === "pago_a_cliente" ? "Pago a " : "Compra para ") + nombreCliente(m.clienteId) + antesTxt(m), (m.tipo === "pago_de_cliente" ? 1 : -1) * (Number(m.valor) || 0), m.medio);
    for (const p of V("pedidos")) if (p.domiPagado && p.domiPagoUid === auid && p.domiPagoMedio) add(p.domiPagoFecha, "Pago de domicilio · " + p.guia, pagoDomi(p), p.domiPagoMedio);
    L.sort((a, b) => a.fecha - b.fecha);
    const saldo = { efectivo: 0, nequi: 0, bancolombia: 0 }; L.forEach(x => (saldo[x.medio] += x.valor));
    return { L, saldo, total: L.reduce((a, x) => a + x.valor, 0) };
  }
  const sumaMedios = L => { const o = { efectivo: 0, nequi: 0, bancolombia: 0 }; L.forEach(x => (o[x.medio] += x.valor)); return o; };

  /* ---- arqueo: lo ya contado no se cambia ---- */
  function corteCaja(sin) { let c = corteRemoto; for (const x of V("cajamovs")) if ((x.cat === "arqueo" || x.cat === "inicial") && !(sin && sin.includes(x.id))) c = Math.max(c, Number(x.fecha) || 0); return c; }
  const yaContado = f => { const c = corteCaja(); return !!c && Number(f) <= c; };
  const textoContado = () => "Eso ya quedó contado en el arqueo del " + hora(corteCaja()) + ". Para corregirlo, registra un movimiento nuevo.";
  const diaMinCaja = () => (corteCaja() ? diaDe(corteCaja()) : "");
  /** Lo del mismo día del arqueo queda después del arqueo. */
  const fechaCaja = dia => Math.max(fechaDia(dia), corteCaja() + 1);
  /** Devuelve el aviso si el día es anterior al último arqueo, o null si se puede registrar. */
  const diaAntesDelArqueo = dia => { const m = diaMinCaja(); return m && dia < m ? "La caja ya se contó el " + fechaLarga(m) + ": no se pueden registrar movimientos de días anteriores." : null; };
  function cambiaLoContado(antes, despues) {
    const c = corteCaja(); if (!c) return false;
    const k = p => (p ? lineasCajaPedido(p).filter(l => l[0] <= c).map(l => l.join("|")).sort().join(";") : "");
    return k(antes) !== k(despues);
  }
  function arqueosCaja() {
    const g = {};
    for (const c of V("cajamovs")) if (c.cat === "arqueo") {
      const a = g[c.arqueoId || c.id] = g[c.arqueoId || c.id] || { id: c.arqueoId || c.id, fecha: c.fecha, dif: {}, docs: [] }; a.docs.push(c.id);
      if (c.tipo === "marca") Object.assign(a, { esperado: c.esperado || {}, contado: c.contado || {}, nota: c.concepto || "", por: c.porNombre || "" });
      else a.dif[c.medio] = (a.dif[c.medio] || 0) + (c.tipo === "entra" ? 1 : -1) * (Number(c.valor) || 0);
    }
    return Object.values(g).sort((a, b) => b.fecha - a.fecha);
  }

  /* ---- libro y resumen de la caja general ---- */
  function libroCaja() {
    const L = [], nomM = id => S.mensajeros[id]?.nombre || "";
    for (const r of V("recaudos")) L.push({ fecha: r.fecha, concepto: "Entrega de " + nomM(r.mensajeroId) + (r.nota ? " · " + r.nota : ""), valor: Number(r.valor) || 0, medio: r.medio || "efectivo", cat: "Mensajeros", ref: "recaudos|" + r.id });
    for (const p of V("pedidos")) if (cerrado(p) && p.metodo === "transf_js") L.push({ fecha: p.entregado, concepto: "Transferencia a JS · " + p.guia + (p.destinatario ? " · " + p.destinatario : ""), valor: Number(p.valorCobrado) || 0, medio: p.cuentaJs || "cuentas", cat: "Transferencias" });
    for (const p of V("pedidos")) if (p.domiPagado && p.domiPagoMedio) L.push({ fecha: p.domiPagoFecha || p.entregado || p.creado, concepto: "Pago de domicilio · " + p.guia + (p.clienteId ? " · " + nombreCliente(p.clienteId) : ""), valor: pagoDomi(p), medio: p.domiPagoMedio, cat: "Clientes" });
    for (const m of V("movimientos")) if (mueveCaja(m)) L.push({ fecha: m.fecha, concepto: (m.tipo === "pago_de_cliente" ? "Pago de " : m.tipo === "compra_cliente" ? "Compra por encargo de " : "Pago a ") + nombreCliente(m.clienteId) + (m.nota ? " · " + m.nota : ""), valor: signoMov(m), medio: m.medio || "efectivo", cat: "Clientes" });
    const reacomodos = new Set(arqueosCaja().filter(a => netoArqueo(a) === 0).map(a => a.id));
    for (const c of V("cajamovs")) {
      // oficina: la plata pasa de manos de administración a las del asistente; saldo inicial de una cuenta interna: salió antes del empalme;
      // adelanto de una liquidación: el mensajero ya tenía esa plata; marca del arqueo: no es dinero
      if ((c.cat === "interna" && c.inicial) || c.cat === "oficina" || c.deLiquidacion || (c.cat === "arqueo" && c.tipo === "marca")) continue;
      else if (c.cat === "arqueo") L.push({ fecha: c.fecha, concepto: (reacomodos.has(c.arqueoId) ? (c.tipo === "entra" ? "Arqueo: pasa a este medio" : "Arqueo: sale de este medio") : (c.tipo === "entra" ? "Sobrante" : "Faltante") + " de arqueo") + (c.concepto ? " · " + c.concepto : ""), valor: (c.tipo === "entra" ? 1 : -1) * (Number(c.valor) || 0), medio: c.medio || "efectivo", cat: "Arqueo", ref: "cajamovs|" + c.id });
      else if (c.cat === "interna") { const n = S.cuentas[c.cuentaId]?.nombre || "Cuenta interna"; L.push({ fecha: c.fecha, concepto: (c.tipo === "entra" ? "Entrada de " : "Salida a ") + n + (c.concepto ? " · " + c.concepto : ""), valor: (c.tipo === "entra" ? 1 : -1) * (Number(c.valor) || 0), medio: c.medio || "efectivo", cat: n, ref: "cajamovs|" + c.id }); }
      else L.push({ fecha: c.fecha, concepto: (CATS[c.cat] || "Movimiento") + (c.personaId ? " · " + nomM(c.personaId) : "") + (c.concepto ? " · " + c.concepto : ""), valor: (c.tipo === "entra" ? 1 : -1) * (Number(c.valor) || 0), medio: c.medio || "efectivo", cat: CATS[c.cat] || "Otro", ref: "cajamovs|" + c.id });
    }
    return L.sort((a, b) => a.fecha - b.fecha);
  }
  function resumenCaja() {
    const L = libroCaja(), total = L.reduce((a, x) => a + x.valor, 0);
    const porMedio = {}; L.forEach(x => (porMedio[x.medio] = (porMedio[x.medio] || 0) + x.valor));
    let porPagar = 0, porCobrar = 0; Object.keys(S.clientes).forEach(id => { const s = saldoCliente(id); if (s > 0) porPagar += s; else porCobrar -= s; });
    const sem = resumenSemana(semanaDe(hoy())); const sueldosPend = sem.filas.reduce((a, f) => a + Math.max(0, f.neto), 0);
    const enMens = V("mensajeros").filter(esRepartidor).reduce((a, m) => a + Math.max(0, periodoMensajero(m.id).debe), 0);
    const sobs = V("cajamovs").filter(c => c.cat === "sobrante"), mes = hoy().slice(0, 7);
    const sobrantes = { n: sobs.length, total: sobs.reduce((a, c) => a + (Number(c.valor) || 0), 0), mes: sobs.filter(c => diaDe(c.fecha).startsWith(mes)).reduce((a, c) => a + (Number(c.valor) || 0), 0) };
    return { L, total, porMedio, porPagar, porCobrar, sueldosPend, enMens, sobrantes, disponible: total - porPagar - sueldosPend };
  }
  /** Lo que la app espera que tenga administración: la caja general menos el efectivo de las cajas de oficina.
      Nequi y Bancolombia no se restan: son las mismas cuentas de la empresa. */
  function esperadoArqueo() {
    const R = resumenCaja(), of = { efectivo: 0, nequi: 0, bancolombia: 0 };
    asistentes().forEach(u => { of.efectivo += cajaOficina(u.uid).saldo.efectivo; });
    const e = {}; for (const k of Object.keys(MEDIOS)) e[k] = Math.round((R.porMedio[k] || 0) - of[k]);
    return { e, of, sinCuenta: Math.round(R.porMedio.cuentas || 0) };
  }

  /* ---- cuentas internas ---- */
  const movsCuenta = id => V("cajamovs").filter(c => c.cat === "interna" && c.cuentaId === id).sort((a, b) => b.fecha - a.fecha);
  const saldoCuenta = id => movsCuenta(id).reduce((a, c) => a + (c.tipo === "sale" ? 1 : -1) * (Number(c.valor) || 0), 0); // + = te debe

  /* ---- sueldos ---- */
  const jornada = (pid, dia) => Number(S.jornadas[pid + "_" + dia]?.valor) || 0;
  const previoId = (pid, sem) => pid + "_previo_" + sem;
  const sueldoPrevio = (pid, sem) => Number(S.jornadas[previoId(pid, sem)]?.valor) || 0;
  function sueldosDia(dia) {
    const ent = V("pedidos").filter(p => cerrado(p) && diaSueldo(p) === dia);
    const res = {}, porM = {}; ent.forEach(p => (porM[p.mensajeroId] = porM[p.mensajeroId] || []).push(p));
    let dom30 = 0, propios = 0, desc = 0, fijos = 0, nMens = 0;
    for (const [mid, ps] of Object.entries(porM)) {
      const dom = ps.reduce((a, p) => a + servicio(p), 0);
      if (["dueno", "oficina"].includes(tipoDe(S.mensajeros[mid]))) propios += dom; // 100 % para JS
      else { res[mid] = sueldoDe(dom); dom30 += dom * (1 - PCT_SUELDO); desc += DESC_SUELDO; nMens++; }
    }
    for (const m of V("mensajeros")) if (PAGO_FIJO.includes(tipoDe(m))) { const x = jornada(m.id, dia); if (x) { res[m.id] = x; fijos += x; } }
    const ganancias = V("movimientos").filter(m => m.tipo === "ganancia" && diaDe(m.fecha) === dia).reduce((a, m) => a + (Number(m.valor) || 0), 0);
    const javier = dom30 + propios + desc + ganancias - fijos;
    const dueno = V("mensajeros").find(m => tipoDe(m) === "dueno");
    if (dueno && (ent.length || fijos || ganancias)) res[dueno.id] = javier;
    return { res, dom30, propios, desc, ganancias, fijos, nMens, javier };
  }
  function resumenSemana(sem) {
    const dias = diasSemana(sem), porDia = dias.map(sueldosDia);
    const personas = listaOrdenada(S.mensajeros, "nombre").sort((a, b) => ORDEN_TIPO.indexOf(tipoDe(a)) - ORDEN_TIPO.indexOf(tipoDe(b)));
    const filas = personas.map(m => {
      const vals = porDia.map(x => x.res[m.id] || 0), previo = sueldoPrevio(m.id, sem), total = vals.reduce((a, x) => a + x, 0) + previo;
      const movs = V("cajamovs").filter(c => c.personaId === m.id);
      const adelantos = movs.filter(c => c.cat === "adelanto" && esDeSemana(c, sem, dias));
      const adel = adelantos.reduce((a, c) => a + valorAdel(c), 0);
      const pagado = movs.filter(c => c.cat === "sueldo" && c.semana === sem).reduce((a, c) => a + (Number(c.valor) || 0), 0);
      return { m, vals, previo, total, adel, adelantos, pagado, neto: total - adel - pagado };
    });
    return { sem, dias, porDia, filas };
  }
  function sueldoPersonaSemana(mid, sem) {
    const dias = diasSemana(sem), porDia = dias.map(sueldosDia), vals = porDia.map(x => x.res[mid] || 0), previo = sueldoPrevio(mid, sem), total = vals.reduce((a, x) => a + x, 0) + previo;
    const movs = V("cajamovs").filter(c => c.personaId === mid);
    const adelantos = movs.filter(c => c.cat === "adelanto" && esDeSemana(c, sem, dias));
    const pagos = movs.filter(c => c.cat === "sueldo" && c.semana === sem);
    const adel = adelantos.reduce((a, c) => a + valorAdel(c), 0), pagado = pagos.reduce((a, c) => a + (Number(c.valor) || 0), 0);
    return { sem, dias, vals, previo, total, adelantos, pagos, adel, pagado, neto: total - adel - pagado };
  }
  function pendienteAnterior(mid, sem) {
    const out = []; for (let i = 1; i <= 12; i++) { const w = moverSemana(sem, -i), r = sueldoPersonaSemana(mid, w); if (Math.round(r.neto) > 0) out.push(r); } return out;
  }
  /** Semanas a las que se puede cargar un adelanto: la actual y la anterior (el sábado se paga la semana que terminó el viernes). */
  function semanasAdelanto() {
    const act = semanaDe(hoy()), ant = moverSemana(act, -1), txt = w => { const d = diasSemana(w); return fechaCorta(d[0]) + " al " + fechaCorta(d[6]); };
    const sab = diaSemana(hoy()) === 6, l = [[ant, "Semana del " + txt(ant) + (sab ? " (la que se paga hoy)" : "")], [act, "Semana del " + txt(act) + (sab ? "" : " (esta semana)")]];
    return sab ? l : l.reverse();
  }

  /* ---- cierre del día y cuadre de clientes ---- */
  function pendientesCierre() {
    const mens = V("mensajeros").filter(esRepartidor).map(m => ({ m, debe: Math.round(periodoMensajero(m.id).debe) })).filter(x => x.debe > 0).sort((a, b) => b.debe - a.debe);
    const ofis = asistentes().map(u => ({ u, s: cajaOficina(u.uid).saldo })).filter(x => Object.values(x.s).some(v => Math.round(v))), ofisEf = ofis.filter(x => Math.round(x.s.efectivo));
    const P = V("pedidos"), sinRem = P.filter(p => !p.clienteId), sinServ = P.filter(sinServicio), enRuta = P.filter(p => p.estado === "pendiente");
    const a = arqueosCaja()[0];
    return { mens, ofis, ofisEf, sinRem, sinServ, enRuta, arqueoHoy: !!a && diaDe(a.fecha) === hoy(), a };
  }
  function cuadreDia(dia) {
    const res = {};
    const get = cid => (res[cid] = res[cid] || { cid, anterior: 0, lineas: [], delDia: 0, pagos: 0 });
    for (const p of V("pedidos")) {
      if (!cerrado(p) || !p.clienteId) continue; // las devoluciones también cuentan: se cobra el domicilio
      const d = diaDe(p.entregado), s = saldoPedido(p), dev = p.estado === "devuelto";
      if (d < dia) get(p.clienteId).anterior += s;
      else if (d === dia) { const r = get(p.clienteId); r.lineas.push({ t: (dev ? "Devolución" : "") + (dev && p.destinatario ? " · " : "") + (p.destinatario || (dev ? "" : p.guia)), guia: p.guia, p, v: s, f: p.entregado }); r.delDia += s; }
    }
    for (const m of V("movimientos")) {
      const d = diaDe(m.fecha), s = signoMov(m);
      if (d < dia) get(m.clienteId).anterior += s;
      else if (d === dia) { const r = get(m.clienteId); if (esPago(m)) r.pagos += s; else { r.lineas.push({ t: (MOVS[m.tipo]?.corto || "Ajuste") + (m.nota ? ": " + m.nota : ""), v: s, f: m.fecha }); r.delDia += s; } }
    }
    return Object.values(res).filter(r => S.clientes[r.cid] && (r.lineas.length || r.pagos))
      .map(r => { r.lineas.sort((a, b) => a.f - b.f); return { ...r, nombre: nombreCliente(r.cid), total: r.anterior + r.delDia, queda: r.anterior + r.delDia + r.pagos }; })
      .sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));
  }

  return {
    S, saldoCliente, nombreCliente, listaOrdenada, filasCuenta, parecidos, gruposRepetidos,
    liquidacionesDe, yaLiquidado, guiasLiquidadas, pedidoLiquidado, periodoMensajero, recibidoDia,
    asistentes, cajaOficina, sumaMedios,
    corteCaja, yaContado, textoContado, diaMinCaja, fechaCaja, diaAntesDelArqueo, cambiaLoContado, arqueosCaja,
    libroCaja, resumenCaja, esperadoArqueo, movsCuenta, saldoCuenta,
    jornada, previoId, sueldoPrevio, sueldosDia, resumenSemana, sueldoPersonaSemana, pendienteAnterior, semanasAdelanto,
    pendientesCierre, cuadreDia,
    ahora
  };
}
