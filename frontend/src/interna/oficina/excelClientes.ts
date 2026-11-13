/*
 * Excel de la pestaña Clientes, copiados de descargarCartera y descargarExcel de app/js/app.js: la cartera
 * (cuentas por cobrar y por pagar) y el cuadre de un día (recibos, resumen por cliente, pedidos y mensajeros).
 * El archivo se arma en el navegador con ExcelJS, que se baja solo la primera vez que se pide un Excel.
 */
import type { Row, Workbook } from "exceljs";
import {
  S, EMPRESA, METODOS, PCT_SUELDO, DESC_SUELDO, TIPOS, cerrado, cuadreDia, diaDe, fechaLarga, ganaPorcentaje, gastoDe, hoy, listaOrdenada, metodoTxt,
  nombreCliente, pagoDomi, recibidoDia, saldoCliente, saldoPedido, servicio, sueldoPedidos, tipoCuenta, tipoDe, totales, type Pedido,
} from "../motor";

const AZUL = "FF115072";

async function libro(): Promise<Workbook> {
  const m = await import("exceljs");
  // El paquete del navegador es CommonJS: según cómo lo empaque Vite, Workbook llega suelto o dentro de `default`.
  const W = m.Workbook ?? (m as unknown as { default: typeof m }).default.Workbook;
  const wb = new W(); wb.creator = "JS Logistics";
  return wb;
}

async function guardar(wb: Workbook, nombre: string) {
  const buf = await wb.xlsx.writeBuffer();
  const url = URL.createObjectURL(new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }));
  const a = document.createElement("a"); a.href = url; a.download = nombre; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

const corto = (dia: string) => { const [y, mo, d] = dia.split("-"); return `${d}-${mo}-${y}`; };
const fechaCorta = (ts: number) => new Date(ts).toLocaleDateString("es-CO", { timeZone: "America/Bogota" });
const cabecera = (row: Row) => {
  row.eachCell(c => { c.font = { bold: true, color: { argb: "FFFFFFFF" } }; c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: AZUL } }; c.alignment = { vertical: "middle" }; });
  row.height = 20;
};

/** Cartera de hoy: una hoja con los que te deben y otra con los que les debes, con el último movimiento de cada uno. */
export async function descargarCartera() {
  const MON = '"$" #,##0';
  const cs = listaOrdenada(S.clientes, "nombre").map(c => ({ ...c, s: saldoCliente(c.id) }));
  // Último movimiento de cada cliente (entrega o pago), en una sola pasada.
  const ult = new Map<string, number>();
  const marcar = (cid: string, f: number) => { if (f > (ult.get(cid) || 0)) ult.set(cid, f); };
  Object.values(S.pedidos).forEach(p => { if (p.entregado) marcar(p.clienteId, p.entregado); });
  Object.values(S.movimientos).forEach(m => marcar(m.clienteId, m.fecha));
  const wb = await libro();
  const hoja = (titulo: string, lista: typeof cs) => {
    const w = wb.addWorksheet(titulo, { views: [{ state: "frozen", ySplit: 2 }] });
    w.mergeCells("A1:D1"); w.getCell("A1").value = `${titulo.toUpperCase()} · corte ${fechaLarga(hoy())}`; w.getCell("A1").font = { bold: true, size: 13 };
    w.getRow(2).values = ["Cliente", "Número", "Valor", "Último movimiento"];
    w.columns = [{ width: 28 }, { width: 16 }, { width: 15, style: { numFmt: MON } }, { width: 20 }];
    w.getRow(2).eachCell(c => { c.font = { bold: true, color: { argb: "FFFFFFFF" } }; c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: AZUL } }; });
    lista.forEach(c => { const u = ult.get(c.id); w.addRow([c.nombre, c.telefono || "", Math.abs(c.s), u ? fechaCorta(u) : ""]); });
    const t = lista.length + 3; w.getCell("A" + t).value = "TOTAL"; w.getRow(t).font = { bold: true };
    w.getCell("C" + t).value = { formula: `SUM(C3:C${t - 1})`, result: lista.reduce((a, c) => a + Math.abs(c.s), 0) }; w.getCell("C" + t).numFmt = MON;
  };
  hoja("Cuentas por cobrar", cs.filter(c => c.s < 0));
  hoja("Cuentas por pagar", cs.filter(c => c.s > 0));
  await guardar(wb, `cartera-clientes-${corto(hoy())}.xlsx`);
}

/** Cuadre de un día: recibos listos para imprimir, resumen por cliente, pedidos del día y mensajeros, con fórmulas.
 *  Devuelve false si ese día no hubo entregas ni pagos de clientes. */
export async function descargarCuadre(dia: string): Promise<boolean> {
  const lista = cuadreDia(dia);
  if (!lista.length) return false;
  const wb = await libro();
  const MON = '"$" #,##0;[Red]-"$" #,##0';

  // Recibos imprimibles
  const wr = wb.addWorksheet("Recibos");
  wr.columns = [{ width: 32 }, { width: 15 }];
  let fila = 1, enPagina = 0;
  for (const r of lista) {
    const alto = 12 + r.lineas.length + (r.anterior ? 1 : 0) + (r.pagos ? 2 : 0);
    if (enPagina && enPagina + alto > 52) { wr.getRow(fila - 1).addPageBreak(); enPagina = 0; }
    const put = (a: string, b?: number | null, o: { bold?: boolean; size?: number; center?: boolean; abajo?: boolean; arriba?: boolean } = {}) => {
      const row = wr.getRow(fila++); row.getCell(1).value = a;
      if (b !== undefined && b !== null) { row.getCell(2).value = b; row.getCell(2).numFmt = MON; }
      if (o.center) { wr.mergeCells(row.number, 1, row.number, 2); row.getCell(1).alignment = { horizontal: "center" }; }
      else row.getCell(1).alignment = { wrapText: true, vertical: "top" };
      if (o.bold) [1, 2].forEach(c => (row.getCell(c).font = { bold: true, size: o.size || 11 }));
      if (o.abajo) [1, 2].forEach(c => (row.getCell(c).border = { bottom: { style: "dashed" } }));
      if (o.arriba) [1, 2].forEach(c => (row.getCell(c).border = { top: { style: "dashed" } }));
      return row;
    };
    put(EMPRESA.nombre, null, { bold: true, center: true });
    put("RECIBO DE CUADRE", null, { bold: true, center: true });
    put(fechaLarga(dia), null, { center: true });
    put(r.nombre, null, { bold: true, size: 14, center: true, abajo: true });
    const ini = fila;
    if (r.anterior) put("Saldo anterior", r.anterior);
    r.lineas.forEach(l => put(l.t, l.v));
    const fin = fila - 1;
    const tRow = put("TOTAL:", null, { bold: true, arriba: true });
    tRow.getCell(2).value = fin >= ini ? { formula: `SUM(B${ini}:B${fin})`, result: r.total } : r.total; tRow.getCell(2).numFmt = MON;
    if (r.pagos) { put("Pagado", r.pagos); const q = put("QUEDA PENDIENTE:", null, { bold: true }); q.getCell(2).value = { formula: `B${tRow.number}+B${tRow.number + 1}`, result: r.queda }; q.getCell(2).numFmt = MON; }
    put("");
    put(EMPRESA.lema, null, { bold: true, center: true }); put(EMPRESA.tel, null, { center: true }); put(EMPRESA.ig, null, { center: true });
    put("- - - - - - - - - - - - - - - - - - - - - - - -", null, { center: true }); put("");
    enPagina += alto;
  }
  wr.pageSetup = { orientation: "portrait", fitToPage: true, fitToWidth: 1, fitToHeight: 0, horizontalCentered: true, margins: { left: .4, right: .4, top: .4, bottom: .4, header: .2, footer: .2 }, printArea: `A1:B${Math.max(1, fila - 1)}` };

  const ent = Object.values(S.pedidos).filter(p => cerrado(p) && diaDe(p.entregado || 0) === dia).sort((a, b) => (a.entregado || 0) - (b.entregado || 0));
  const delPedido = (r: (typeof lista)[number]) => r.lineas.filter(l => l.p).reduce((a, l) => a + l.v, 0);

  // Resumen por cliente
  const wc = wb.addWorksheet("Resumen clientes", { views: [{ state: "frozen", ySplit: 1 }] });
  wc.columns = [{ header: "Cliente", width: 26 }, { header: "Saldo anterior", width: 15, style: { numFmt: MON } }, { header: "Entregas del día", width: 16, style: { numFmt: MON } }, { header: "Ajustes del día", width: 15, style: { numFmt: MON } }, { header: "Total cuadre", width: 15, style: { numFmt: MON } }, { header: "Pagado", width: 13, style: { numFmt: MON } }, { header: "Queda pendiente", width: 16, style: { numFmt: MON } }, { header: "Tipo de cuenta", width: 15 }];
  cabecera(wc.getRow(1));
  lista.forEach((r, i) => {
    const k = i + 2, ped = delPedido(r);
    wc.addRow([r.nombre, r.anterior, null, r.delDia - ped, null, r.pagos, null]);
    wc.getCell("C" + k).value = { formula: `SUMIF(Pedidos!D:D,A${k},Pedidos!H:H)`, result: ped };
    wc.getCell("E" + k).value = { formula: `B${k}+C${k}+D${k}`, result: r.total };
    wc.getCell("G" + k).value = { formula: `E${k}+F${k}`, result: r.queda };
    wc.getCell("H" + k).value = { formula: `IF(G${k}>0,"Por pagar",IF(G${k}<0,"Por cobrar","Paz y salvo"))`, result: tipoCuenta(r.queda) };
  });
  const tc = lista.length + 2; wc.getCell("A" + tc).value = "TOTAL"; wc.getRow(tc).font = { bold: true };
  const suma = (f: (r: (typeof lista)[number]) => number) => lista.reduce((a, r) => a + f(r), 0);
  ([["B", r => r.anterior], ["C", delPedido], ["D", r => r.delDia - delPedido(r)], ["E", r => r.total], ["F", r => r.pagos], ["G", r => r.queda]] as [string, (r: (typeof lista)[number]) => number][])
    .forEach(([c, f]) => (wc.getCell(c + tc).value = { formula: `SUM(${c}2:${c}${tc - 1})`, result: suma(f) }));

  // Pedidos del día (como la hoja diaria)
  const wp = wb.addWorksheet("Pedidos", { views: [{ state: "frozen", ySplit: 1 }] });
  wp.columns = [{ header: "Guía", width: 11 }, { header: "Mensajero", width: 16 }, { header: "Precio", width: 11, style: { numFmt: MON } }, { header: "Cliente", width: 22 }, { header: "Destinatario", width: 24 }, { header: "Cobro", width: 12, style: { numFmt: MON } }, { header: "Método", width: 24 }, { header: "Saldo", width: 12, style: { numFmt: MON } }, { header: "Pagó domicilio", width: 15, style: { numFmt: MON } }, { header: "Flete / gasto", width: 13, style: { numFmt: MON } }];
  cabecera(wp.getRow(1));
  ent.forEach((p, i) => {
    const k = i + 2;
    wp.addRow([p.guia, S.mensajeros[p.mensajeroId]?.nombre || "", servicio(p), nombreCliente(p.clienteId) || "SIN REMITENTE", p.destinatario || "", Number(p.valorCobrado) || 0, metodoTxt(p), null, pagoDomi(p), gastoDe(p)]);
    wp.getCell("H" + k).value = { formula: `IF(G${k}="${METODOS.transf_cliente.t}",0,F${k})-C${k}-J${k}+I${k}`, result: saldoPedido(p) };
  });
  const tp = ent.length + 2; wp.getCell("A" + tp).value = "TOTAL"; wp.getRow(tp).font = { bold: true };
  wp.getCell("C" + tp).value = { formula: `SUM(C2:C${tp - 1})`, result: ent.reduce((a, p) => a + servicio(p), 0) };
  wp.getCell("F" + tp).value = { formula: `SUM(F2:F${tp - 1})`, result: ent.reduce((a, p) => a + (Number(p.valorCobrado) || 0), 0) };
  wp.getCell("H" + tp).value = { formula: `SUM(H2:H${tp - 1})`, result: ent.reduce((a, p) => a + saldoPedido(p), 0) };

  // Mensajeros
  const wm = wb.addWorksheet("Mensajeros", { views: [{ state: "frozen", ySplit: 1 }] });
  wm.columns = [{ header: "Mensajero", width: 18 }, { header: "Entregas", width: 10 }, { header: "Domicilios", width: 13, style: { numFmt: MON } }, { header: "Sueldo (70% - 25.000)", width: 20, style: { numFmt: MON } }, { header: "Efectivo", width: 13, style: { numFmt: MON } }, { header: "Transf. a JS", width: 13, style: { numFmt: MON } }, { header: "Directo al cliente", width: 16, style: { numFmt: MON } }, { header: "Entregó", width: 13, style: { numFmt: MON } }, { header: "Debe", width: 13, style: { numFmt: MON } }];
  cabecera(wm.getRow(1));
  const porM: Record<string, Pedido[]> = {}; ent.forEach(p => (porM[p.mensajeroId] = porM[p.mensajeroId] || []).push(p));
  Object.entries(porM).forEach(([mid, ps], i) => {
    const k = i + 2, t = totales(ps), nom = S.mensajeros[mid]?.nombre || "Sin nombre", entrego = recibidoDia(mid, dia);
    wm.addRow([nom, null, null, null, null, null, null, null, null]);
    wm.getCell("B" + k).value = { formula: `COUNTIF(Pedidos!B:B,A${k})`, result: ps.length };
    wm.getCell("C" + k).value = { formula: `SUMIF(Pedidos!B:B,A${k},Pedidos!C:C)`, result: t.servicio };
    wm.getCell("D" + k).value = ganaPorcentaje(S.mensajeros[mid]) ? { formula: `C${k}*${PCT_SUELDO}-${DESC_SUELDO}`, result: sueldoPedidos(ps) } : (TIPOS[tipoDe(S.mensajeros[mid])] || "");
    wm.getCell("E" + k).value = { formula: `SUMIFS(Pedidos!F:F,Pedidos!B:B,A${k},Pedidos!G:G,"${METODOS.efectivo.t}")`, result: t.efectivo };
    wm.getCell("F" + k).value = { formula: `SUMIFS(Pedidos!F:F,Pedidos!B:B,A${k},Pedidos!G:G,"${METODOS.transf_js.t}")`, result: t.transfJs };
    wm.getCell("G" + k).value = { formula: `SUMIFS(Pedidos!F:F,Pedidos!B:B,A${k},Pedidos!G:G,"${METODOS.transf_cliente.t}")`, result: t.transfCli };
    wm.getCell("H" + k).value = entrego;
    wm.getCell("I" + k).value = { formula: `E${k}-H${k}`, result: t.efectivo - entrego };
  });

  await guardar(wb, `cuadre-${corto(dia)}.xlsx`);
  return true;
}
