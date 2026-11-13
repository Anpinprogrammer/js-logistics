/*
 * Tiquetes para la impresora térmica (SAT-16TU), copiados de imprimirTicket y sus ayudantes de app/js/app.js.
 * No hay servidor de impresión: el tiquete se arma como texto de ancho fijo y se imprime con la ventana normal
 * del navegador desde un marco oculto. Ahí la persona elige la impresora térmica, márgenes "Ninguno" y escala 100 %.
 */
import { S, EMPRESA, MEDIOS, cuadreDia, fechaLarga, filasCuenta, saldoCliente, type Medio } from "./motor";

/** Solo ASCII: la impresora no trae tildes ni el espacio fino que pone toLocaleString. */
export const tkTxt = (x: unknown) => String(x ?? "").replace(/[  ]/g, " ").normalize("NFD").replace(/[̀-ͯ]/g, "")
  .replace(/[^\x20-\x7E]/g, "").replace(/\s+/g, " ").trim();
export const tkPesos = (v: number) => (Math.round(v) < 0 ? "-" : "") + "$" + Math.abs(Math.round(v)).toLocaleString("es-CO").replace(/[^\d]/g, ".");

export interface Lineas {
  L: string[]; cols: number;
  centro: (t: string) => void; raya: (c?: string) => void; fila: (izq: string, der?: string) => void; texto: (t: string) => void; vacio: () => void;
}
export type Armar = (t: Lineas) => void;

export function tkLineas(cols: number): Lineas {
  const L: string[] = [];
  return {
    L, cols,
    centro: t => { t = tkTxt(t).slice(0, cols); L.push(" ".repeat(Math.floor((cols - t.length) / 2)) + t); },
    raya: (c = "-") => L.push(c.repeat(cols)),
    fila: (izq, der = "") => { der = tkTxt(der); izq = tkTxt(izq).slice(0, Math.max(1, cols - der.length - 1)); L.push(izq + " ".repeat(Math.max(1, cols - izq.length - der.length)) + der); },
    texto: t => { let x = tkTxt(t); while (x.length > cols) { let k = x.lastIndexOf(" ", cols); if (k < 1) k = cols; L.push(x.slice(0, k)); x = x.slice(k).trim(); } if (x) L.push(x); },
    vacio: () => L.push(""),
  };
}

export type Papel = 80 | 58;
const CLAVE_PAPEL = "js_papel";
export const papelGuardado = (): Papel => { try { return localStorage.getItem(CLAVE_PAPEL) === "58" ? 58 : 80; } catch { return 80; } };
export const guardarPapel = (mm: Papel) => { try { localStorage.setItem(CLAVE_PAPEL, String(mm)); } catch { /* sin almacenamiento */ } };

/** Cada tiquete con el encabezado y el pie de la empresa, en el ancho del papel (40 columnas en 80 mm, 32 en 58 mm). */
export function textosTiquete(lista: Armar[], mm: Papel) {
  const cols = mm === 80 ? 40 : 32;
  return lista.map(fn => {
    const t = tkLineas(cols);
    t.centro(EMPRESA.nombre); t.centro(new Date().toLocaleString("es-CO", { dateStyle: "short", timeStyle: "short", timeZone: "America/Bogota" })); t.raya("=");
    fn(t); t.raya("="); t.centro(EMPRESA.lema); t.centro(EMPRESA.tel);
    for (let i = 0; i < 5; i++) t.vacio(); // espacio para cortar el papel sin perder el final
    return { txt: t.L.join("\n"), cols };
  });
}
/** Tamaño de letra para que las columnas llenen el ancho imprimible (72 mm en papel de 80, 48 mm en papel de 58). */
export const letraTiquete = (cols: number, mm: Papel) => ((mm === 80 ? 72 : 48) / cols / 0.6).toFixed(2) + "mm";

const esc = (s: string) => s.replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string));

/** Imprime desde un marco aparte, para que salga solo el tiquete (varios, uno detrás de otro, con salto de página). */
export function imprimirTiquetes(titulo: string, lista: Armar[], mm: Papel) {
  const xs = textosTiquete(lista, mm);
  const pre = xs.map((x, i) => `<pre style="margin:0;font:700 ${letraTiquete(x.cols, mm)}/1.25 'Courier New',Courier,monospace;color:#000;white-space:pre;${i < xs.length - 1 ? "break-after:page;page-break-after:always" : ""}">${esc(x.txt)}</pre>`).join("");
  const fr = document.createElement("iframe");
  fr.setAttribute("aria-hidden", "true");
  fr.style.cssText = "position:fixed;width:0;height:0;border:0;right:0;bottom:0";
  document.body.appendChild(fr);
  const d = fr.contentWindow?.document; if (!d) { fr.remove(); return; }
  d.open();
  d.write(`<!doctype html><html><head><meta charset="utf-8"><title>${esc(tkTxt(titulo))}</title><style>@page{margin:0}html,body{margin:0;background:#fff}body{padding:2mm 4mm}</style></head><body>${pre}</body></html>`);
  d.close();
  setTimeout(() => { fr.contentWindow?.focus(); fr.contentWindow?.print(); setTimeout(() => fr.remove(), 60000); }, 200);
}

const DATOS_PAGO = "Nequi 316 493 3854 - Bancolombia ahorros 815 13203390 - Javier Salazar";

/** Lista de clientes por cobrar y por pagar (imprimirClientes del prototipo). `k` da el valor de cada cliente. */
export function armarListaClientes(secciones: [string, string, { nombre: string; v: number }[], number][], dia: string): Armar {
  return t => {
    if (dia) t.centro("Movimiento del " + dia);
    secciones.forEach(([tit, txt, cs, tot], i) => {
      if (i) t.vacio();
      t.centro(tit.toUpperCase()); t.raya();
      if (cs.length) cs.forEach(c => t.fila(c.nombre, tkPesos(Math.abs(c.v)))); else t.centro("Ninguno");
      t.raya(); t.fila(`${txt} (${cs.length})`, tkPesos(tot));
    });
  };
}

/** Recibo de cuenta de un cliente: una línea por pedido o movimiento desde la última vez que quedó a paz y salvo;
 *  los más viejos se juntan en "saldo anterior". `pago` cuando en ese momento se le paga el saldo a favor. */
export function armarRecibo(cid: string, pago?: { medio: Medio } | null): Armar | null {
  const c = S.clientes[cid]; if (!c) return null;
  const asc = filasCuenta(cid).slice().reverse(); let corte = 0, acc = 0;
  asc.forEach((r, i) => { acc += r.v; if (Math.round(acc) === 0) corte = i + 1; });
  let rows = asc.slice(corte); const MAX = 60, viejas = rows.length > MAX ? rows.slice(0, rows.length - MAX) : []; rows = rows.slice(viejas.length);
  const anterior = viejas.reduce((a, r) => a + r.v, 0), s = saldoCliente(cid);
  return t => {
    t.centro("RECIBO DE CUENTA"); t.centro(c.nombre); if (c.telefono) t.centro(c.telefono); t.raya();
    if (anterior) t.fila("Saldo anterior", tkPesos(anterior));
    if (rows.length) rows.forEach(r => t.fila((r.pid ? r.pid + " " : "") + r.nom, tkPesos(r.v))); else t.centro("Sin movimientos pendientes");
    t.raya(); t.fila(s > 0 ? "JS LE DEBE" : s < 0 ? "DEBE A JS" : "PAZ Y SALVO", tkPesos(Math.abs(s)));
    if (pago && s > 0) { t.fila("PAGADO EN " + MEDIOS[pago.medio].toUpperCase(), tkPesos(-s)); t.fila("SALDO", "$0"); t.vacio(); t.vacio(); t.fila("Recibido: ______________________"); }
    if (s < 0) { t.vacio(); t.texto(DATOS_PAGO); }
  };
}

/** Recibo de cuadre de un día: saldo anterior, lo de ese día, lo pagado y lo que queda. */
export function armarReciboDia(cid: string, dia: string, pago?: { medio: Medio; valor: number } | null): Armar | null {
  const r = cuadreDia(dia).find(x => x.cid === cid), c = S.clientes[cid]; if (!r || !c) return null;
  return t => {
    t.centro("RECIBO DE CUADRE"); t.centro(c.nombre); if (c.telefono) t.centro(c.telefono); t.centro(fechaLarga(dia)); t.raya();
    if (r.anterior) t.fila("Saldo anterior", tkPesos(r.anterior));
    r.lineas.forEach(l => t.fila(l.p ? l.guia + " " + (l.p.estado === "devuelto" ? "Devolucion " + (l.p.destinatario || "") : (l.p.destinatario || "")) : l.t, tkPesos(l.v)));
    t.raya(); t.fila("TOTAL", tkPesos(r.total));
    if (r.pagos) t.fila("PAGADO", tkPesos(r.pagos));
    t.fila(r.queda > 0 ? "JS LE DEBE" : r.queda < 0 ? "DEBE A JS" : "PAZ Y SALVO", tkPesos(Math.abs(r.queda)));
    if (pago && r.queda > 0) { t.fila("PAGADO EN " + MEDIOS[pago.medio].toUpperCase(), tkPesos(-pago.valor)); t.fila("SALDO", tkPesos(r.queda - pago.valor)); t.vacio(); t.vacio(); t.fila("Recibido: ______________________"); }
    if (r.queda < 0) { t.vacio(); t.texto(DATOS_PAGO); }
  };
}
