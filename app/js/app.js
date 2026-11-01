"use strict";
/* ---------- utilidades ---------- */
const $ = s => document.querySelector(s);
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const pesos = n => "$ " + Math.round(Number(n)||0).toLocaleString("es-CO");
const diaDe = ts => new Date(ts).toLocaleDateString("en-CA");
const hoy = () => diaDe(Date.now());
const hora = ts => new Date(ts).toLocaleString("es-CO",{day:"2-digit",month:"short",hour:"2-digit",minute:"2-digit"});
const sleep = ms => new Promise(r => setTimeout(r, ms));
const nuevoId = () => Date.now().toString(36) + Math.random().toString(36).slice(2,7);
const METODOS = {
  efectivo:{t:"Efectivo", d:"El mensajero recibe el dinero en mano"},
  transf_js:{t:"Transferencia a JS", d:"El destinatario le transfiere a la empresa"},
  transf_cliente:{t:"Transferencia al cliente", d:"Le pagaron directo al remitente: el remitente queda debiendo el domicilio"}
};
/* Solo se muestran imágenes que la app misma produce; cualquier otro texto en una foto se descarta. */
const fotoSegura = s => typeof s==="string" && /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+\/=]+$/.test(s) ? s : "";
const sinTildes = s => String(s||"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase();
/* Visor: cualquier foto con data-ampliar se ve en pantalla completa al tocarla (dentro del diálogo abierto). */
document.addEventListener("click",e=>{
  const im=e.target.closest("img[data-ampliar], .fotos img"); if(!im||!fotoSegura(im.src)) return;
  const v=document.createElement("div"); v.className="visor"; v.innerHTML=`<img src="${fotoSegura(im.src)}" alt=""><button class="cerrar" aria-label="Cerrar">×</button>`;
  v.onclick=ev=>{ ev.stopPropagation(); v.remove(); }; ($("#dlg").open?$("#dlg"):document.body).appendChild(v);
});
function toast(msg){ const t=document.createElement("div"); t.className="toast"; t.setAttribute("role","status"); t.textContent=msg; document.body.appendChild(t); setTimeout(()=>t.remove(),2600); }
function lsGet(k){ try{return localStorage.getItem(k)}catch(e){return null} }
function lsSet(k,v){ try{localStorage.setItem(k,v)}catch(e){} }

/* Fotos de salida, entrega y devolución: 800 px y calidad 0,5 (~35% más livianas que 900/0,6, igual de legibles). */
const FOTO_PX=800, FOTO_Q=.5;
async function comprimir(file, max, q){
  const url = URL.createObjectURL(file);
  try{
    const img = await new Promise((res,rej)=>{const i=new Image(); i.onload=()=>res(i); i.onerror=rej; i.src=url;});
    const k = Math.min(1, max/Math.max(img.naturalWidth,img.naturalHeight));
    const c = document.createElement("canvas"); c.width=Math.round(img.naturalWidth*k); c.height=Math.round(img.naturalHeight*k);
    const x=c.getContext("2d"); x.fillStyle="#fff"; x.fillRect(0,0,c.width,c.height); x.drawImage(img,0,0,c.width,c.height);
    return c.toDataURL("image/jpeg", q);
  } finally { URL.revokeObjectURL(url); }
}

/* ---------- datos (db compartida, o memoria si no hay) ---------- */
let db=null, usuario=null, uid=null, esAdmin=true, esAsistente=false; // asistente: Pedidos, Clientes y Recibos, sin caja ni sueldos
let esCliente=false, miCliente=""; // cliente: solo ve sus pedidos, pruebas y saldo
const S={pedidos:{},clientes:{},mensajeros:{},movimientos:{},recaudos:{},liquidaciones:{},jornadas:{},cajamovs:{},vinculos:{},usuarios:{},cuentas:{}};
const memDocs={}; let memContador=0;
let cargado=false;

async function rawSet(col,id,data,unir){ // unir: conserva los campos que ya tenía el documento
  if(db) await db.collection(col).doc(id).set(data,unir?{merge:true}:undefined);
  else { const k=col+"/"+id, prev=unir?(S[col]?S[col][id]:memDocs[k]):null, d=prev?{...prev,...data}:data; S[col]?(S[col][id]=d):(memDocs[k]=d); pintar(); } }
async function rawUpd(col,id,data){ if(db) await db.collection(col).doc(id).update(data); else { Object.assign(S[col]?S[col][id]:memDocs[col+"/"+id],data); pintar(); } }
async function rawDel(col,id){ if(db) await db.collection(col).doc(id).delete(); else { if(S[col]) delete S[col][id]; else delete memDocs[col+"/"+id]; pintar(); } }
async function listar(col,filtros=[],orden,lim){
  if(db){ let q=db.collection(col); filtros.forEach(f=>q=q.where(...f)); if(orden) q=q.orderBy(orden,"desc"); if(lim) q=q.limit(lim); const r=await q.get(); return r.docs.map(d=>d.data()); }
  const ops={"==":(a,b)=>a===b,">=":(a,b)=>a>=b};
  let out=Object.entries(memDocs).filter(([k])=>k.startsWith(col+"/")&&k.split("/").length===2).map(([,v])=>v).filter(d=>filtros.every(([f,o,v])=>ops[o](d[f],v)));
  if(orden) out.sort((a,b)=>(b[orden]||0)-(a[orden]||0)); return lim?out.slice(0,lim):out;
}
/* historial: un documento por día y por persona, para no gastar el cupo de documentos */
const NO_LOG=["fotos","entregas","meta","historial","papelera","papelera_fotos"];
const COL_NOM={pedidos:"pedido",clientes:"cliente",movimientos:"movimiento de cliente",recaudos:"entrega de dinero",liquidaciones:"liquidación",cajamovs:"movimiento de caja",mensajeros:"personal",jornadas:"día de sueldo",vinculos:"vínculo de cuenta"};
const ESTADOS={pendiente:"por entregar",entregado:"entregado",devuelto:"devuelto"};
const CAMPOS={cambioRecibido:"cambio",gasto:"flete/gasto",domiPagoValor:"pago de domicilio",domiPagoMedio:"medio del pago",estado:"estado",valorServicio:"servicio",clienteId:"remitente",valorCobrado:"cobrado",metodo:"método",domiPagado:"domicilio pagado",aCobrar:"a cobrar",cobrarDev:"cobrar devolución",cuentaJs:"cuenta",tipo:"tipo",tarifa:"pago por día",nombre:"nombre",telefono:"teléfono",motivoDev:"motivo"};
const memHist=[]; let histCadena=Promise.resolve();
const miNombre = () => { try{ return usuario?.nombre?.() || ""; }catch(e){ return ""; } }; // quien está usando la app
function registrar(txt){
  const e={t:Date.now(),a:txt,u:uid||"",m:miMensajero||"",r:rol};
  if(!db){ memHist.push(e); return; }
  const id=hoy()+"_"+String(uid||"anon").replace(/[^A-Za-z0-9_-]/g,"").slice(0,60);
  histCadena=histCadena.then(async()=>{ const ref=db.collection("historial").doc(id); const sn=await ref.get(); const ent=sn.exists?(sn.data().e||[]):[]; ent.push(e); await ref.set({dia:hoy(),uid:uid||"",e:ent.slice(-1500)}); }).catch(err=>console.warn("historial",err));
}
function resumenDoc(col,id,d){ d=d||{}; const nm=x=>S.mensajeros[x]?.nombre||"";
  switch(col){
    case "pedidos": return id+(d.clienteId?" ("+nombreCliente(d.clienteId)+")":"");
    case "clientes": case "mensajeros": return d.nombre||id;
    case "movimientos": return (MOVS[d.tipo]?.corto||"")+" "+pesos(d.valor)+" · "+nombreCliente(d.clienteId);
    case "recaudos": return pesos(d.valor)+" de "+nm(d.mensajeroId);
    case "liquidaciones": return nm(d.mensajeroId)+" · "+textoLiq(Number(d.debe)||0);
    case "cajamovs": return (CATS[d.cat]||"")+" "+pesos(d.valor)+(d.personaId?" · "+nm(d.personaId):"")+(d.concepto?" · "+d.concepto:"");
    case "jornadas": return nm(d.personaId)+" · "+d.dia+" · "+pesos(d.valor);
    case "vinculos": return nm(d.mensajeroId);
    default: return id; }
}
function fmtCampo(k,v){
  if(k==="clienteId") return nombreCliente(v)||"—"; if(k==="estado") return ESTADOS[v]||v; if(k==="metodo") return METODOS[v]?.t||(v==="devuelto"?"devolución":v||"—");
  if(k==="cambioRecibido") return v?"recibido "+hora(v):"pendiente"; if(k==="motivoDev") return MOTIVOS[v]||v; if(k==="cuentaJs") return CUENTAS_JS[v]||"—"; if(k==="tipo") return TIPOS[v]||MOVS[v]?.corto||v;
  if(typeof v==="boolean") return v?"sí":"no"; if(["valorServicio","valorCobrado","aCobrar","tarifa","gasto","domiPagoValor"].includes(k)) return pesos(v); if(k==="domiPagoMedio") return MEDIOS[v]||"—"; return String(v??"");
}
function logCambio(op,col,id,data,antes){
  if(NO_LOG.includes(col)) return;
  const nom=COL_NOM[col]||col;
  if(op==="borrar") return registrar("Eliminó "+nom+": "+resumenDoc(col,id,antes));
  if(op==="crear") return registrar("Creó "+nom+": "+resumenDoc(col,id,data));
  const d={...(antes||{}),...data};
  if(col==="pedidos"&&data.estado==="entregado") return registrar(`Entregó ${id}: cobró ${pesos(data.valorCobrado)} (${fmtCampo("metodo",data.metodo)}${data.cuentaJs?" a "+CUENTAS_JS[data.cuentaJs]:""})${data.difCobro?" · diferencia "+pesos(data.difCobro):""}${data.cambio?" · recibió un cambio":""}${data.gasto?" · gastó "+pesos(data.gasto)+(data.gastoNota?" ("+data.gastoNota+")":""):""}`);
  if(col==="pedidos"&&data.estado==="devuelto") return registrar(`Devolución de ${id}: ${MOTIVOS[data.motivoDev]||""}${data.notaDev?" · "+data.notaDev:""}`);
  if(col==="pedidos"&&data.intentos&&!data.estado){ const u=data.intentos[data.intentos.length-1]; return registrar(`Intento fallido en ${id}: ${MOTIVOS[u?.motivo]||""}${u?.nota?" · "+u.nota:""}`); }
  const det=Object.entries(data).filter(([k])=>CAMPOS[k]&&(!antes||antes[k]!==data[k])).map(([k,v])=>CAMPOS[k]+": "+fmtCampo(k,v)).join(", ");
  registrar("Editó "+nom+" "+resumenDoc(col,id,d)+(det?" ("+det+")":""));
}
async function guardar(col,id,data,unir){ const nuevo=!(S[col]&&S[col][id]); const antes=S[col]?.[id]; await rawSet(col,id,data,unir); logCambio(nuevo?"crear":"editar",col,id,data,antes); }
async function actualizar(col,id,data){ const antes=S[col]?.[id]?{...S[col][id]}:null; await rawUpd(col,id,data); logCambio("editar",col,id,data,antes); }
/* papelera: lo que se borra se puede recuperar */
const PAPELERA_COLS=["pedidos","clientes","movimientos","recaudos","liquidaciones","cajamovs","mensajeros"];
async function borrar(col,id,opt={}){
  const antes=S[col]?.[id]||null;
  if(!opt.sinPapelera){
    if(PAPELERA_COLS.includes(col)&&antes){ const pid=nuevoId(); await rawSet("papelera",pid,{id:pid,col,docId:id,data:antes,fecha:Date.now(),uid:uid||"",grupo:opt.grupo||pid}); }
    else if((col==="fotos"||col==="entregas")&&opt.grupo){ const d=await leer(col,id).catch(()=>null); if(d){ const pid=nuevoId(); await rawSet("papelera_fotos",pid,{id:pid,col,docId:id,data:d,grupo:opt.grupo}); } }
  }
  await rawDel(col,id); logCambio("borrar",col,id,null,antes);
}
/* cola sin señal: entregas y devoluciones esperan en el teléfono */
const COLA_K="js_cola";
function colaLeer(){ try{ return JSON.parse(lsGet(COLA_K)||"[]"); }catch(e){ return []; } }
function colaGuardar(c){ try{ localStorage.setItem(COLA_K,JSON.stringify(c)); return true; }catch(e){ return false; } }
const conTiempo=(pr,ms)=>Promise.race([pr,new Promise((_,r)=>setTimeout(()=>r(new Error("tiempo")),ms))]);
async function ejecutarOps(ops){ for(const o of ops){ await conTiempo(o.op==="set"?guardar(o.col,o.id,o.data,o.unir):actualizar(o.col,o.id,o.data),20000); } }
async function enviarOps(ops,guia){
  if(!db){ await ejecutarOps(ops); return "ok"; }
  try{ if(navigator.onLine===false) throw new Error("offline"); await ejecutarOps(ops); return "ok"; }
  catch(e){ const c=colaLeer().filter(x=>x.guia!==guia); c.push({guia,ops,t:Date.now()}); if(!colaGuardar(c)) throw e; pintar(); return "cola"; }
}
let enviandoCola=false;
async function procesarCola(manual){
  if(enviandoCola||!db) return; let c=colaLeer(); if(!c.length) return; enviandoCola=true; let n=0;
  try{ while(c.length){ await ejecutarOps(c[0].ops); c.shift(); colaGuardar(c); n++; } }
  catch(e){ if(manual) toast("Todavía sin señal. Se reintentará sola."); }
  finally{ enviandoCola=false; if(n){ toast(n===1?"Se envió 1 entrega guardada":"Se enviaron "+n+" entregas guardadas"); } pintar(); }
}
addEventListener("online",()=>procesarCola());
setInterval(()=>procesarCola(),30000);
async function leer(col,id){ if(db){ const s=await db.collection(col).doc(id).get(); return s.exists?s.data():null; } return memDocs[col+"/"+id]||null; }
const partes={}; // varias suscripciones filtradas a la misma colección se juntan en S[col]
function suscribir(col,filtro){ // filtro [campo,"==",valor]: solo los documentos propios (ver firestore.rules)
  const k=col+"|"+JSON.stringify(filtro||null);
  (filtro?db.collection(col).where(...filtro):db.collection(col)).onSnapshot(q=>{ const m={}; q.docs.forEach(d=>m[d.id]=d.data()); partes[k]=m;
    S[col]=Object.assign({},...Object.keys(partes).filter(x=>x.startsWith(col+"|")).map(x=>partes[x])); cargado=true; pintar(); },
    e=>{ console.warn(col,e); if(e.code==="permission-denied"){ toast("Se perdió el acceso a los datos"); } });
}
async function siguienteGuia(){
  if(!db){ memContador++; return memContador; }
  return db.siguienteContador();
}
const formatoGuia = n => "JS-" + String(n).padStart(5,"0");

/* ---------- cálculos ---------- */
const cerrado = p => p.estado==="entregado"||p.estado==="devuelto";
const servicio = p => p.estado==="devuelto"&&!p.cobrarDev ? 0 : (Number(p.valorServicio)||0);
const metodoTxt = p => p.estado==="devuelto" ? "Devolución"+(p.motivoDev?" ("+(MOTIVOS[p.motivoDev]||"").toLowerCase()+")":"") : (METODOS[p.metodo]?.t||"");
const MOTIVOS={no_contesta:"No contestan",direccion:"Dirección errada",rechazo:"Lo rechazaron",reprogramar:"Reprogramar (sigue en ruta)",otro:"Otro motivo"};
const CUENTAS_JS={nequi:"Nequi",bancolombia:"Bancolombia"};
/* Gasto: lo que el mensajero pagó de su plata en el envío (flete de bus, terminal); se le cobra al cliente. */
const gastoDe = p => Number(p.gasto)||0;
/* Pago del domicilio: lo que el cliente pagó aparte por este envío. Los pedidos marcados antes sin valor cubren el domicilio. */
const pagoDomi = p => !p.domiPagado ? 0 : p.domiPagoValor!=null&&p.domiPagoValor!=="" ? (Number(p.domiPagoValor)||0) : servicio(p);
const cargoEnvio = p => servicio(p)+gastoDe(p); // lo que el envío le cobra al cliente
function saldoPedido(p){ // saldo = cobrado - domicilio - gasto + pagado aparte. + cuenta por pagar al cliente, - cuenta por cobrar al cliente
  if(!cerrado(p)) return 0;
  const cob = p.metodo==="transf_cliente"||p.estado==="devuelto" ? 0 : (Number(p.valorCobrado)||0);
  return cob-cargoEnvio(p)+pagoDomi(p);
}
const textoDomi = p => (p.domiPagado?"pagó domicilio "+pesos(pagoDomi(p)):"domicilio "+pesos(servicio(p)))+(gastoDe(p)?" · flete "+pesos(gastoDe(p)):"");
const tipoCuenta = s => s>0 ? "Por pagar" : s<0 ? "Por cobrar" : "Paz y salvo";
const MOVS={
  cargo:{t:"Cargo al cliente (queda debiendo)", corto:"Cargo", s:-1},
  abono:{t:"Abono a favor del cliente", corto:"A favor", s:1},
  pago_a_cliente:{t:"JS le paga al cliente", corto:"Pago al cliente", s:-1, pago:true},
  pago_de_cliente:{t:"El cliente le paga a JS", corto:"Pago del cliente", s:1, pago:true},
  compra_cliente:{t:"Compra por encargo del cliente (sale de la caja)", corto:"Compra por encargo", s:-1, caja:true},
  ganancia:{t:"Ganancia ocasional de JS (se le carga al cliente)", corto:"Servicio adicional", s:-1}
};
const MOVS_OFICINA=["pago_de_cliente","pago_a_cliente","compra_cliente","ganancia"]; // lo que también registra el asistente
const signoMov = m => (MOVS[m.tipo]?.s||-1)*(Number(m.valor)||0);
const esPago = m => !!MOVS[m.tipo]?.pago;
const mueveCaja = m => esPago(m)||!!MOVS[m.tipo]?.caja; // pagos y compras por encargo entran o salen de la caja
const fechaDia = f => f===hoy() ? Date.now() : new Date(f+"T12:00:00").getTime();
const fechaLarga = d => new Date(d+"T12:00:00").toLocaleDateString("es-CO",{weekday:"long",day:"numeric",month:"long",year:"numeric"});
function saldoCliente(cid){
  let s=0;
  for(const p of Object.values(S.pedidos)) if(p.clienteId===cid) s+=saldoPedido(p);
  for(const m of Object.values(S.movimientos)) if(m.clienteId===cid) s+=signoMov(m);
  return s;
}
const nombreCliente = id => S.clientes[id]?.nombre || (id && Object.values(S.pedidos).find(p=>p.clienteId===id&&p.clienteNombre)?.clienteNombre) || "";
const listaOrdenada = (obj,campo,desc) => Object.values(obj).sort((a,b)=> desc ? (b[campo]||0)-(a[campo]||0) : String(a[campo]||"").localeCompare(String(b[campo]||""),"es"));

/* ---------- estado de interfaz ---------- */
let limiteA=100, subMas="panel";
let rol="mensajero", tabM="nuevo", tabA="inicio", filtroA="sin", buscarA="", diaCaja=hoy(), diaMiCaja=hoy();
let miMensajero = lsGet("js_mensajero") || "";
let ultimaGuia=null;
let fotoPara=""; // id en Personal de la oficina cuando la foto se toma desde Oficina → Pedidos

/* Filtro por día de los paneles de pedidos: un pedido es del día si salió o se entregó (o devolvió) ese día. "" = todos los días. */
let diaPedA="", diaPedC="", diaPedM="", mensPedA="", diaCliF=""; // diaCliF: filtro por día en Clientes // mensPedA: filtro por mensajero en Oficina → Pedidos
const delDia = (p,d) => !d || diaDe(p.creado)===d || (!!p.entregado && diaDe(p.entregado)===d);
function moverDia(d,n){ const x=new Date((d||hoy())+"T12:00:00"); x.setDate(x.getDate()+n); return diaDe(x.getTime()); }
const filtroDiaHtml = d => `<div class="filtro-dia"><button class="btn sec chico" data-dia="-1" aria-label="Día anterior">‹</button><input type="date" id="diaPed" value="${d}" max="${hoy()}" aria-label="Filtrar por día"><button class="btn sec chico" data-dia="1" aria-label="Día siguiente" ${!d||d>=hoy()?"disabled":""}>›</button>${d?`<button class="btn sec chico" data-dia="0">Ver todos</button>`:`<button class="btn sec chico" data-dia="hoy">Hoy</button>`}</div>`;
function enlazarFiltroDia(d,poner){
  const i=$("#diaPed"); if(!i) return;
  i.onchange=()=>{ poner(i.value); pintar(); };
  document.querySelectorAll("[data-dia]").forEach(b=>b.onclick=()=>{ const k=b.dataset.dia; poner(k==="0"?"":k==="hoy"?hoy():moverDia(d,Number(k))); pintar(); });
}

const iconCam='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 8h3l2-3h6l2 3h3a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1z"/><circle cx="12" cy="13.5" r="3.5"/></svg>';

/* ---------- navegación: menú lateral en computador, barra de abajo en el celular ---------- */
const ico = d => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
const ICONOS={
  inicio:ico('<rect x="3" y="3" width="7" height="9" rx="1.5"/><rect x="14" y="3" width="7" height="5" rx="1.5"/><rect x="14" y="12" width="7" height="9" rx="1.5"/><rect x="3" y="16" width="7" height="5" rx="1.5"/>'),
  pedidos:ico('<path d="M21 8l-9-5-9 5v8l9 5 9-5V8z"/><path d="M3 8l9 5 9-5M12 13v8"/>'),
  clientes:ico('<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c.6-3.5 3.3-5.5 6.5-5.5s5.9 2 6.5 5.5"/><path d="M16 4.6a3.5 3.5 0 0 1 0 6.8M18 14.8c2 .7 3.2 2.5 3.5 5.2"/>'),
  recibos:ico('<path d="M6 2.5h12v19l-3-2-3 2-3-2-3 2z"/><path d="M9 8h6M9 12h6M9 16h3"/>'),
  caja:ico('<path d="M3 7a2 2 0 0 1 2-2h13v2"/><rect x="3" y="7" width="18" height="13" rx="2"/><path d="M16 13.5h2"/>'),
  cuentas:ico('<path d="M3 10l9-6 9 6"/><path d="M5 10v8M9.5 10v8M14.5 10v8M19 10v8M3 21h18"/>'),
  sueldos:ico('<rect x="2.5" y="6" width="19" height="12" rx="2"/><circle cx="12" cy="12" r="2.5"/><path d="M6 9.5v5M18 9.5v5"/>'),
  mas:ico('<path d="M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12"/><circle cx="16" cy="6" r="2"/><circle cx="10" cy="12" r="2"/><circle cx="18" cy="18" r="2"/>'),
  menu:ico('<circle cx="5" cy="12" r="1.3" fill="currentColor"/><circle cx="12" cy="12" r="1.3" fill="currentColor"/><circle cx="19" cy="12" r="1.3" fill="currentColor"/>'),
  nuevo:ico('<path d="M4 8h3l2-3h6l2 3h3a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1z"/><circle cx="12" cy="13.5" r="3.5"/>'),
  pend:ico('<path d="M2 6h11v10H2zM13 9.5h4l4 3.5v3h-8"/><circle cx="6.5" cy="17.5" r="2"/><circle cx="17" cy="17.5" r="2"/>'),
  ruta:ico('<path d="M2 6h11v10H2zM13 9.5h4l4 3.5v3h-8"/><circle cx="6.5" cy="17.5" r="2"/><circle cx="17" cy="17.5" r="2"/>'),
  ok:ico('<circle cx="12" cy="12" r="9"/><path d="M8 12.5l2.5 2.5L16 9.5"/>'),
  dev:ico('<path d="M9 14L4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11"/>'),
  plata:ico('<circle cx="12" cy="12" r="9"/><path d="M14.5 9.2c-.5-.8-1.4-1.2-2.5-1.2-1.5 0-2.6.8-2.6 2s1.1 1.7 2.6 2 2.6.8 2.6 2-1.1 2-2.6 2c-1.1 0-2.1-.5-2.6-1.3M12 6.5V8M12 16v1.5"/>')
};
ICONOS.sueldo=ICONOS.sueldos; ICONOS.cuenta=ICONOS.caja;
/* items: [clave, nombre, número]. En el celular caben 5 abajo; si hay más, el quinto es "Menú" con el resto. */
function ponerNav(items,actual,elegir){
  const ir=k=>{ elegir(k); pintar(); scrollTo(0,0); };
  const btn=([k,t,n])=>`<button data-t="${k}" ${actual===k?'aria-current="page"':''}>${ICONOS[k]||ICONOS.mas}<span class="t">${t}</span>${n?`<span class="num">${n}</span>`:""}</button>`;
  $("#navLateral").innerHTML=items.map(btn).join("");
  const cabe=items.length<=5, vis=cabe?items:items.slice(0,4), resto=cabe?[]:items.slice(4);
  const enResto=resto.find(([k])=>k===actual), nResto=resto.reduce((a,[,,n])=>a+(n||0),0);
  $("#pestanas").innerHTML=vis.map(btn).join("")+(resto.length?`<button data-menu ${enResto?'aria-current="page"':''}>${enResto?ICONOS[enResto[0]]||ICONOS.menu:ICONOS.menu}<span class="t">${enResto?enResto[1]:"Menú"}</span>${nResto?`<span class="num">${nResto}</span>`:""}</button>`:"");
  document.querySelectorAll("#navLateral [data-t], #pestanas [data-t]").forEach(b=>b.onclick=()=>ir(b.dataset.t));
  const bm=$("#pestanas [data-menu]"); if(bm) bm.onclick=()=>{
    $("#dlgCont").innerHTML=`<header><h2>Menú</h2><button class="cerrar" data-cerrar aria-label="Cerrar">×</button></header>
      <div class="menu-grid">${items.map(([k,t,n])=>`<button data-ir="${k}" ${actual===k?'aria-current="page"':''}>${ICONOS[k]||ICONOS.mas}<span>${t}${n?` <span class="etq sin">${n}</span>`:""}</span></button>`).join("")}</div>`;
    $("#dlgCont").querySelectorAll("[data-ir]").forEach(b=>b.onclick=()=>{ cerrarDlg(); ir(b.dataset.ir); });
    abrirDlg(); };
}
function pintarSaludo(){
  const nom=(()=>{ try{ return usuario?.nombre?.()||""; }catch(e){ return ""; } })(), h=new Date().getHours();
  const corto=nom.includes("@")?nom.split("@")[0]:nom.split(" ")[0];
  $("#saludo").innerHTML=`<b>${h<12?"Buenos días":h<19?"Buenas tardes":"Buenas noches"}${corto?", "+esc(corto):""}</b><span>${fechaLarga(hoy())}</span>`;
  const av=$("#avatar"); av.textContent=nom?nom.replace(/@.*/,"").split(/\s+/).filter(Boolean).slice(0,2).map(x=>x[0]).join("").toUpperCase():""; av.classList.toggle("oculto",!nom);
}

function pintar(){
  pintarSaludo();
  document.querySelectorAll("#rol button").forEach(b=>b.setAttribute("aria-pressed", String(b.dataset.rol===rol)));
  $("#btnAdmin").classList.toggle("oculto", !esAdmin&&!esAsistente);
  $("#btnAdmin").textContent = esAdmin ? "Administración" : "Oficina";
  $("#rol").classList.toggle("oculto", esAsistente||esCliente); // asistente: solo Oficina; cliente: solo su vista
  const foco=document.activeElement&&document.activeElement.id&&$("#vista").contains(document.activeElement)?document.activeElement.id:null;
  if(esCliente) pintarCliente(); else if(rol==="mensajero") pintarMensajero(); else pintarAdmin();
  if(foco){ const el=document.getElementById(foco); if(el&&el!==document.activeElement) el.focus(); }
}

/* ======================= MENSAJERO ======================= */
function pendientesMios(){ const enCola=new Set(colaLeer().map(x=>x.guia)); return Object.values(S.pedidos).filter(p=>p.estado==="pendiente" && p.mensajeroId===miMensajero && !enCola.has(p.guia)).sort((a,b)=>a.creado-b.creado); }
/* vínculo entre la cuenta de cada persona y su nombre en Personal */
let actuarComo=false;
const vinculosDe = mid => Object.values(S.vinculos).filter(v=>v.mensajeroId===mid);
function aplicarVinculo(){
  if(!db||!uid||actuarComo) return;
  const v=S.vinculos[uid]; if(v&&S.mensajeros[v.mensajeroId]&&miMensajero!==v.mensajeroId){ miMensajero=v.mensajeroId; lsSet("js_mensajero",miMensajero); }
}
async function elegirMensajero(id){
  if(!id) return;
  if(db&&uid){
    const mio=S.vinculos[uid], libre=mio&&S.mensajeros[mio.mensajeroId]?false:true;
    const otro=vinculosDe(id).find(v=>v.uid!==uid);
    if(libre){
      if(otro&&!esAdmin){ toast("Ese nombre ya está vinculado a otra cuenta. Pídele al administrador que lo libere en Más → Personal."); pintar(); return; }
      if(!otro){ try{ await guardar("vinculos",uid,{uid,mensajeroId:id,fecha:Date.now()}); }catch(e){ toast("No se pudo vincular tu cuenta. Revisa la conexión."); pintar(); return; } }
      else actuarComo=true;
    } else if(!esAdmin){ pintar(); return; }
    else actuarComo = mio.mensajeroId!==id;
  }
  miMensajero=id; lsSet("js_mensajero",id); pintar();
}

function pintarMensajero(){
  const pend=pendientesMios().length;
  ponerNav([["nuevo","Nuevo"],["pend","Por entregar",pend],["caja","Mi caja"],["sueldo","Mi sueldo"]],tabM,k=>tabM=k);

  const mens=listaOrdenada(S.mensajeros,"nombre").filter(esRepartidor);
  const selector=`<div class="campo"><label for="selMens">¿Quién eres?</label>
    <select id="selMens"><option value="">Elige tu nombre…</option>${mens.map(m=>`<option value="${esc(m.id)}" ${m.id===miMensajero?"selected":""}>${esc(m.nombre)}</option>`).join("")}</select></div>`;
  aplicarVinculo();
  const vinc=db&&uid&&S.vinculos[uid]&&S.mensajeros[S.vinculos[uid].mensajeroId];
  const puedeCambiar=!vinc||esAdmin;
  const cola=colaLeer();
  const avisoCola=cola.length?`<div class="aviso alerta"><b>${cola.length===1?"1 entrega guardada":cola.length+" entregas guardadas"} en este teléfono</b>, esperando señal (${cola.map(x=>esc(x.guia)).join(", ")}). Se envían solas cuando vuelva la conexión.<br><button class="btn chico" id="colaRe">Reintentar ahora</button></div>`:"";
  let h="";
  if(!mens.length && (esAdmin||!db)){
    h=`<h1>Hola</h1><div class="vacio">${cargado||!db?"Todavía no hay mensajeros registrados. El administrador los crea en Administración → Más → Personal.":"Cargando…"}</div>`;
  } else if(!S.mensajeros[miMensajero] && db && uid && !esAdmin){
    h=`<h1>Hola</h1><div class="vacio">Tu cuenta todavía no está vinculada a tu nombre. Pídele al administrador que la vincule en Más → Personal → Accesos a la app.</div>`;
  } else if(!S.mensajeros[miMensajero]){
    h=`<h1>Hola</h1><p class="sub">${db&&uid?"Elige tu nombre una sola vez. Quedará vinculado a tu cuenta y solo el administrador lo puede cambiar.":"Elige tu nombre una sola vez; este teléfono lo recordará."}</p>${selector}`;
  } else if(tabM==="nuevo"){
    const yo=S.mensajeros[miMensajero];
    h=`<h1>Salida de pedidos</h1><p class="sub">${esc(yo.nombre)}${puedeCambiar?` · <a href="#" id="cambiarYo">${actuarComo?"volver a mi nombre":"cambiar"}</a>`:""}</p>
      <button class="camara" id="btnFoto">${iconCam}Tomar foto del pedido<small>Se le asigna número de guía y pasa a “Por entregar”</small></button>
      <button class="btn sec" id="btnGaleria" style="width:100%;margin-top:10px">Subir fotos de la galería (puedes elegir varias)</button>
      ${ultimaGuia?`<div class="recien"><div><div class="guia">${esc(ultimaGuia)}</div><span>Guardado en por entregar. Escribe ${ultimaGuia.includes(" a ")?"cada número en su paquete":"este número en el paquete"}.</span></div></div>`:""}`;
  } else if(tabM==="pend"){
    const ps=pendientesMios().filter(p=>delDia(p,diaPedM));
    h=`<h1>Por entregar</h1><p class="sub">${ps.length} pedido${ps.length===1?"":"s"} en ruta${diaPedM?" que salieron ese día":""}</p>${filtroDiaHtml(diaPedM)}`+
      (ps.length?`<div class="lista">${ps.map(p=>`<button class="fila" data-entregar="${esc(p.guia)}">
        ${fotoSegura(p.mini)?`<img src="${fotoSegura(p.mini)}" alt="">`:'<span class="sinfoto"></span>'}
        <span class="info"><span class="guia">${esc(p.guia)}</span>${Number(p.aCobrar)?` <b>Cobrar ${pesos(p.aCobrar)}</b>`:""}${(p.intentos||[]).length?` <span class="etq sin">${p.intentos.length} intento${p.intentos.length===1?"":"s"}</span>`:""}<p>${esc(nombreCliente(p.clienteId)||"Remitente sin asignar")} · salió ${hora(p.creado)}</p></span>
        <span class="btn chico ok">Entregar</span></button>`).join("")}</div>`
      :`<div class="vacio">${diaPedM?"No tienes pedidos pendientes de ese día.":"No tienes pedidos pendientes. Toma la foto en “Nuevo pedido” al salir."}</div>`);
  } else if(tabM==="sueldo"){
    h=miSueldoHtml(miMensajero);
  } else {
    const pm=periodoMensajero(miMensajero), t=totales(pm.ps), ul=pm.ul;
    h=`<h1>Mi caja</h1><p class="sub">Período actual: ${ul?"desde la liquidación del "+hora(ul.fecha):"desde el inicio"} hasta ahora.</p>
      <div class="cifras">
        <div class="cifra fuerte"><span>Te falta entregar</span><b>${pesos(pm.debe)}</b></div>
        <div class="cifra"><span>Sueldo del período</span><b>${sueldoTexto(miMensajero,pm.ps)}</b></div>
        <div class="cifra"><span>Efectivo cobrado</span><b>${pesos(t.efectivo)}</b></div>
        ${pm.base?`<div class="cifra"><span>Base para vueltos</span><b>${pesos(pm.base)}</b></div>`:""}
        ${pm.gastos?`<div class="cifra"><span>Fletes / gastos que pagaste</span><b>− ${pesos(pm.gastos)}</b></div>`:""}
        <div class="cifra"><span>Ya entregaste</span><b>${pesos(pm.recibido)}</b></div>
        ${pm.anterior?`<div class="cifra"><span>Pendiente de la liquidación anterior</span><b>${pesos(pm.anterior)}</b></div>`:""}
        ${pm.ajuste?`<div class="cifra"><span>Correcciones a liquidaciones cerradas</span><b>${ajusteTxt(pm.ajuste)}</b></div>`:""}
        <div class="cifra"><span>Transferencias a JS</span><b>${pesos(t.transfJs)}</b></div>
        <div class="cifra"><span>Pagado directo al cliente</span><b>${pesos(t.transfCli)}</b></div>
        <div class="cifra"><span>Entregas</span><b>${pm.ps.length}</b></div>
      </div>
      ${ul?`<p class="sub" style="margin-top:12px">Última liquidación (${hora(ul.fecha)}): ${textoLiq(ul.debe).toLowerCase()}.</p>`:""}
      ${pm.recs.length?`<h2>Dinero que entregaste</h2><div class="tabla-env"><table><thead><tr><th>Hora</th><th>Medio</th><th class="n">Valor</th></tr></thead><tbody>${pm.recs.map(r=>`<tr><td>${hora(r.fecha)}</td><td>${MEDIOS[r.medio]||""}</td><td class="n">${pesos(r.valor)}</td></tr>`).join("")}</tbody></table></div>`:""}
      <h2>Entregas del período</h2>${tablaEntregas(pm.ps,false)}`;
  }
  $("#vista").innerHTML=avisoCola+h;
  const cr=$("#colaRe"); if(cr) cr.onclick=()=>procesarCola(true);
  const sm=$("#selMens"); if(sm) sm.onchange=()=>elegirMensajero(sm.value);
  const cy=$("#cambiarYo"); if(cy) cy.onclick=e=>{e.preventDefault(); if(actuarComo){ actuarComo=false; aplicarVinculo(); pintar(); return; } if(vinc&&esAdmin) actuarComo=true; miMensajero=""; pintar();};
  const bf=$("#btnFoto"); if(bf) bf.onclick=()=>{fotoPara=""; $("#inCamara").value=""; $("#inCamara").click();};
  const bg=$("#btnGaleria"); if(bg) bg.onclick=()=>{fotoPara=""; $("#inGaleria").value=""; $("#inGaleria").click();};
  document.querySelectorAll("[data-entregar]").forEach(b=>b.onclick=()=>abrirEntrega(b.dataset.entregar));
  if(tabM==="pend") enlazarFiltroDia(diaPedM,d=>diaPedM=d);
  const sa=$("#msAnt"), ss=$("#msSig"), sh=$("#msHoy");
  if(sa) sa.onclick=()=>{semM=moverSemana(semM,-1); pintar();};
  if(ss) ss.onclick=()=>{semM=moverSemana(semM,1); pintar();};
  if(sh) sh.onclick=()=>{semM=semanaDe(hoy()); pintar();};
}

/* Crear guías: una por foto. La cámara toma una; "Subir fotos" permite elegir varias de la galería. */
const MAX_FOTOS=30;
async function crearGuias(files){
  files=[...files].filter(f=>f.type.startsWith("image/")); if(!files.length) return;
  if(files.length>MAX_FOTOS){ toast("Máximo "+MAX_FOTOS+" fotos a la vez"); files=files.slice(0,MAX_FOTOS); }
  const mid=fotoPara||miMensajero, desdeOficina=!!fotoPara; fotoPara="";
  document.querySelectorAll("#btnFoto,#btnGaleria,#fotoOfi,#galeriaOfi").forEach(b=>b.disabled=true);
  const hechas=[];
  try{
    for(const f of files){
      if(files.length>1) toast("Creando guía "+(hechas.length+1)+" de "+files.length+"…");
      const [foto,mini]=await Promise.all([comprimir(f,FOTO_PX,FOTO_Q), comprimir(f,140,.6)]);
      const armar=n=>{ const guia=formatoGuia(n); return {guia,foto,pedido:{guia,n,estado:"pendiente",creado:Date.now(),mensajeroId:mid,mini,clienteId:"",valorServicio:0,aCobrar:0,por:uid||""}}; };
      let guia;
      if(db){ let armado; guia=await db.crearPedido(n=>armado=armar(n)); logCambio("crear","pedidos",guia,armado.pedido,null); }
      else { const x=armar(await siguienteGuia()); guia=x.guia; await guardar("fotos",guia,{salida:foto}); await guardar("pedidos",guia,x.pedido); }
      hechas.push(guia);
    }
  }catch(err){ console.error(err); toast((hechas.length?"Se crearon "+hechas.length+" guías, pero falló la siguiente. ":"")+(navigator.onLine===false?"Sin señal: la guía necesita conexión para darle número.":"No se pudo guardar el pedido. Revisa la conexión e intenta de nuevo.")); }
  if(hechas.length){
    toast(hechas.length===1?"Guía "+hechas[0]+" creada":"Se crearon "+hechas.length+" guías");
    if(desdeOficina&&hechas.length===1){ pintar(); const g=hechas[0]; for(let i=0;i<20&&!S.pedidos[g];i++) await sleep(250); abrirPedido(g); return; } // la guía llega por la suscripción un instante después
    ultimaGuia=hechas.length===1?hechas[0]:hechas[0]+" a "+hechas[hechas.length-1];
  }
  pintar();
}
/* Si el navegador trae una página guardada de una versión anterior, se crea lo que falte en vez de detener la app. */
if(!$("#inGaleria")){ const g=document.createElement("input"); Object.assign(g,{type:"file",id:"inGaleria",accept:"image/*",multiple:true,className:"oculto"}); document.body.appendChild(g); }
["#inCamara","#inGaleria"].forEach(sel=>$(sel).addEventListener("change",e=>crearGuias(e.target.files)));

function abrirEntrega(guia){
  const p=S.pedidos[guia]; if(!p) return;
  const aC=Number(p.aCobrar)||0, ints=p.intentos||[];
  const c=$("#dlgCont");
  c.innerHTML=`<header><div><h2>Entregar <span class="guia">${esc(guia)}</span></h2><span class="sub">${esc(nombreCliente(p.clienteId)||"Remitente sin asignar")}</span></div><button class="cerrar" data-cerrar aria-label="Cerrar">×</button></header>
  <div class="foto-pedido" id="eFotoPed">${fotoSegura(p.mini)?`<img src="${fotoSegura(p.mini)}" alt="Foto del pedido" data-ampliar>`:'<span class="sub">Cargando foto del pedido…</span>'}</div>
  ${aC?`<div class="cobrar-box"><span>Valor a cobrar</span><b>${pesos(aC)}</b></div>`:""}
  ${ints.length?`<div class="aviso">Intentos anteriores: ${ints.map(i=>hora(i.fecha)+" · "+esc(MOTIVOS[i.motivo]||"")+(i.nota?" ("+esc(i.nota)+")":"")).join("; ")}</div>`:""}
  <div class="campo"><label for="eNom">Nombre de quien recibe</label><input id="eNom" autocomplete="off"></div>
  <div class="campo"><span class="lbl">Firma</span><div class="firma-caja"><canvas id="firma"></canvas><button class="btn sec chico" id="limpiar" type="button">Borrar</button></div></div>
  <div class="campo"><span class="lbl">Foto de entrega</span>
    <div class="foto-elegida"><img id="eFotoPrev" class="oculto" alt=""><button class="btn sec" id="eFotoBtn" type="button">${iconCam.replace('<svg','<svg width="22" height="22"')} Tomar foto</button><button class="btn sec" id="eFotoGalBtn" type="button">Desde galería</button></div>
    <input type="file" id="eFoto" accept="image/*" capture="environment" class="oculto"><input type="file" id="eFotoGal" accept="image/*" class="oculto"></div>
  <div class="campo"><label for="eValor">Valor cobrado</label><input id="eValor" type="number" inputmode="numeric" min="0" step="100" placeholder="0" value="${aC||""}"></div>
  <div class="campo"><span class="lbl">Método de pago</span><div class="metodos">
    ${Object.entries(METODOS).map(([k,v],i)=>`<label><input type="radio" name="metodo" value="${k}" ${i===0?"checked":""}><span>${v.t}<small>${v.d}</small></span></label>`).join("")}
  </div></div>
  <div class="campo oculto" id="eCtaC"><label for="eCta">¿A qué cuenta de JS llegó la transferencia?</label><select id="eCta"><option value="">Elige…</option>${Object.entries(CUENTAS_JS).map(([k,t])=>`<option value="${k}">${t}</option>`).join("")}</select></div>
  <div id="eDif"></div>
  <div class="linea2"><div class="campo"><label for="eGasto">Gasté en este envío (flete, bus…)</label><input id="eGasto" type="number" inputmode="numeric" min="0" step="1000" placeholder="0"></div>
  <div class="campo"><label for="eGastoNota">Detalle del gasto (opcional)</label><input id="eGastoNota" placeholder="Ej: bus a Popayán"></div></div>
  <label class="check"><input type="checkbox" id="eCambio"> Recibí un cambio (prenda de vuelta para el remitente)</label>
  <button class="btn ok" id="eGuardar" style="width:100%">Confirmar entrega</button>
  <button class="btn peligro" id="eNoEnt" style="width:100%;margin-top:10px">No se pudo entregar</button>`;
  abrirDlg();
  const firma=prepararFirma($("#firma")); $("#limpiar").onclick=firma.limpiar;
  let fotoEnt=null, aceptoDif=false;
  const reset=()=>{ aceptoDif=false; $("#eDif").innerHTML=""; $("#eGuardar").textContent="Confirmar entrega"; };
  const metodo=()=>document.querySelector('input[name="metodo"]:checked').value;
  document.querySelectorAll('input[name="metodo"]').forEach(r=>r.onchange=()=>{ $("#eCtaC").classList.toggle("oculto",metodo()!=="transf_js"); if(metodo()==="transf_cliente") $("#eValor").value="0"; else if(aC&&$("#eValor").value==="0") $("#eValor").value=aC; reset(); });
  $("#eValor").oninput=reset;
  $("#eNoEnt").onclick=()=>abrirDevolucion(guia);
  leer("fotos",guia).then(f=>{ const x=fotoSegura(f?.salida), box=$("#eFotoPed"); if(!box) return;
    if(x) box.innerHTML=`<img src="${x}" alt="Foto del pedido" data-ampliar><span class="sub">Toca la foto para verla completa</span>`; else if(!fotoSegura(p.mini)) box.innerHTML='<span class="sub">Sin foto del pedido.</span>'; }).catch(()=>{});
  $("#eFotoBtn").onclick=()=>$("#eFoto").click(); $("#eFotoGalBtn").onclick=()=>$("#eFotoGal").click();
  $("#eFoto").onchange=$("#eFotoGal").onchange=async ev=>{ const f=ev.target.files[0]; if(!f) return; fotoEnt=await comprimir(f,FOTO_PX,FOTO_Q); const im=$("#eFotoPrev"); im.src=fotoEnt; im.classList.remove("oculto"); $("#eFotoBtn").lastChild.textContent=" Cambiar foto"; };
  $("#eGuardar").onclick=async()=>{
    const nom=$("#eNom").value.trim(), val=$("#eValor").value, met=metodo(), cta=met==="transf_js"?$("#eCta").value:"";
    if(!nom) return toast("Escribe el nombre de quien recibe");
    if(firma.vacia()) return toast("Falta la firma");
    if(!fotoEnt) return toast("Falta la foto de entrega");
    if(val===""||Number(val)<0) return toast("Escribe el valor cobrado (0 si no cobró)");
    if(met==="transf_js"&&!cta) return toast("Elige a qué cuenta llegó la transferencia");
    const gasto=Number($("#eGasto").value)||0, gastoNota=$("#eGastoNota").value.trim(); if(gasto<0) return toast("El gasto no puede ser negativo");
    const v=Number(val), esperado=met==="transf_cliente"?0:aC, dif=aC?v-esperado:0;
    if(dif&&!aceptoDif){ aceptoDif=true; $("#eDif").innerHTML=`<div class="aviso alerta">Debías cobrar <b>${pesos(esperado)}</b> y escribiste <b>${pesos(v)}</b> (${dif>0?"sobran":"faltan"} ${pesos(Math.abs(dif))}). Revisa el valor. Si está bien, toca otra vez el botón.</div>`; $("#eGuardar").textContent="Sí, guardar con diferencia"; return; }
    const b=$("#eGuardar"); b.disabled=true; b.textContent="Guardando…";
    try{
      const r=await enviarOps([{op:"set",col:"entregas",id:guia,data:{foto:fotoEnt,firma:firma.imagen()},unir:true},
        {op:"upd",col:"pedidos",id:guia,data:{estado:"entregado",entregado:Date.now(),destinatario:nom,valorCobrado:v,metodo:met,cuentaJs:cta,difCobro:dif,entregoUid:uid||"",...($("#eCambio").checked?{cambio:true}:{}),...(gasto>0?{gasto,gastoNota}:{})}}],guia);
      cerrarDlg(); toast(r==="ok"?"Entrega de "+guia+" registrada":"Sin señal: la entrega quedó guardada en el teléfono y se enviará sola");
    }catch(err){ console.error(err); b.disabled=false; b.textContent="Confirmar entrega"; toast("No se pudo guardar. Intenta de nuevo."); }
  };
}

function abrirDevolucion(guia){
  const p=S.pedidos[guia]; if(!p) return;
  $("#dlgCont").innerHTML=`<header><div><h2>No se pudo entregar <span class="guia">${esc(guia)}</span></h2><span class="sub">${esc(nombreCliente(p.clienteId)||"Remitente sin asignar")}</span></div><button class="cerrar" data-cerrar aria-label="Cerrar">×</button></header>
    <div class="campo"><span class="lbl">¿Qué pasó?</span><div class="metodos">${Object.entries(MOTIVOS).map(([k,t],i)=>`<label><input type="radio" name="motivo" value="${k}" ${i===0?"checked":""}><span>${t}${k==="reprogramar"?"<small>El pedido sigue en tu lista para intentarlo después</small>":k==="otro"?"":"<small>El paquete vuelve al remitente</small>"}</span></label>`).join("")}</div></div>
    <div class="campo"><label for="dNota">Detalle (opcional)</label><input id="dNota" placeholder="Ej: llamé 3 veces, el portero no lo recibió"></div>
    <div class="campo"><span class="lbl">Foto de evidencia (opcional)</span><div class="foto-elegida"><img id="dFotoPrev" class="oculto" alt=""><button class="btn sec" id="dFotoBtn" type="button">${iconCam.replace('<svg','<svg width="22" height="22"')} Tomar foto</button><button class="btn sec" id="dFotoGalBtn" type="button">Desde galería</button></div>
    <input type="file" id="dFoto" accept="image/*" capture="environment" class="oculto"><input type="file" id="dFotoGal" accept="image/*" class="oculto"></div>
    <button class="btn" id="dGuardar" style="width:100%">Registrar</button>
    <button class="btn sec" id="dVolver" style="width:100%;margin-top:10px">Volver a la entrega</button>`;
  abrirDlg();
  let foto=null;
  $("#dVolver").onclick=()=>abrirEntrega(guia);
  $("#dFotoBtn").onclick=()=>$("#dFoto").click(); $("#dFotoGalBtn").onclick=()=>$("#dFotoGal").click();
  $("#dFoto").onchange=$("#dFotoGal").onchange=async ev=>{ const f=ev.target.files[0]; if(!f) return; foto=await comprimir(f,FOTO_PX,FOTO_Q); const im=$("#dFotoPrev"); im.src=foto; im.classList.remove("oculto"); };
  $("#dGuardar").onclick=async()=>{
    const motivo=document.querySelector('input[name="motivo"]:checked').value, nota=$("#dNota").value.trim();
    if(motivo==="otro"&&!nota) return toast("Escribe qué pasó");
    const intentos=[...(p.intentos||[]),{fecha:Date.now(),motivo,nota,uid:uid||""}];
    const ops = motivo==="reprogramar" ? [{op:"upd",col:"pedidos",id:guia,data:{intentos}}]
      : [...(foto?[{op:"set",col:"entregas",id:guia,data:{foto,firma:""},unir:true}]:[]),{op:"upd",col:"pedidos",id:guia,data:{estado:"devuelto",entregado:Date.now(),motivoDev:motivo,notaDev:nota,valorCobrado:0,metodo:"devuelto",cuentaJs:"",difCobro:0,destinatario:"",cobrarDev:true,intentos}}];
    const b=$("#dGuardar"); b.disabled=true; b.textContent="Guardando…";
    try{ const r=await enviarOps(ops,guia); cerrarDlg();
      toast(r!=="ok"?"Sin señal: quedó guardado en el teléfono y se enviará solo":motivo==="reprogramar"?"Intento registrado. "+guia+" sigue en tu lista":"Devolución de "+guia+" registrada"); }
    catch(e){ b.disabled=false; b.textContent="Registrar"; toast("No se pudo guardar. Intenta de nuevo."); }
  };
}

function prepararFirma(cv){
  const r=cv.getBoundingClientRect(), dpr=Math.min(2,window.devicePixelRatio||1);
  cv.width=r.width*dpr; cv.height=r.height*dpr;
  const x=cv.getContext("2d"); x.scale(dpr,dpr); x.lineWidth=2.4; x.lineCap="round"; x.lineJoin="round"; x.strokeStyle="#042A3A";
  let dib=false, trazos=0, ant=null;
  const pt=e=>{const b=cv.getBoundingClientRect(); return {x:e.clientX-b.left,y:e.clientY-b.top};};
  cv.onpointerdown=e=>{dib=true; ant=pt(e); cv.setPointerCapture(e.pointerId); trazos++;};
  cv.onpointermove=e=>{ if(!dib) return; const p=pt(e); x.beginPath(); x.moveTo(ant.x,ant.y); x.lineTo(p.x,p.y); x.stroke(); ant=p; };
  cv.onpointerup=cv.onpointercancel=()=>{dib=false;};
  return {
    limpiar:()=>{x.clearRect(0,0,cv.width,cv.height); trazos=0;},
    vacia:()=>trazos===0,
    imagen:()=>{ const c=document.createElement("canvas"); c.width=480; c.height=Math.round(480*cv.height/cv.width); const y=c.getContext("2d"); y.fillStyle="#fff"; y.fillRect(0,0,c.width,c.height); y.drawImage(cv,0,0,c.width,c.height); return c.toDataURL("image/jpeg",.7); }
  };
}

/* ======================= ADMIN ======================= */
function totales(ps){
  const t={efectivo:0,transfJs:0,transfCli:0,servicio:0};
  for(const p of ps){ const v=Number(p.valorCobrado)||0;
    if(p.metodo==="efectivo") t.efectivo+=v; else if(p.metodo==="transf_js") t.transfJs+=v; else t.transfCli+=v;
    t.servicio+=servicio(p); }
  return t;
}
function tablaEntregas(ps,conCliente){
  if(!ps.length) return `<div class="vacio">No hay entregas.</div>`;
  const conGasto=ps.some(p=>gastoDe(p)), suma=f=>ps.reduce((a,p)=>a+f(p),0);
  return `<div class="tabla-env"><table><thead><tr><th>Guía</th>${conCliente?"<th>Remitente</th>":""}<th>Recibió</th><th>Método</th><th class="n">Servicio</th>${conGasto?'<th class="n">Flete</th>':""}<th class="n">Cobrado</th></tr></thead><tbody>
  ${ps.sort((a,b)=>a.entregado-b.entregado).map(p=>`<tr><td class="guia">${esc(p.guia)}</td>${conCliente?`<td>${esc(nombreCliente(p.clienteId)||"—")}</td>`:""}<td>${esc(p.destinatario)}</td><td>${metodoTxt(p)}</td><td class="n">${pesos(servicio(p))}</td>${conGasto?`<td class="n">${gastoDe(p)?pesos(gastoDe(p)):"—"}</td>`:""}<td class="n">${pesos(p.valorCobrado)}</td></tr>`).join("")}
  <tr><td colspan="${conCliente?4:3}"><b>Total</b></td><td class="n"><b>${pesos(suma(servicio))}</b></td>${conGasto?`<td class="n"><b>${pesos(suma(gastoDe))}</b></td>`:""}<td class="n"><b>${pesos(suma(p=>Number(p.valorCobrado)||0))}</b></td></tr>
  </tbody></table></div>`;
}

function pintarAdmin(){
  const sin=Object.values(S.pedidos).filter(p=>!p.clienteId).length;
  const tabs=[["inicio","Inicio"],["pedidos","Pedidos",sin],["clientes","Clientes"],["caja","Caja"],["recibos","Recibos"],["cuentas","Cuentas"],["sueldos","Sueldos"],["mas","Más"]].filter(([k])=>esAdmin||["inicio","pedidos","clientes","recibos","caja","cuentas"].includes(k));
  if(!tabs.some(([k])=>k===tabA)) tabA="inicio";
  ponerNav(tabs,tabA,k=>tabA=k);
  const v=$("#vista");
  const aviso = db ? "" : `<div class="aviso">Modo de prueba: los datos se borran al cerrar. Configura Firebase (ver LEEME.md) para que todo quede guardado y compartido entre mensajeros y administración.</div>`;

  if(tabA==="inicio"){ pintarInicioEmpresa(v,aviso); }
  else if(tabA==="pedidos"){
    let ps=Object.values(S.pedidos).sort((a,b)=>b.creado-a.creado);
    if(filtroA==="sin") ps=ps.filter(p=>!p.clienteId);
    else if(filtroA==="pend") ps=ps.filter(p=>p.estado==="pendiente");
    else if(filtroA==="ent") ps=ps.filter(p=>p.estado==="entregado");
    else if(filtroA==="dev") ps=ps.filter(p=>p.estado==="devuelto");
    else if(filtroA==="dif") ps=ps.filter(p=>Number(p.difCobro));
    else if(filtroA==="cambio") ps=ps.filter(cambioPendiente);
    else if(filtroA==="serv") ps=ps.filter(sinServicio);
    if(buscarA) ps=ps.filter(p=>(p.guia+" "+nombreCliente(p.clienteId)+" "+(p.destinatario||"")+" "+(S.mensajeros[p.mensajeroId]?.nombre||"")).toLowerCase().includes(buscarA.toLowerCase()));
    if(mensPedA) ps=ps.filter(p=>p.mensajeroId===mensPedA);
    if(diaPedA) ps=ps.filter(p=>delDia(p,diaPedA));
    const porEntregar=Object.values(S.pedidos).filter(p=>p.estado==="pendiente"&&(!mensPedA||p.mensajeroId===mensPedA)).length; // sigue al mensajero elegido
    const repartidores=listaOrdenada(S.mensajeros,"nombre").filter(m=>esRepartidor(m)||m.id===mensPedA);
    const ofis=listaOrdenada(S.mensajeros,"nombre").filter(m=>tipoDe(m)==="oficina");
    const fotoOfi=ofis.length?`<div class="acciones" style="margin:0 0 14px;align-items:center"><button class="btn" id="fotoOfi">${iconCam.replace('<svg','<svg width="22" height="22"')}<span>Tomar foto del pedido</span></button><button class="btn sec" id="galeriaOfi">Subir fotos (varias)</button>${ofis.length>1?`<select id="ofiSel" aria-label="Oficina encargada">${ofis.map(m=>`<option value="${esc(m.id)}">${esc(m.nombre)}</option>`).join("")}</select>`:""}<span class="sub">Queda a cargo de ${ofis.length>1?"la oficina elegida":esc(ofis[0].nombre)}; el domicilio es 100% de JS.</span></div>`
      :`<div class="aviso">${esAdmin?"Para registrar pedidos con foto desde aquí, agrega en Más → Personal una persona de tipo “Oficina (JS)”.":"Para registrar pedidos con foto, el administrador debe crear la Oficina en Personal."}</div>`;
    v.innerHTML=aviso+`<h1>Pedidos</h1><p class="sub">Asigna el remitente, el valor del servicio y el valor a cobrar a cada guía.</p>${fotoOfi}
      ${(()=>{ const n=Object.values(S.pedidos).filter(cambioPendiente).length; return n&&filtroA!=="cambio"?`<div class="aviso">${n===1?"Hay 1 prenda de cambio":"Hay "+n+" prendas de cambio"} por entregar a los clientes. Míralas en “Cambios por entregar”.</div>`:""; })()}
      ${(()=>{ const n=Object.values(S.pedidos).filter(sinServicio).length; return n&&filtroA!=="serv"?`<div class="aviso alerta">${n===1?"1 pedido entregado no tiene":n+" pedidos entregados no tienen"} valor de servicio: el saldo del cliente queda mal hasta que lo pongas. <button class="btn chico" data-f="serv">Verlos</button></div>`:filtroA==="serv"?`<div class="aviso">Mostrando los pedidos entregados sin valor de servicio. Ábrelos y ponles el domicilio.</div>`:""; })()}
      ${(()=>{ const n=Object.values(S.pedidos).filter(p=>Number(p.difCobro)&&!p.difRevisada).length; return n?`<div class="aviso alerta">${n===1?"1 entrega tiene":n+" entregas tienen"} un valor cobrado distinto al que debían cobrar. Revísalas en “Con diferencia”.</div>`:""; })()}
      <div class="filtros">${[["sin","Sin remitente"],["pend","Por entregar",porEntregar],["ent","Entregados"],["dev","Devueltos"],["dif","Con diferencia"],["cambio","Cambios por entregar"],["todos","Todos"]].map(([k,t,n])=>`<button data-f="${k}" aria-pressed="${filtroA===k}">${t}${n!==undefined?` <span class="num">${n}</span>`:""}</button>`).join("")}</div>
      <div class="linea2"><div class="campo" style="flex:2;min-width:220px"><input id="buscar" type="search" placeholder="Buscar guía, remitente, destinatario o mensajero" value="${esc(buscarA)}" aria-label="Buscar"></div>
      <div class="campo"><select id="mensPed" aria-label="Filtrar por mensajero"><option value="">Todos los mensajeros</option>${repartidores.map(m=>`<option value="${esc(m.id)}" ${m.id===mensPedA?"selected":""}>${esc(m.nombre)}</option>`).join("")}</select></div></div>
      ${filtroDiaHtml(diaPedA)}${diaPedA||mensPedA?`<p class="sub">${ps.length} pedido${ps.length===1?"":"s"}${mensPedA?" de "+esc(S.mensajeros[mensPedA]?.nombre||""):""}${diaPedA?" que salieron o se cerraron ese día":""}</p>`:""}
      ${ps.length?`<div class="lista">${ps.slice(0,limiteA).map(p=>filaPedido(p)).join("")}</div>${ps.length>limiteA?`<div class="acciones" style="justify-content:center"><button class="btn sec" id="masPed">Ver más (${ps.length-limiteA} restantes)</button></div>`:""}`:`<div class="vacio">${filtroA==="sin"?"Todos los pedidos tienen remitente asignado.":filtroA==="serv"?"Todos los pedidos entregados tienen valor de servicio.":"No hay pedidos aquí."}</div>`}`;
    v.querySelectorAll("[data-f]").forEach(b=>b.onclick=()=>{filtroA=b.dataset.f; limiteA=100; pintar();});
    const mp=$("#masPed"); if(mp) mp.onclick=()=>{limiteA+=200; pintar();};
    const bu=$("#buscar"); bu.oninput=()=>{buscarA=bu.value; clearTimeout(bu._t); bu._t=setTimeout(()=>{pintar(); const n=$("#buscar"); n.focus(); n.setSelectionRange(n.value.length,n.value.length);},300);};
    v.querySelectorAll("[data-ped]").forEach(b=>b.onclick=()=>abrirPedido(b.dataset.ped));
    enlazarFiltroDia(diaPedA,d=>{diaPedA=d; limiteA=100;});
    $("#mensPed").onchange=e=>{mensPedA=e.target.value; limiteA=100; pintar();};
    const fo=$("#fotoOfi"); if(fo) fo.onclick=()=>{ fotoPara=$("#ofiSel")?.value||ofis[0].id; $("#inCamara").value=""; $("#inCamara").click(); };
    const go=$("#galeriaOfi"); if(go) go.onclick=()=>{ fotoPara=$("#ofiSel")?.value||ofis[0].id; $("#inGaleria").value=""; $("#inGaleria").click(); };
  }
  else if(tabA==="clientes"){
    // Con un día elegido, cada cliente se mide por lo que se movió ese día (pedidos cerrados, pagos y ajustes)
    const cs=listaOrdenada(S.clientes,"nombre").map(c=>({...c,s:saldoCliente(c.id),d:diaCliF?filasCuenta(c.id).filter(r=>diaDe(r.fecha)===diaCliF).reduce((a,r)=>a+r.v,0):0}));
    const k=c=>diaCliF?c.d:c.s;
    const cobrar=cs.filter(c=>k(c)<0), pagar=cs.filter(c=>k(c)>0);
    const totC=cobrar.reduce((a,c)=>a-k(c),0), totP=pagar.reduce((a,c)=>a+k(c),0);
    const vis = filtroCli==="cobrar" ? cobrar : filtroCli==="pagar" ? pagar : diaCliF ? cs.filter(c=>c.d) : cs;
    v.innerHTML=aviso+`<h1>Clientes</h1><p class="sub">Saldo de cada cliente = lo cobrado menos el valor del servicio.</p>
      <div class="cifras" style="margin-bottom:14px">
        <div class="cifra"><span>${diaCliF?"Ese día te quedaron debiendo":"Cuentas por cobrar (te deben)"}</span><b class="neg">${pesos(totC)}</b><span>${cobrar.length} cliente${cobrar.length===1?"":"s"}</span></div>
        <div class="cifra"><span>${diaCliF?"Ese día les quedaste debiendo":"Cuentas por pagar (les debes)"}</span><b class="pos">${pesos(totP)}</b><span>${pagar.length} cliente${pagar.length===1?"":"s"}</span></div>
      </div>
      <div class="acciones" style="margin-bottom:16px"><button class="btn" id="nuevoCli">Registrar cliente</button><button class="btn ok" id="waMasivo">Enviar saldos por WhatsApp</button>${descargas&&esAdmin?'<button class="btn sec" id="xlsCartera">Descargar cartera en Excel</button>':""}<button class="btn sec" id="imprCli">Imprimir ${filtroCli==="cobrar"?"por cobrar":filtroCli==="pagar"?"por pagar":"por cobrar y por pagar"}</button><button class="btn sec" id="imprRecs">Imprimir recibos</button></div>
      <div class="filtros">${[["todos","Todos"],["cobrar","Por cobrar"],["pagar","Por pagar"]].map(([k,t])=>`<button data-fc="${k}" aria-pressed="${filtroCli===k}">${t}</button>`).join("")}</div>
      ${filtroDiaHtml(diaCliF)}${diaCliF?`<p class="sub">Clientes con movimiento ese día: lo que les quedó de ese día y, al lado, su saldo total de hoy.</p>`:""}
      ${vis.length?`<div class="tabla-env"><table><thead><tr><th>Cliente</th><th>Número</th><th>Cuenta</th>${diaCliF?'<th class="n">Ese día</th>':""}<th class="n">Saldo</th><th></th></tr></thead><tbody>
      ${vis.map(c=>`<tr><td><b>${esc(c.nombre)}</b>${Number(c.tarifa)?`<br><span class="sub" style="font-size:.8rem">Domicilio ${pesos(c.tarifa)}</span>`:""}</td><td>${esc(c.telefono||"")}</td><td>${c.s<0?'<span class="etq sin">Por cobrar</span>':c.s>0?'<span class="etq ent">Por pagar</span>':'<span class="sub">Paz y salvo</span>'}</td>${diaCliF?`<td class="n ${c.d<0?"neg":"pos"}">${c.d<0?"Debe ":"A favor "}${pesos(Math.abs(c.d))}</td>`:""}<td class="n ${c.s<0?"neg":c.s>0?"pos":""}">${pesos(Math.abs(c.s))}</td><td><button class="btn sec chico" data-cli="${esc(c.id)}">Ver cuenta</button></td></tr>`).join("")}
      </tbody></table></div>`:`<div class="vacio">${cs.length?"No hay clientes en esta lista.":"Registra tus clientes (los remitentes) para llevar su saldo."}</div>`}`;
    $("#nuevoCli").onclick=()=>formCliente();
    $("#waMasivo").onclick=()=>envioMasivo(filtroCli==="pagar"?"pagar":"cobrar");
    const xc=$("#xlsCartera"); if(xc) xc.onclick=()=>descargarCartera(xc);
    $("#imprRecs").onclick=()=>recibosVarios(vis,k);
    $("#imprCli").onclick=()=>imprimirClientes([filtroCli!=="pagar"&&["Cuentas por cobrar","Te deben",cobrar,totC],filtroCli!=="cobrar"&&["Cuentas por pagar","Les debes",pagar,totP]].filter(Boolean),k);
    v.querySelectorAll("[data-fc]").forEach(b=>b.onclick=()=>{filtroCli=b.dataset.fc; pintar();});
    v.querySelectorAll("[data-cli]").forEach(b=>b.onclick=()=>abrirCuenta(b.dataset.cli));
    enlazarFiltroDia(diaCliF,d=>diaCliF=d);
  }
  else if(tabA==="caja"){
    const pendM={}; Object.values(S.pedidos).filter(p=>p.estado==="pendiente").forEach(p=>pendM[p.mensajeroId]=(pendM[p.mensajeroId]||0)+1);
    const pms={}; Object.keys(S.mensajeros).forEach(id=>pms[id]=periodoMensajero(id));
    const ids=listaOrdenada(S.mensajeros,"nombre").filter(esRepartidor).map(m=>m.id).filter(id=>{const pm=pms[id]; return tipoDe(S.mensajeros[id])==="mensajero"||pm.ps.length||pm.recs.length||pm.debe||pendM[id];}); // los mensajeros siempre, para poder darles base al empezar el día
    const tot={debe:0,ef:0,tj:0,tc:0}; ids.forEach(id=>{const pm=pms[id], tt=totales(pm.ps); tot.debe+=pm.debe; tot.ef+=tt.efectivo; tot.tj+=tt.transfJs; tot.tc+=tt.transfCli;});
    const recsDia=Object.values(S.recaudos).filter(r=>diaDe(r.fecha)===diaCaja).sort((a,b)=>a.fecha-b.fecha);
    const cajaDia=recsDia.reduce((a,r)=>a+(Number(r.valor)||0),0);
    const porMedio={}; recsDia.forEach(r=>porMedio[r.medio]=(porMedio[r.medio]||0)+(Number(r.valor)||0));
    const liqs=Object.values(S.liquidaciones).sort((a,b)=>b.fecha-a.fecha).slice(0,25);
    // El asistente solo ve lo de los mensajeros y registra lo que le entregan; la caja de la empresa, los sueldos y las liquidaciones son de administración
    v.innerHTML=aviso+`<h1>Caja</h1>${esAdmin?bloqueCajaGeneral():""}
      <h2>Mensajeros</h2><p class="sub">${esAdmin?"Cada mensajero lleva un período abierto que se cierra cuando lo liquidas. Lo que entregue después cuenta para el siguiente período.":"Lo que cada mensajero debe entregar. Toca “Recibir dinero” cada vez que te entregue plata."}</p>
      <div class="cifras">
        <div class="cifra fuerte"><span>Pendiente por entregar (todos)</span><b>${pesos(tot.debe)}</b></div>
        <div class="cifra"><span>Efectivo cobrado en períodos abiertos</span><b>${pesos(tot.ef)}</b></div>
        <div class="cifra"><span>Transferencias a JS (verificar en banco)</span><b>${pesos(tot.tj)}</b></div>
        <div class="cifra"><span>Pagado directo a clientes</span><b>${pesos(tot.tc)}</b></div>
      </div>
      <div style="height:14px"></div>
      ${ids.length?`<div class="mgrid">${ids.map(id=>{const pm=pms[id], tt=totales(pm.ps); return `<div class="mcard">
        <div class="mcard-top"><b>${esc(S.mensajeros[id].nombre)}</b><span class="acciones" style="margin:0;gap:6px"><button class="btn sec chico" data-base="${esc(id)}">Dar base</button><button class="btn ok chico" data-recibir="${esc(id)}">Recibir dinero</button></span></div>
        <span class="sub" style="font-size:.85rem">Período desde ${pm.ul?hora(pm.ul.fecha):"el inicio"}</span>
        <dl class="datos">
          <dt>Entregas / en ruta</dt><dd>${pm.ps.length} / ${pendM[id]||0}</dd>
          <dt>Efectivo cobrado</dt><dd>${pesos(tt.efectivo)}</dd>
          ${pm.base?`<dt>Base para vueltos</dt><dd>${pesos(pm.base)}</dd>`:""}${pm.gastos?`<dt>Fletes / gastos pagados</dt><dd>− ${pesos(pm.gastos)}</dd>`:""}
          ${pm.anterior?`<dt>Pendiente anterior</dt><dd>${pesos(pm.anterior)}</dd>`:""}${filaAjuste(pm)}
          <dt>Ya entregó</dt><dd>${pesos(pm.recibido)}</dd>
          <div class="debe" style="display:contents"><dt>Debe</dt><dd>${pesos(pm.debe)}</dd></div>
          <dt>Transf. a JS</dt><dd>${pesos(tt.transfJs)}</dd>
          <dt>Directo al cliente</dt><dd>${pesos(tt.transfCli)}</dd>
          ${esAdmin?`<dt>Sueldo del período</dt><dd>${sueldoTexto(id,pm.ps)}</dd>`:""}
        </dl>
        <div class="liq"><span class="liq-est ${pm.ul&&pm.ul.debe>0?"neg":""}">${pm.ul?"Última: "+textoLiq(pm.ul.debe):"Sin liquidaciones"}</span>${esAdmin?`<button class="btn chico" data-liquidar="${esc(id)}">Liquidar</button>`:""}</div>
        </div>`}).join("")}</div>`:`<div class="vacio">No hay mensajeros con movimiento pendiente.</div>`}
      ${bloqueCajaOficina()}
      <h2>Dinero recibido de mensajeros</h2>
      <div class="campo" style="max-width:220px"><label for="diaC">Día</label><input type="date" id="diaC" value="${diaCaja}"></div>
      <div class="cifras" style="margin-bottom:12px"><div class="cifra fuerte"><span>Dinero recibido</span><b>${pesos(cajaDia)}</b><span>${Object.entries(porMedio).map(([m,x])=>`${MEDIOS[m]||m}: ${pesos(x)}`).join(" · ")||"Sin entregas de dinero este día"}</span></div></div>
      ${recsDia.length?`<div class="tabla-env"><table><thead><tr><th>Hora</th><th>Mensajero</th><th>Medio</th><th>Nota</th><th class="n">Valor</th>${esAdmin?"<th></th>":"<th>Recibió</th>"}</tr></thead><tbody>${recsDia.map(r=>`<tr><td>${hora(r.fecha)}</td><td>${esc(S.mensajeros[r.mensajeroId]?.nombre||"")}</td><td>${MEDIOS[r.medio]||""}${medioAntesTxt(r)}</td><td>${esc(r.nota||"")}</td><td class="n"><b>${pesos(r.valor)}</b></td>${esAdmin?`<td style="white-space:nowrap"><button class="btn sec chico" data-edrec="${esc(r.id)}">Editar</button> <button class="btn peligro chico" data-delrec="${esc(r.id)}">Quitar</button></td>`:`<td>${esc(r.porNombre||"")}${puedoCambiarMedio(r)?` <button class="btn sec chico" data-cmrec="${esc(r.id)}">Cambiar medio</button>`:""}</td>`}</tr>`).join("")}</tbody></table></div>`:`<div class="vacio">Toca “Recibir dinero” en un mensajero cada vez que te entregue plata.</div>`}
      ${esAdmin?`<h2>Liquidaciones recientes</h2>`:""}
      ${!esAdmin?(recsDia.length?'<p class="sub" style="margin-top:8px">Si algo quedó mal registrado, avísale al administrador para que lo corrija.</p>':""):liqs.length?`<div class="tabla-env"><table><thead><tr><th>Liquidado</th><th>Mensajero</th><th class="n">Entregas</th><th class="n">Entregó</th><th>Resultado</th><th></th></tr></thead><tbody>${liqs.map(l=>`<tr><td>${hora(l.fecha)}</td><td>${esc(S.mensajeros[l.mensajeroId]?.nombre||"")}</td><td class="n">${l.entregas||0}</td><td class="n">${pesos(l.recibido)}</td><td class="${l.debe>0?"neg":"pos"}">${textoLiq(l.debe)}</td><td><button class="btn sec chico" data-verliq="${esc(l.id)}">Ver</button></td></tr>`).join("")}</tbody></table></div>`:`<div class="vacio">Aún no has liquidado a ningún mensajero.</div>`}`;
    $("#diaC").onchange=e=>{diaCaja=e.target.value||hoy(); pintar();};
    if(esAdmin) conectarCajaGeneral(v);
    conectarCajaOficina(v);
    v.querySelectorAll("[data-recibir]").forEach(b=>b.onclick=()=>recibirDinero(b.dataset.recibir));
    v.querySelectorAll("[data-cmrec]").forEach(b=>b.onclick=()=>cambiarMedio("recaudos",b.dataset.cmrec));
    v.querySelectorAll("[data-base]").forEach(b=>b.onclick=()=>esAdmin?movCaja("sale",{cat:"base",personaId:b.dataset.base}):baseDesdeOficina(b.dataset.base));
    v.querySelectorAll("[data-liquidar]").forEach(b=>b.onclick=()=>liquidar(b.dataset.liquidar));
    v.querySelectorAll("[data-verliq]").forEach(b=>b.onclick=()=>verLiquidacion(b.dataset.verliq));
    v.querySelectorAll("[data-edrec]").forEach(b=>b.onclick=()=>editarRecaudo(b.dataset.edrec));
    v.querySelectorAll("[data-delrec]").forEach(b=>b.onclick=async()=>{ const r=S.recaudos[b.dataset.delrec]; if(!r) return; if(yaContado(r.fecha)) return avisoContado();
      if(!await confirmar("Quitar dinero recibido",`${S.mensajeros[r.mensajeroId]?.nombre||""} · ${pesos(r.valor)} · ${hora(r.fecha)}. Se quita de la caja y vuelve a sumarse a lo que debe.`,"Quitar")) return;
      b.disabled=true; try{ await borrar("recaudos",b.dataset.delrec); toast("Entrega de dinero quitada"); }catch(e){ b.disabled=false; toast("No se pudo quitar"); } });
  }
  else if(tabA==="recibos"){ pintarRecibos(v,aviso); }
  else if(tabA==="cuentas"){ pintarCuentas(v,aviso); }
  else if(tabA==="sueldos"){ pintarSueldos(v,aviso); }
  else pintarMas(v,aviso);
}

/* ======================= CLIENTE (solo lectura) ======================= */
let tabC="inicio", filtroC="todos", buscarC="";
function pintarCliente(){
  const c=S.clientes[miCliente], v=$("#vista");
  const enRuta=Object.values(S.pedidos).filter(p=>p.estado==="pendiente").length, cambios=Object.values(S.pedidos).filter(cambioPendiente);
  ponerNav([["inicio","Inicio"],["pedidos","Mis pedidos",enRuta+cambios.length],["cuenta","Mi cuenta"]],tabC,k=>tabC=k);
  if(!c){ v.innerHTML=`<h1>Hola</h1><div class="vacio">${cargado?"Tu cuenta todavía no está asociada a un cliente. Escríbele a JS Logistics.":"Cargando…"}</div>`; return; }
  if(tabC==="inicio"){ pintarInicioCliente(v,c,cambios); }
  else if(tabC==="pedidos"){
    let ps=Object.values(S.pedidos).sort((a,b)=>b.creado-a.creado);
    if(filtroC==="cambio") ps=ps.filter(cambioPendiente); else if(filtroC==="ruta") ps=ps.filter(p=>p.estado==="pendiente"); else if(filtroC==="ent") ps=ps.filter(p=>p.estado==="entregado"); else if(filtroC==="dev") ps=ps.filter(p=>p.estado==="devuelto");
    if(buscarC) ps=ps.filter(p=>(p.guia+" "+(p.destinatario||"")).toLowerCase().includes(buscarC.toLowerCase()));
    if(diaPedC) ps=ps.filter(p=>delDia(p,diaPedC));
    v.innerHTML=`<h1>Hola, ${esc(c.nombre)}</h1><p class="sub">Tus envíos con JS Logistics y sus pruebas de entrega.</p>
      ${cambios.length?`<div class="aviso alerta">Tienes ${cambios.length===1?"1 prenda de cambio":cambios.length+" prendas de cambio"} por recibir (${cambios.map(p=>esc(p.guia)).join(", ")}). Cuando te la entreguen, ábrela y confirma que la recibiste.</div>`:""}
      <div class="filtros">${[["todos","Todos"],["ruta","En ruta"],["ent","Entregados"],["dev","Devueltos"],["cambio","Cambios por recibir"]].map(([k,t])=>`<button data-fc="${k}" aria-pressed="${filtroC===k}">${t}</button>`).join("")}</div>
      <div class="campo"><input id="buscarC" type="search" placeholder="Buscar guía o quien recibió" value="${esc(buscarC)}" aria-label="Buscar"></div>
      ${filtroDiaHtml(diaPedC)}${diaPedC?`<p class="sub">${ps.length} envío${ps.length===1?"":"s"} de ese día</p>`:""}
      ${ps.length?`<div class="lista">${ps.slice(0,300).map(p=>`<button class="fila" data-pc="${esc(p.guia)}">${fotoSegura(p.mini)?`<img src="${fotoSegura(p.mini)}" alt="">`:'<span class="sinfoto"></span>'}
        <span class="info"><span class="guia">${esc(p.guia)}</span> ${etqEstado(p)}${etqCambio(p)}<p>${p.estado==="entregado"?"Recibió "+esc(p.destinatario||"")+" · "+hora(p.entregado):p.estado==="devuelto"?esc(MOTIVOS[p.motivoDev]||"Devuelto")+" · "+hora(p.entregado):"Salió "+hora(p.creado)}</p></span>
        <span class="n" style="text-align:right;font-weight:700">${p.estado==="entregado"?pesos(p.valorCobrado):""}</span></button>`).join("")}</div>`:`<div class="vacio">No hay envíos aquí.</div>`}`;
    v.querySelectorAll("[data-fc]").forEach(b=>b.onclick=()=>{filtroC=b.dataset.fc; pintar();});
    const bu=$("#buscarC"); bu.oninput=()=>{buscarC=bu.value; clearTimeout(bu._t); bu._t=setTimeout(()=>{pintar(); const n=$("#buscarC"); n.focus(); n.setSelectionRange(n.value.length,n.value.length);},300);};
    v.querySelectorAll("[data-pc]").forEach(b=>b.onclick=()=>verPedidoCliente(b.dataset.pc));
    enlazarFiltroDia(diaPedC,d=>diaPedC=d);
  } else {
    const s=saldoCliente(miCliente), rows=filasCuenta(miCliente);
    v.innerHTML=`<h1>Mi cuenta</h1><p class="sub">${esc(c.nombre)}</p>
      <div class="saldo-grande ${s<0?"neg":s>0?"pos":""}">${pesos(Math.abs(s))}</div>
      <p class="sub">${s>0?"JS Logistics te debe este valor.":s<0?"Este valor queda pendiente por pagar a JS Logistics.":"Cuenta a paz y salvo."}</p>
      <div class="linea2" style="align-items:end"><div class="campo" style="max-width:220px"><label for="diaRC">Recibo de cuadre del día</label><input type="date" id="diaRC" value="${diaRec}"></div>
      <div class="campo"><button class="btn" id="verRC">Ver recibo</button></div></div>
      <h2>Movimientos</h2>
      ${rows.length?`<div class="tabla-env"><table><thead><tr><th>Fecha</th><th>Detalle</th><th class="n">Valor</th></tr></thead><tbody>${rows.map(r=>`<tr><td>${hora(r.fecha)}</td><td>${esc(r.det)}</td><td class="n ${r.v<0?"neg":"pos"}">${pesos(r.v)}</td></tr>`).join("")}</tbody></table></div>`:'<div class="vacio">Sin movimientos.</div>'}`;
    $("#diaRC").onchange=e=>{diaRec=e.target.value||hoy();};
    $("#verRC").onclick=()=>{ if(cuadreDia(diaRec).some(r=>r.cid===miCliente)) verRecibo(miCliente); else toast("No hay entregas ni pagos ese día"); };
  }
}
async function verPedidoCliente(guia){
  const p=S.pedidos[guia]; if(!p) return;
  $("#dlgCont").innerHTML=`<header><div><h2 class="guia">${esc(guia)}</h2>${etqEstado(p)}</div><button class="cerrar" data-cerrar aria-label="Cerrar">×</button></header>
  <dl class="datos">
    <dt>Salió</dt><dd>${hora(p.creado)}</dd>
    ${Number(p.aCobrar)?`<dt>Valor a cobrar</dt><dd>${pesos(p.aCobrar)}</dd>`:""}
    ${(p.intentos||[]).map((i,k)=>`<dt>Intento ${k+1}</dt><dd>${hora(i.fecha)} · ${esc(MOTIVOS[i.motivo]||"")}</dd>`).join("")}
    ${p.estado==="entregado"?`<dt>Entregado</dt><dd>${hora(p.entregado)}</dd><dt>Recibió</dt><dd>${esc(p.destinatario)}</dd><dt>Cobrado</dt><dd>${pesos(p.valorCobrado)}</dd><dt>Método</dt><dd>${metodoTxt(p)}</dd>`:""}
    ${p.estado==="devuelto"?`<dt>Devuelto</dt><dd>${hora(p.entregado)}</dd><dt>Motivo</dt><dd>${esc(MOTIVOS[p.motivoDev]||"")}</dd>`:""}
    ${cerrado(p)?`<dt>Domicilio</dt><dd>${pesos(servicio(p))}</dd>${gastoDe(p)?`<dt>Flete / gasto del envío</dt><dd>${pesos(gastoDe(p))}${p.gastoNota?" · "+esc(p.gastoNota):""}</dd>`:""}${p.domiPagado?`<dt>Pagaste aparte</dt><dd>${pesos(pagoDomi(p))}</dd>`:""}<dt>Efecto en tu saldo</dt><dd class="${saldoPedido(p)<0?"neg":"pos"}">${pesos(saldoPedido(p))}</dd>`:""}
  </dl>
  ${p.cambio?(p.cambioRecibido?`<div class="aviso">Recibiste la prenda de cambio el ${hora(p.cambioRecibido)}.</div>`:`<div class="aviso alerta">JS Logistics tiene una prenda de cambio de este envío para entregarte.<br><button class="btn ok chico" id="pcCambio">Confirmar que recibí el cambio</button></div>`):""}
  <h2>Pruebas</h2><div class="fotos" id="pcFotos"><span class="sub">Cargando fotos…</span></div>`;
  const cc=$("#pcCambio"); if(cc) cc.onclick=async()=>{ if(!await confirmar("Confirmar cambio de "+guia,"Confirmas que ya recibiste la prenda de cambio de este envío.","Sí, la recibí")) return verPedidoCliente(guia);
    try{ await rawUpd("pedidos",guia,{cambioRecibido:Date.now(),cambioConfirmo:uid}); toast("¡Gracias! Cambio confirmado"); setTimeout(()=>verPedidoCliente(guia),400); }catch(e){ toast("No se pudo confirmar. Revisa la conexión."); } };
  abrirDlg();
  try{
    const [f,e]=await Promise.all([leer("fotos",guia), cerrado(p)?leer("entregas",guia):null]);
    const items=[["Salida",f?.salida],[p.estado==="devuelto"?"Evidencia":"Entrega",e?.foto],["Firma de quien recibió",e?.firma]].map(([t,x])=>[t,fotoSegura(x)]).filter(([,x])=>x);
    const box=$("#pcFotos"); if(box) box.innerHTML=items.length?items.map(([t,x])=>`<figure><img src="${x}" alt="${t}"><figcaption>${t}</figcaption></figure>`).join(""):'<span class="sub">Sin fotos.</span>';
  }catch(err){ const box=$("#pcFotos"); if(box) box.innerHTML='<span class="sub">No se pudieron cargar las fotos.</span>'; }
}

/* ======================= PANELES DE INICIO (empresa y cliente) ======================= */
const pct = (a,b) => b ? Math.round(a*100/b) : 0;
const diaCorto = d => new Date(d+"T12:00:00").toLocaleDateString("es-CO",{weekday:"short",day:"numeric",month:"short"});
const COLOR_ESTADO={entregado:"var(--verde)",ruta:"var(--mango)",devuelto:"var(--rojo)"};
/* Dona por estado: cada color va con su nombre y su número al lado. */
function donaHtml(segs,centro,sub){
  const tot=segs.reduce((a,x)=>a+x.n,0), r=15.915, gap=segs.filter(x=>x.n).length>1?1.2:0;
  let acum=0;
  const arcos=segs.filter(x=>x.n).map(x=>{ const p=x.n*100/tot, l=Math.max(.5,p-gap), o=-acum; acum+=p;
    return `<circle cx="21" cy="21" r="${r}" fill="none" stroke="${x.c}" stroke-width="6" stroke-dasharray="${l} ${100-l}" stroke-dashoffset="${o}" data-tip><title>${esc(x.t)}: ${x.n}</title></circle>`; }).join("");
  return `<div class="dona"><div class="dona-svg"><svg viewBox="0 0 42 42" role="img" aria-label="${esc(segs.map(x=>x.t+": "+x.n).join(", "))}"><circle cx="21" cy="21" r="${r}" fill="none" stroke="var(--hueco)" stroke-width="6"/>${arcos}</svg><div class="dona-centro"><b>${centro}</b><span>${sub}</span></div></div>
    <ul class="leyenda">${segs.map(x=>`<li><i style="background:${x.c}"></i>${esc(x.t)}<b>${x.n}</b></li>`).join("")}</ul></div>`;
}
/* Columnas por día (una sola serie). El valor de cada día aparece al pasar el dedo o el mouse. */
function columnasHtml(datos,nombre){
  const max=Math.max(4,Math.ceil(Math.max(...datos.map(d=>d.n))/4)*4), cada=Math.ceil(datos.length/8);
  return `<div class="colbar" role="img" aria-label="${esc(nombre)}: ${esc(datos.map(d=>d.tip).join(", "))}"><span class="colbar-max">${max}</span>${datos.map(d=>`<div class="cb${d.hoy?" hoy":""}" tabindex="0" data-tip="${esc(d.tip)}"><i style="height:${d.n*100/max}%"></i></div>`).join("")}</div>
    <div class="colbar-ejes" aria-hidden="true">${datos.map((d,i)=>`<span>${(datos.length-1-i)%cada===0?esc(d.l):""}</span>`).join("")}</div>`;
}
function entregasPorDia(ps,n){
  const h=hoy(), porDia={};
  ps.forEach(p=>{ if(p.estado==="entregado"){ const d=diaDe(p.entregado); porDia[d]=(porDia[d]||0)+1; } });
  return [...Array(n)].map((_,i)=>{ const d=moverDia(h,i-n+1), k=porDia[d]||0; return {l:String(Number(d.slice(8))),n:k,tip:`${diaCorto(d)}: ${k} entrega${k===1?"":"s"}`,hoy:d===h}; });
}
const kpiHtml = (ico,lbl,val,pie,ir,cls) => `<${ir?`button data-ir="${ir}"`:"div"} class="kpi ${cls||""}"><span class="lbl">${ICONOS[ico]||""}${lbl}</span><b>${val}</b>${pie||""}</${ir?"button":"div"}>`;
const ultimaActividad = p => Math.max(p.creado||0,p.entregado||0);
const etqDash = p => p.estado==="pendiente" ? '<span class="etq ruta">En ruta</span>' : etqEstado(p);

function pintarInicioEmpresa(v,aviso){
  const h=hoy(), ayer=moverDia(h,-1), todos=Object.values(S.pedidos);
  const delDiaE=(p,d,e)=>p.estado===e&&diaDe(p.entregado)===d;
  const entHoy=todos.filter(p=>delDiaE(p,h,"entregado")), devHoy=todos.filter(p=>delDiaE(p,h,"devuelto"));
  const enRuta=todos.filter(p=>p.estado==="pendiente"), salieron=todos.filter(p=>diaDe(p.creado)===h).length, sinRem=todos.filter(p=>!p.clienteId).length;
  const domDe=d=>todos.filter(p=>cerrado(p)&&diaDe(p.entregado)===d).reduce((a,p)=>a+servicio(p),0), domHoy=domDe(h), domAyer=domDe(ayer);
  const efec=pct(entHoy.length,entHoy.length+devHoy.length), cambio=domAyer?Math.round((domHoy-domAyer)*100/domAyer):null;
  const reps=listaOrdenada(S.mensajeros,"nombre").filter(esRepartidor).map(m=>({m,ruta:enRuta.filter(p=>p.mensajeroId===m.id).length,ent:entHoy.filter(p=>p.mensajeroId===m.id).length,debe:periodoMensajero(m.id).debe}))
    .filter(x=>x.ruta||x.ent||x.debe>0).sort((a,b)=>b.ruta-a.ruta||b.ent-a.ent);
  // la caja de la empresa solo la ve administración; el asistente ve lo de mensajeros y clientes
  let R=null, porCobrar=0, porPagar=0, enMens=reps.reduce((a,x)=>a+Math.max(0,x.debe),0);
  if(esAdmin){ R=resumenCaja(); porCobrar=R.porCobrar; porPagar=R.porPagar; enMens=R.enMens; }
  else Object.keys(S.clientes).forEach(id=>{ const s=saldoCliente(id); if(s>0) porPagar+=s; else porCobrar-=s; });
  const dias=entregasPorDia(todos,14), tot14=dias.reduce((a,d)=>a+d.n,0);
  const ultimos=todos.slice().sort((a,b)=>ultimaActividad(b)-ultimaActividad(a)).slice(0,7);
  const desde=moverDia(h,-29), porC={};
  todos.forEach(p=>{ if(p.clienteId&&p.estado==="entregado"&&diaDe(p.entregado)>=desde){ const c=porC[p.clienteId]=porC[p.clienteId]||{n:0,dom:0}; c.n++; c.dom+=servicio(p); } });
  const top=Object.entries(porC).sort((a,b)=>b[1].n-a[1].n).slice(0,6), maxTop=top.length?top[0][1].n:1;
  const COL_MEDIO={efectivo:"var(--verde)",nequi:"#8E44AD",bancolombia:"#E0A100",cuentas:"var(--marca2)"};
  const fila=(t,x,cls)=>`<div class="${cls||""}"><span>${t}</span><b class="${x<0?"neg":""}">${pesos(x)}</b></div>`;
  const plata=esAdmin
    ? Object.entries(R.porMedio).filter(([,x])=>Math.round(x)).map(([m,x])=>`<div><span class="medio" style="--c:${COL_MEDIO[m]||"var(--suave)"}">${esc(MEDIOS_CAJA[m]||m)}</span><b>${pesos(x)}</b></div>`).join("")
      +fila("<b>Total en caja</b>",R.total)+fila("En manos de mensajeros",enMens)+fila("Te deben los clientes",porCobrar)+fila("Les debes a clientes",porPagar)+fila("Sueldos por pagar (semana)",R.sueldosPend)+(()=>{ const a=arqueosCaja()[0]; return `<div><span>Último arqueo</span><b>${a?hora(a.fecha)+" · "+resultadoArqueo(a):"Nunca"}</b></div>`; })()+fila("Disponible de JS",R.disponible,"total")
    : fila("Deben los mensajeros",enMens)+fila("Te deben los clientes",porCobrar)+fila("Les debes a clientes",porPagar,"total");

  v.innerHTML=aviso+`<div class="dash-cab"><div><h1>Panel de control</h1><p class="sub">Así va JS Logistics hoy</p></div>${esAdmin?`<button class="btn sec chico" data-ir="mas|panel">Ver resultados del mes</button>`:""}</div>
    <div class="kpis">
      ${kpiHtml("ok","Entregados hoy",entHoy.length,`<div class="prog" aria-hidden="true"><i style="width:${efec}%"></i></div><small>${entHoy.length+devHoy.length?efec+"% efectividad · "+devHoy.length+" devuelto"+(devHoy.length===1?"":"s"):"Todavía sin entregas hoy"}</small>`,"pedidos|ent|hoy")}
      ${kpiHtml("ruta","En ruta ahora",enRuta.length,`<small>${salieron} salieron hoy${sinRem?` · <span class="neg">${sinRem} sin remitente</span>`:""}</small>`,"pedidos|pend")}
      ${kpiHtml("pedidos","Domicilios de hoy",pesos(domHoy),`<small>${cambio===null?"Ayer: "+pesos(domAyer):`<span class="tend ${cambio>=0?"sube":"baja"}">${cambio>=0?"↑":"↓"} ${Math.abs(cambio)}%</span> frente a ayer`}</small>`)}
      ${esAdmin?kpiHtml("plata","Total en caja",pesos(R.total),`<small>Disponible de JS: ${pesos(R.disponible)}</small>`,"caja","oscuro")
        :kpiHtml("plata","Deben los mensajeros",pesos(enMens),`<small>Lo que falta por recibir</small>`,"caja","oscuro")}
    </div>
    <div class="dash">
      <section class="tarjeta c5"><h3>Pedidos de hoy <small>${diaCorto(h)}</small></h3>
        ${donaHtml([{t:"Entregados",n:entHoy.length,c:COLOR_ESTADO.entregado},{t:"En ruta",n:enRuta.length,c:COLOR_ESTADO.ruta},{t:"Devueltos",n:devHoy.length,c:COLOR_ESTADO.devuelto}],entHoy.length+enRuta.length+devHoy.length,"pedidos")}</section>
      <section class="tarjeta c7"><h3>Mensajeros en ruta <button class="btn sec chico" data-ir="caja">Ir a Caja</button></h3>
        ${reps.length?`<div class="tabla-env"><table><thead><tr><th>Mensajero</th><th class="n">En ruta</th><th class="n">Hoy</th><th class="n">Debe</th><th class="solo-ancho">Estado</th></tr></thead><tbody>
        ${reps.map(x=>`<tr data-ir="caja"><td><b>${esc(x.m.nombre)}</b></td><td class="n">${x.ruta}</td><td class="n">${x.ent}</td><td class="n ${x.debe>0?"neg":""}">${pesos(x.debe)}</td><td class="solo-ancho">${x.ruta?'<span class="etq ruta">En ruta</span>':x.ent?'<span class="etq ent">Terminó</span>':'<span class="etq gris">Sin salir</span>'}</td></tr>`).join("")}
        </tbody></table></div>`:`<div class="vacio">Ningún mensajero en ruta ahora.</div>`}</section>
    </div>
    <div class="dash">
      <section class="tarjeta c7"><h3>Entregas · últimos 14 días <small>${tot14} en total · ${(tot14/14).toFixed(1)} por día</small></h3>${columnasHtml(dias,"Entregas por día")}</section>
      <section class="tarjeta c5"><h3>Plata ${esAdmin?"":"<small>Mensajeros y clientes</small>"}</h3><div class="plata">${plata}</div></section>
    </div>
    <div class="dash">
      <section class="tarjeta c7"><h3>Últimos pedidos <button class="btn sec chico" data-ir="pedidos|todos">Ver todos</button></h3>
        ${ultimos.length?`<div class="tabla-env"><table><thead><tr><th>Guía</th><th>Cliente</th><th class="solo-ancho">Mensajero</th><th>Estado</th><th class="n solo-ancho">Cobrado</th></tr></thead><tbody>
        ${ultimos.map(p=>`<tr data-ped="${esc(p.guia)}"><td class="guia">${esc(p.guia)}</td><td>${p.clienteId?esc(nombreCliente(p.clienteId)):'<span class="etq sin">Sin remitente</span>'}</td><td class="solo-ancho">${esc(S.mensajeros[p.mensajeroId]?.nombre||"")}</td><td>${etqDash(p)}</td><td class="n solo-ancho">${p.estado==="entregado"?pesos(p.valorCobrado):"—"}</td></tr>`).join("")}
        </tbody></table></div>`:`<div class="vacio">Todavía no hay pedidos.</div>`}</section>
      <section class="tarjeta c5"><h3>Clientes que más envían <small>Últimos 30 días</small></h3>
        ${top.length?`<div class="hbarras">${top.map(([id,c])=>`<button data-cli="${esc(id)}" style="--w:${Math.round(c.n*100/maxTop)}%"><span>${esc(nombreCliente(id)||"(eliminado)")}</span><small>${c.n} entrega${c.n===1?"":"s"} · ${pesos(c.dom)}</small><i></i></button>`).join("")}</div>`:`<div class="vacio">Sin entregas en los últimos 30 días.</div>`}</section>
    </div>`;
  v.querySelectorAll("[data-ir]").forEach(b=>b.onclick=()=>{ const [t,f,d]=b.dataset.ir.split("|"); tabA=t;
    if(t==="pedidos"){ filtroA=f||"todos"; diaPedA=d==="hoy"?h:""; mensPedA=""; buscarA=""; limiteA=100; }
    if(t==="mas") subMas=f||"panel";
    pintar(); scrollTo(0,0); });
  v.querySelectorAll("[data-ped]").forEach(b=>b.onclick=()=>abrirPedido(b.dataset.ped));
  v.querySelectorAll("[data-cli]").forEach(b=>b.onclick=()=>abrirCuenta(b.dataset.cli));
}

function pintarInicioCliente(v,c,cambios){
  const h=hoy(), todos=Object.values(S.pedidos), desde=moverDia(h,-29);
  const n=(e,d)=>todos.filter(p=>p.estado===e&&(d?diaDe(p.entregado)===d:diaDe(p.entregado)>=desde)).length;
  const enRuta=todos.filter(p=>p.estado==="pendiente").length, salieron=todos.filter(p=>diaDe(p.creado)===h).length;
  const entHoy=n("entregado",h), devHoy=n("devuelto",h), entMes=n("entregado"), devMes=n("devuelto"), efec=pct(entMes,entMes+devMes);
  const s=saldoCliente(miCliente), dias=entregasPorDia(todos,30), tot30=dias.reduce((a,d)=>a+d.n,0);
  const ultimos=todos.slice().sort((a,b)=>ultimaActividad(b)-ultimaActividad(a)).slice(0,6), movs=filasCuenta(miCliente).slice(0,6);
  v.innerHTML=`<div class="dash-cab"><div><h1>Hola, ${esc(c.nombre)}</h1><p class="sub">Así van tus envíos con JS Logistics</p></div></div>
    ${cambios.length?`<div class="aviso alerta">Tienes ${cambios.length===1?"1 prenda de cambio":cambios.length+" prendas de cambio"} por recibir (${cambios.map(p=>esc(p.guia)).join(", ")}). Cuando te la entreguen, ábrela y confirma que la recibiste.</div>`:""}
    <div class="kpis">
      ${kpiHtml("ruta","En ruta ahora",enRuta,`<small>${salieron} salieron hoy</small>`,"pedidos|ruta")}
      ${kpiHtml("ok","Entregados hoy",entHoy,`<small>${entMes} en 30 días</small>`,"pedidos|ent")}
      ${kpiHtml("dev","Devueltos hoy",devHoy,`<small>${devMes} en 30 días</small>`,"pedidos|dev")}
      ${kpiHtml("plata","Tu saldo",pesos(Math.abs(s)),`<small>${s>0?"JS Logistics te debe este valor":s<0?"Pendiente por pagar a JS Logistics":"Cuenta a paz y salvo"}</small>`,"cuenta","oscuro")}
    </div>
    <div class="dash">
      <section class="tarjeta c4"><h3>Efectividad <small>Últimos 30 días</small></h3>
        ${donaHtml([{t:"Entregados",n:entMes,c:COLOR_ESTADO.entregado},{t:"Devueltos",n:devMes,c:COLOR_ESTADO.devuelto}],entMes+devMes?efec+"%":"—","entregado")}</section>
      <section class="tarjeta c8"><h3>Tus envíos entregados <small>Últimos 30 días · ${tot30} en total</small></h3>${columnasHtml(dias,"Entregas por día")}</section>
    </div>
    <div class="dash">
      <section class="tarjeta c7"><h3>Últimos pedidos <button class="btn sec chico" data-ir="pedidos|todos">Ver todos</button></h3>
        ${ultimos.length?`<div class="mini-lista">${ultimos.map(p=>`<button data-pc="${esc(p.guia)}">${fotoSegura(p.mini)?`<img src="${fotoSegura(p.mini)}" alt="">`:'<span class="sinfoto"></span>'}
          <span class="info"><span class="guia">${esc(p.guia)}</span> ${etqDash(p)}<p>${p.estado==="entregado"?"Recibió "+esc(p.destinatario||"")+" · "+hora(p.entregado):p.estado==="devuelto"?esc(MOTIVOS[p.motivoDev]||"Devuelto")+" · "+hora(p.entregado):"Salió "+hora(p.creado)}</p></span>
          <span class="val">${p.estado==="entregado"?pesos(p.valorCobrado):""}</span></button>`).join("")}</div>`:`<div class="vacio">Todavía no tienes envíos.</div>`}</section>
      <section class="tarjeta c5"><h3>Últimos movimientos <button class="btn sec chico" data-ir="cuenta">Mi cuenta</button></h3>
        ${movs.length?`<div class="mini-lista">${movs.map(r=>`<div><span class="info"><b style="font-weight:600;font-size:.88rem">${esc(r.pid?r.pid+(r.nom?" · "+r.nom:""):r.nom||r.det)}</b><p>${hora(r.fecha)}</p></span><span class="val ${r.v<0?"neg":"pos"}">${pesos(r.v)}</span></div>`).join("")}</div>`:`<div class="vacio">Sin movimientos.</div>`}</section>
    </div>`;
  v.querySelectorAll("[data-ir]").forEach(b=>b.onclick=()=>{ const [t,f]=b.dataset.ir.split("|"); tabC=t; if(f){ filtroC=f; diaPedC=""; buscarC=""; } pintar(); scrollTo(0,0); });
  v.querySelectorAll("[data-pc]").forEach(b=>b.onclick=()=>verPedidoCliente(b.dataset.pc));
}

/* ======================= CUENTAS INTERNAS ======================= */
/* JS Envíos, MT, Base de JS…: entradas y salidas que mueven la caja, sin tocar clientes ni sueldos.
   Socio: lo que sale hacia ellos es lo que deben. Base: total que la empresa tiene como base. */
const TIPOS_CUENTA={socio:"Empresa o tienda (presta y devuelve)",base:"Base de la empresa"};
const movsCuenta = id => Object.values(S.cajamovs).filter(c=>c.cat==="interna"&&c.cuentaId===id).sort((a,b)=>b.fecha-a.fecha);
function saldoCuenta(id){ return movsCuenta(id).reduce((a,c)=>a+(c.tipo==="sale"?1:-1)*(Number(c.valor)||0),0); } // + = te debe
function textoCuenta(cu){ const s=saldoCuenta(cu.id);
  if(cu.tipo==="base") return {txt:"Base actual",val:pesos(-s),cls:""};
  return s>0?{txt:"Te debe",val:pesos(s),cls:"neg"}:s<0?{txt:"Tiene a favor",val:pesos(-s),cls:"pos"}:{txt:"En cero",val:pesos(0),cls:""}; }
function pintarCuentas(v,aviso){
  const cs=listaOrdenada(S.cuentas,"nombre");
  const movs=Object.values(S.cajamovs).filter(c=>c.cat==="interna").sort((a,b)=>b.fecha-a.fecha).slice(0,60);
  const extra=Object.values(S.movimientos).filter(m=>MOVS_OFICINA.includes(m.tipo)).sort((a,b)=>b.fecha-a.fecha).slice(0,40);
  v.innerHTML=aviso+`<h1>Cuentas</h1><p class="sub">Entradas y salidas de JS Envíos, MT y la base de JS. Mueven la caja; no tocan clientes ni sueldos.</p>
    ${cs.length?`<div class="mgrid">${cs.map(cu=>{ const t=textoCuenta(cu); return `<div class="mcard"><div class="mcard-top"><b>${esc(cu.nombre)}</b><span class="acciones" style="margin:0;gap:6px"><button class="btn ok chico" data-ce="${esc(cu.id)}">Entrada</button><button class="btn sec chico" data-cs="${esc(cu.id)}">Salida</button></span></div>
      <span class="sub" style="font-size:.85rem">${TIPOS_CUENTA[cu.tipo]||""}</span><dl class="datos"><dt>${t.txt}</dt><dd class="${t.cls}">${t.val}</dd></dl></div>`; }).join("")}</div>`
      :`<div class="vacio">${esAdmin?'Todavía no hay cuentas. <button class="btn chico" id="cuSemilla">Crear JS Envíos, MT y Base de JS</button>':"El administrador todavía no ha creado las cuentas."}</div>`}
    ${esAdmin?`<div class="acciones"><button class="btn sec chico" id="cuNueva">+ Nueva cuenta</button></div>`:""}
    <h2>Movimientos de las cuentas</h2>
    ${movs.length?`<div class="tabla-env"><table><thead><tr><th>Fecha</th><th>Cuenta</th><th>Motivo</th><th>Medio</th><th class="n">Valor</th>${esAdmin?"<th></th>":""}</tr></thead><tbody>${movs.map(c=>`<tr><td>${hora(c.fecha)}</td><td>${esc(S.cuentas[c.cuentaId]?.nombre||"—")}</td><td>${esc(c.concepto||"")}</td><td>${MEDIOS[c.medio]||""}</td><td class="n ${c.tipo==="entra"?"pos":"neg"}">${c.tipo==="entra"?"+ ":"− "}${pesos(c.valor)}</td>${esAdmin?`<td><button class="btn peligro chico" data-cudel="${esc(c.id)}">Quitar</button></td>`:""}</tr>`).join("")}</tbody></table></div>`:'<div class="vacio">Sin movimientos.</div>'}
    <h2>Pagos, compras y ganancias de clientes</h2>
    <p class="sub">El pago de un cliente entra a la caja (efectivo, Nequi o Bancolombia) y se descuenta de lo que debe. Pagarle a un cliente es entregarle su saldo a favor: sale de la caja. La compra sale de la caja y queda como deuda del cliente; al entregar se compensa con lo cobrado. La ganancia ocasional se le carga al cliente y suma al sueldo de JS.</p>
    <div class="acciones"><button class="btn ok" id="cuPago">Pago de un cliente</button><button class="btn" id="cuPagoA">Pagarle a un cliente</button><button class="btn" id="cuCompra">Compra para un cliente</button><button class="btn sec" id="cuGanancia">Ganancia ocasional</button></div>
    ${extra.length?`<div class="tabla-env" style="margin-top:10px"><table><thead><tr><th>Fecha</th><th>Cliente</th><th>Tipo</th><th>Detalle</th><th>Registró</th><th class="n">Valor</th><th></th></tr></thead><tbody>${extra.map(m=>`<tr><td>${hora(m.fecha)}</td><td>${esc(nombreCliente(m.clienteId)||"—")}</td><td>${m.tipo==="pago_de_cliente"?`Pago · ${MEDIOS[m.medio]||""}`:m.tipo==="pago_a_cliente"?`Le pagó · ${MEDIOS[m.medio]||""}`:m.tipo==="ganancia"?"Ganancia JS":"Compra"+(m.medio?` · ${MEDIOS[m.medio]||""}`:"")}${medioAntesTxt(m)}</td><td>${esc(m.nota||"")}</td><td>${esc(m.porNombre||"")}</td><td class="n">${pesos(m.valor)}</td>${esAdmin?`<td style="white-space:nowrap"><button class="btn sec chico" data-mxed="${esc(m.id)}">Editar</button> <button class="btn peligro chico" data-mxdel="${esc(m.id)}">Quitar</button></td>`:`<td>${m.tipo!=="ganancia"&&puedoCambiarMedio(m)?`<button class="btn sec chico" data-cmmov="${esc(m.id)}">Cambiar medio</button>`:""}</td>`}</tr>`).join("")}</tbody></table></div>`:""}`;
  v.querySelectorAll("[data-ce]").forEach(b=>b.onclick=()=>movCuenta(b.dataset.ce,"entra"));
  v.querySelectorAll("[data-cs]").forEach(b=>b.onclick=()=>movCuenta(b.dataset.cs,"sale"));
  v.querySelectorAll("[data-cudel]").forEach(b=>b.onclick=async()=>{ if(yaContado(S.cajamovs[b.dataset.cudel]?.fecha)) return avisoContado(); if(!await confirmar("Quitar movimiento","Se borra de la cuenta y de la caja.","Quitar")) return; try{ await borrar("cajamovs",b.dataset.cudel); toast("Movimiento quitado"); }catch(e){ toast("No se pudo quitar"); } });
  const se=$("#cuSemilla"); if(se) se.onclick=async()=>{ se.disabled=true; try{ for(const [nombre,tipo] of [["JS Envíos","socio"],["MT (tienda de ropa)","socio"],["Base de JS","base"]]){ const id=nuevoId(); await rawSet("cuentas",id,{id,nombre,tipo,creado:Date.now()}); } registrar("Creó las cuentas internas JS Envíos, MT y Base de JS"); toast("Cuentas creadas"); }catch(e){ se.disabled=false; toast("No se pudieron crear"); } };
  const nu=$("#cuNueva"); if(nu) nu.onclick=()=>nuevaCuenta();
  $("#cuPago").onclick=()=>movClienteOficina("pago_de_cliente");
  $("#cuPagoA").onclick=()=>movClienteOficina("pago_a_cliente");
  $("#cuCompra").onclick=()=>movClienteOficina("compra_cliente");
  $("#cuGanancia").onclick=()=>movClienteOficina("ganancia");
  v.querySelectorAll("[data-cmmov]").forEach(b=>b.onclick=()=>cambiarMedio("movimientos",b.dataset.cmmov));
  v.querySelectorAll("[data-mxed]").forEach(b=>b.onclick=()=>{ const m=S.movimientos[b.dataset.mxed]; if(m) movClienteOficina(m.tipo,m); });
  v.querySelectorAll("[data-mxdel]").forEach(b=>b.onclick=async()=>{ const m=S.movimientos[b.dataset.mxdel]; if(!m) return; if(mueveCaja(m)&&yaContado(m.fecha)) return avisoContado();
    if(!await confirmar("Quitar "+(m.tipo==="ganancia"?"ganancia":esPago(m)?"pago":"compra"),`${nombreCliente(m.clienteId)||"Cliente"} · ${pesos(m.valor)}. Se quita de la cuenta del cliente${m.tipo==="ganancia"?" y del sueldo de JS":" y de la caja"}.`,"Quitar")) return;
    try{ await borrar("movimientos",m.id); toast("Movimiento quitado"); }catch(e){ toast("No se pudo quitar"); } });
}
function nuevaCuenta(){
  $("#dlgCont").innerHTML=`<header><h2>Nueva cuenta</h2><button class="cerrar" data-cerrar aria-label="Cerrar">×</button></header>
    <div class="campo"><label for="ncNom">Nombre</label><input id="ncNom" placeholder="Ej: JS Envíos"></div>
    <div class="campo"><label for="ncTipo">Tipo</label><select id="ncTipo">${Object.entries(TIPOS_CUENTA).map(([k,t])=>`<option value="${k}">${t}</option>`).join("")}</select></div>
    <button class="btn" id="ncGuardar" style="width:100%">Crear cuenta</button>`;
  abrirDlg(); $("#ncNom").focus();
  $("#ncGuardar").onclick=async()=>{ const nombre=$("#ncNom").value.trim(); if(!nombre) return toast("Escribe el nombre"); const id=nuevoId();
    try{ await rawSet("cuentas",id,{id,nombre,tipo:$("#ncTipo").value,creado:Date.now()}); registrar("Creó la cuenta interna "+nombre); cerrarDlg(); toast("Cuenta creada"); }catch(e){ toast("No se pudo crear"); } };
}
function movCuenta(id,tipo){
  const cu=S.cuentas[id]; if(!cu) return; const t=textoCuenta(cu);
  $("#dlgCont").innerHTML=`<header><div><h2>${tipo==="entra"?"Entrada de":"Salida a"} ${esc(cu.nombre)}</h2><span class="sub">${t.txt}: ${t.val}</span></div><button class="cerrar" data-cerrar aria-label="Cerrar">×</button></header>
    <p class="sub">${tipo==="entra"?"Dinero que entra a la caja desde esta cuenta.":"Dinero que sale de la caja hacia esta cuenta."}</p>
    <div class="linea2"><div class="campo"><label for="mcVal">Valor</label><input id="mcVal" type="number" inputmode="numeric" min="0" step="1000"></div>
    <div class="campo"><label for="mcMedio">Medio</label><select id="mcMedio">${Object.entries(MEDIOS).map(([k,t])=>`<option value="${k}">${t}</option>`).join("")}</select></div></div>
    <div class="linea2"><div class="campo"><label for="mcDia">Día</label><input id="mcDia" type="date" value="${hoy()}" min="${diaMinCaja()}" max="${hoy()}"></div>
    <div class="campo"><label for="mcMot">Motivo</label><input id="mcMot" placeholder="${tipo==="entra"?"Ej: devolución del préstamo":"Ej: préstamo para nómina"}"></div></div>
    <button class="btn ${tipo==="entra"?"ok":""}" id="mcGuardar" style="width:100%">Registrar ${tipo==="entra"?"entrada":"salida"}</button>`;
  abrirDlg(); $("#mcVal").focus();
  $("#mcGuardar").onclick=async()=>{ const val=Number($("#mcVal").value), mot=$("#mcMot").value.trim();
    if(!(val>0)) return toast("Escribe un valor mayor a cero"); if(!mot) return toast("Escribe el motivo");
    const dia=$("#mcDia").value||hoy(); if(diaAntesDelArqueo(dia)) return;
    const b=$("#mcGuardar"); b.disabled=true; const nid=nuevoId();
    try{ await rawSet("cajamovs",nid,{id:nid,tipo,cat:"interna",cuentaId:id,personaId:"",valor:val,medio:$("#mcMedio").value,concepto:mot,fecha:fechaCaja(dia),porUid:uid||"",porNombre:miNombre()});
      registrar((tipo==="entra"?"Entrada de ":"Salida a ")+cu.nombre+": "+pesos(val)+" · "+mot); cerrarDlg(); toast((tipo==="entra"?"Entrada":"Salida")+" registrada"); }
    catch(e){ b.disabled=false; toast("No se pudo guardar"); } };
}
/* Compra por encargo o ganancia ocasional de un cliente, desde la pestaña Cuentas.
   mov: el movimiento a editar (solo administración). pre: lo que ya estaba escrito al volver de crear un cliente. */
function movClienteOficina(tipo,mov,pre){
  if(mov&&mueveCaja(mov)&&yaContado(mov.fecha)) return avisoContado();
  const cs=listaOrdenada(S.clientes,"nombre"), compra=tipo==="compra_cliente", pago=tipo==="pago_de_cliente", pagoA=tipo==="pago_a_cliente";
  const conMedio=compra||pago||pagoA, soloHoy=(pago||pagoA)&&!esAdmin; // los pagos que registra el asistente quedan con la hora del momento
  const miCaja=esAsistente&&uid?cajaOficina(uid).saldo:null;
  const v0=pre||(mov?{cid:mov.clienteId,val:mov.valor,medio:mov.medio,dia:diaDe(mov.fecha),nota:mov.nota}:{});
  const titulo=pago?(mov?"Editar pago":"Pago de un cliente"):pagoA?(mov?"Editar pago al cliente":"Pagarle a un cliente"):compra?(mov?"Editar compra":"Compra para un cliente"):(mov?"Editar ganancia ocasional":"Ganancia ocasional");
  $("#dlgCont").innerHTML=`<header><h2>${titulo}</h2><button class="cerrar" data-cerrar aria-label="Cerrar">×</button></header>
    ${mov?`<div class="campo"><label for="mxTipo">Tipo</label><select id="mxTipo">${MOVS_OFICINA.map(k=>`<option value="${k}"${k===tipo?" selected":""}>${MOVS[k].t}</option>`).join("")}</select></div>`:""}
    <p class="sub">${pago?"El dinero entra a la caja en el medio que elijas y se descuenta de lo que el cliente debe.":pagoA?"Le entregas al cliente su saldo a favor: sale de la caja en el medio que elijas y se descuenta de lo que JS le debe."+(miCaja?` Tienes ${Object.entries(MEDIOS).map(([k,t])=>t+" "+pesos(miCaja[k])).join(" · ")}.`:""):compra?"Sale de la caja y queda como deuda del cliente. En el pedido pon el domicilio y en “a cobrar” lo que se le cobra al destinatario; al entregar se compensa.":"Se le carga al cliente (queda por cobrar) y suma 100% al sueldo de JS ese día. Ej: $4.000 por punto extra."}</p>
    <div class="campo"><label for="mxCli">Cliente</label><div style="display:flex;gap:6px;margin-bottom:6px"><input id="mxBus" type="search" placeholder="Buscar cliente…" autocomplete="off" style="flex:1"><button class="btn sec chico" id="mxNuevoCli" type="button">+ Cliente nuevo</button></div><select id="mxCli"><option value="">Elige…</option>${cs.map(c=>`<option value="${esc(c.id)}">${esc(c.nombre)}</option>`).join("")}</select>
    <span class="sub" id="mxSaldo" style="display:block;margin-top:4px"></span></div>
    <div class="linea2"><div class="campo"><label for="mxVal">${pago?"Valor que pagó":pagoA?"Valor que le entregas":"Valor"}</label><input id="mxVal" type="number" inputmode="numeric" min="0" step="100" value="${Number(v0.val)||""}"></div>
    ${conMedio?`<div class="campo"><label for="mxMedio">${pago?"¿Cómo pagó?":pagoA?"¿Cómo le pagas?":"Pagado con"}</label><select id="mxMedio">${pago||pagoA?'<option value="">Elige…</option>':""}${Object.entries(MEDIOS).map(([k,t])=>`<option value="${k}">${t}</option>`).join("")}</select></div>`:""}</div>
    <div class="linea2">${soloHoy?"":`<div class="campo"><label for="mxDia">Día</label><input id="mxDia" type="date" value="${esc(v0.dia||hoy())}" max="${hoy()}"></div>`}
    <div class="campo"><label for="mxNota">Detalle</label><input id="mxNota" value="${esc(v0.nota||"")}" placeholder="${pago?"Ej: comprobante Nequi 4521":pagoA?"Ej: entregado en oficina":compra?"Ej: compra en almacén · guía JS-00120":"Ej: 3 puntos extra · guía JS-00120"}"></div></div>
    <button class="btn ok" id="mxGuardar" style="width:100%">${mov?"Guardar cambios":pago||pagoA?"Registrar pago":"Registrar"}</button>`;
  abrirDlg();
  const verSaldo=()=>{ const cid=$("#mxCli").value, s=cid?saldoCliente(cid):0, box=$("#mxSaldo");
    box.innerHTML=!cid?"":s<0?`<b class="neg">Debe ${pesos(-s)}</b>`:s>0?`<b class="pos">Tiene ${pesos(s)} a favor</b>`:"Está a paz y salvo";
    if(pago&&!mov&&cid&&s<0&&!$("#mxVal").value) $("#mxVal").value=-s;
    if(pagoA&&!mov&&cid&&s>0&&!$("#mxVal").value) $("#mxVal").value=s; };
  if(v0.cid) $("#mxCli").value=v0.cid;
  if(conMedio&&v0.medio) $("#mxMedio").value=v0.medio;
  verSaldo(); $("#mxCli").onchange=verSaldo;
  $("#mxBus").oninput=e=>{ const q=sinTildes(e.target.value.trim()), sel=$("#mxCli"); const vis=cs.filter(c=>!q||sinTildes(c.nombre+" "+(c.telefono||"")).includes(q));
    sel.innerHTML=`<option value="">${vis.length?"Elige…":"Ningún cliente con ese nombre"}</option>`+vis.map(c=>`<option value="${esc(c.id)}">${esc(c.nombre)}</option>`).join(""); if(vis.length===1&&q) sel.value=vis[0].id; verSaldo(); };
  const escrito=()=>({cid:$("#mxCli").value,val:$("#mxVal").value,medio:conMedio?$("#mxMedio").value:"",dia:$("#mxDia")?.value||"",nota:$("#mxNota").value});
  if(mov) $("#mxTipo").onchange=e=>movClienteOficina(e.target.value,mov,escrito());
  // Cliente que todavía no está registrado: se crea y se vuelve al formulario con lo que ya estaba escrito
  $("#mxNuevoCli").onclick=()=>{
    const antes=escrito(), nombre=$("#mxBus").value.trim();
    formCliente(null,async cid=>{ for(let i=0;i<12&&!S.clientes[cid];i++) await sleep(250); movClienteOficina(tipo,mov,{...antes,cid}); });
    if(nombre){ $("#cNom").value=nombre; $("#cTel").focus(); }
  };
  $("#mxGuardar").onclick=async()=>{ const cid=$("#mxCli").value, val=Number($("#mxVal").value), medio=conMedio?$("#mxMedio").value:"";
    if(!cid) return toast("Elige el cliente"); if(!(val>0)) return toast("Escribe un valor mayor a cero"); if(pago&&!medio) return toast("Elige cómo pagó"); if(pagoA&&!medio) return toast("Elige cómo le pagas");
    const dia=$("#mxDia")?.value||hoy(), caja=mueveCaja({tipo}); if(!soloHoy&&caja&&diaAntesDelArqueo(dia)) return;
    const b=$("#mxGuardar"); b.disabled=true;
    const datos={clienteId:cid,valor:val,medio,nota:$("#mxNota").value.trim(),fecha:soloHoy?Date.now():caja?fechaCaja(dia):fechaDia(dia)};
    try{ if(mov) await actualizar("movimientos",mov.id,{...datos,tipo});
      else { const id=nuevoId(); await guardar("movimientos",id,{id,tipo,...datos,porUid:uid||"",porNombre:miNombre()}); }
      cerrarDlg(); toast(mov?"Cambios guardados":pago?`Pago de ${pesos(val)} de ${nombreCliente(cid)} registrado`:pagoA?`Pago de ${pesos(val)} a ${nombreCliente(cid)} registrado`:compra?"Compra registrada":"Ganancia registrada"); }
    catch(e){ b.disabled=false; toast("No se pudo guardar"); } };
}

function pintarPersonal(v,aviso){
    const ms=listaOrdenada(S.mensajeros,"nombre").sort((a,b)=>Object.keys(TIPOS).indexOf(tipoDe(a))-Object.keys(TIPOS).indexOf(tipoDe(b)));
    v.innerHTML=aviso+`<h1>Personal</h1><p class="sub">Mensajeros y el dueño entregan pedidos desde la app. Patinadores y la empresa (JS) solo aparecen en Sueldos. Cuando un mensajero elige su nombre por primera vez, queda vinculado a su cuenta; “Liberar” le permite elegir de nuevo (por ejemplo, si cambió de celular o de cuenta).</p>
      <div class="linea2"><div class="campo"><label for="mNom">Nombre</label><input id="mNom"></div><div class="campo"><label for="mTel">Teléfono</label><input id="mTel" inputmode="tel"></div></div>
      <div class="linea2"><div class="campo"><label for="mTipoP">Tipo</label><select id="mTipoP">${Object.entries(TIPOS).map(([k,t])=>`<option value="${k}">${t}</option>`).join("")}</select></div>
      <div class="campo"><label for="mTar">Pago por día (patinadores y oficina)</label><input id="mTar" type="number" inputmode="numeric" step="1000" min="0" placeholder="70000"></div></div>
      <button class="btn" id="mAdd">Agregar</button>
      <h2>${ms.length} registrado${ms.length===1?"":"s"}</h2>
      ${ms.length?`<div class="tabla-env"><table><thead><tr><th>Nombre</th><th>Teléfono</th><th>Tipo</th><th class="n">Pago por día</th><th>Cuenta</th><th></th></tr></thead><tbody>${ms.map(m=>`<tr><td><b>${esc(m.nombre)}</b></td><td>${esc(m.telefono||"")}</td>
        <td><select data-tipo="${esc(m.id)}" aria-label="Tipo de ${esc(m.nombre)}">${Object.entries(TIPOS).map(([k,t])=>`<option value="${k}" ${tipoDe(m)===k?"selected":""}>${t}</option>`).join("")}</select></td>
        <td class="n">${["patinador","oficina"].includes(tipoDe(m))?`<input data-tar="${esc(m.id)}" type="number" step="1000" min="0" value="${Number(m.tarifa)||""}" style="width:110px" aria-label="Pago por día de ${esc(m.nombre)}">`:"—"}</td>
        <td>${!esRepartidor(m)?"—":vinculosDe(m.id).length?`<span class="etq ent">Vinculado${vinculosDe(m.id).length>1?" ×"+vinculosDe(m.id).length:""}</span> <button class="btn sec chico" data-liberar="${esc(m.id)}">Liberar</button>`:'<span class="sub">Sin vincular</span>'}</td>
        <td><button class="btn peligro chico" data-delm="${esc(m.id)}">Quitar</button></td></tr>`).join("")}</tbody></table></div>`:`<div class="vacio">Agrega a tu personal para empezar.</div>`}
      ${htmlAccesos()}`;
    $("#mAdd").onclick=async()=>{ const n=$("#mNom").value.trim(); if(!n) return toast("Escribe el nombre"); const id=nuevoId();
      try{ await guardar("mensajeros",id,{id,nombre:n,telefono:$("#mTel").value.trim(),tipo:$("#mTipoP").value,tarifa:Number($("#mTar").value)||0}); toast(n+" agregado"); }catch(e){toast("No se pudo guardar");} };
    v.querySelectorAll("[data-tipo]").forEach(sel=>sel.onchange=async()=>{ try{ await actualizar("mensajeros",sel.dataset.tipo,{tipo:sel.value}); toast("Tipo actualizado"); }catch(e){toast("No se pudo guardar");} });
    v.querySelectorAll("[data-tar]").forEach(inp=>inp.onchange=async()=>{ try{ await actualizar("mensajeros",inp.dataset.tar,{tarifa:Number(inp.value)||0}); toast("Pago por día actualizado"); }catch(e){toast("No se pudo guardar");} });
    v.querySelectorAll("[data-liberar]").forEach(b=>b.onclick=async()=>{ const id=b.dataset.liberar; if(!await confirmar("Liberar a "+S.mensajeros[id].nombre,"Se desvincula de la cuenta actual. La próxima persona que elija este nombre quedará vinculada.","Liberar")) return;
      try{ for(const vv of vinculosDe(id)) await borrar("vinculos",vv.uid); toast("Nombre liberado"); }catch(e){ toast("No se pudo liberar"); } });
    activarAccesos(v);
    v.querySelectorAll("[data-delm]").forEach(b=>b.onclick=async()=>{ const id=b.dataset.delm; if(!await confirmar("Quitar a "+S.mensajeros[id].nombre,"Ya no aparecerá en la lista de personal. Sus pedidos, pagos y movimientos anteriores se conservan.","Quitar")) return;
      try{ await borrar("mensajeros",id); for(const vv of vinculosDe(id)) await rawDel("vinculos",vv.uid).catch(()=>{}); if(miMensajero===id){ miMensajero=""; lsSet("js_mensajero",""); } toast("Persona quitada"); }catch(e){ toast("No se pudo quitar"); } });
  }

/* ---- accesos a la app (cuentas de correo y contraseña) ---- */
const ROLES={mensajero:"Mensajero",asistente:"Asistente",admin:"Administración",cliente:"Cliente"};
const ROLES_EQUIPO=Object.entries(ROLES).filter(([k])=>k!=="cliente");
const ROLES_AYUDA="Mensajero: solo sus pedidos, su caja y su sueldo. Asistente: trabaja en Oficina (pedidos, clientes, saldos y recibos); no ve caja, sueldos ni personal. Cliente: solo ve sus pedidos, sus pruebas de entrega y su saldo, sin editar nada. Administración: todo.";
function htmlAccesos(){
  const cu=window.plataforma?.cuentas; if(!cu||!esAdmin) return "";
  const us=listaOrdenada(S.usuarios,"nombre");
  const reps=listaOrdenada(S.mensajeros,"nombre").filter(esRepartidor);
  return `<h2>Accesos a la app</h2>
    <p class="sub">Cada persona entra con su correo y contraseña. Si eliges su nombre de Personal, queda vinculada de una vez. ${ROLES_AYUDA}</p>
    <div class="linea2"><div class="campo"><label for="acNom">Nombre</label><input id="acNom"></div><div class="campo"><label for="acEmail">Correo</label><input id="acEmail" type="email" autocomplete="off"></div></div>
    <div class="linea2"><div class="campo"><label for="acClave">Contraseña inicial (mínimo 6)</label><input id="acClave" type="text" autocomplete="off" minlength="6"></div>
    <div class="campo"><label for="acRol">Rol</label><select id="acRol">${Object.entries(ROLES).map(([k,t])=>`<option value="${k}">${t}</option>`).join("")}</select></div>
    <div class="campo" id="acMenC"><label for="acMen">Nombre en Personal</label><select id="acMen"><option value="">— Ninguno —</option>${reps.map(m=>`<option value="${esc(m.id)}">${esc(m.nombre)}</option>`).join("")}</select></div>
    <div class="campo oculto" id="acCliC"><label for="acCli">Cliente</label><select id="acCli"><option value="">Elige…</option>${listaOrdenada(S.clientes,"nombre").map(c=>`<option value="${esc(c.id)}">${esc(c.nombre)}</option>`).join("")}</select></div></div>
    <button class="btn" id="acCrear">Crear acceso</button>
    ${us.length?`<div class="tabla-env" style="margin-top:14px"><table><thead><tr><th>Nombre</th><th>Correo</th><th>Rol</th><th>Personal</th><th></th></tr></thead><tbody>${us.map(u=>`<tr><td><b>${esc(u.nombre||"")}</b>${u.uid===uid?' <span class="etq ent">Tú</span>':""}</td><td>${esc(u.email||"")}</td><td>${u.uid===uid||u.rol==="cliente"?ROLES[u.rol]||esc(u.rol||""):`<select data-rolde="${esc(u.uid)}" aria-label="Rol de ${esc(u.nombre||"")}">${ROLES_EQUIPO.map(([k,t])=>`<option value="${k}" ${u.rol===k?"selected":""}>${t}</option>`).join("")}</select>`}</td>
      <td>${u.rol==="cliente"?"Cliente: "+esc(S.clientes[u.clienteId]?.nombre||"(no existe)"):`<select data-vinc="${esc(u.uid)}" aria-label="Nombre en Personal de ${esc(u.nombre||"")}"><option value="">— Ninguno —</option>${reps.map(m=>`<option value="${esc(m.id)}" ${S.vinculos[u.uid]?.mensajeroId===m.id?"selected":""}>${esc(m.nombre)}</option>`).join("")}</select>`}</td>
      <td><button class="btn sec chico" data-clave="${esc(u.email||"")}">Cambiar contraseña</button>${u.uid!==uid?` <button class="btn peligro chico" data-sinacc="${esc(u.uid)}">Quitar acceso</button>`:""}</td></tr>`).join("")}</tbody></table></div>`:""}`;
}
function activarAccesos(v){
  const cu=window.plataforma?.cuentas, bc=$("#acCrear"); if(!cu||!bc) return;
  $("#acMen").onchange=e=>{ const n=$("#acNom"); if(!n.value&&e.target.value) n.value=S.mensajeros[e.target.value]?.nombre||""; };
  $("#acCli").onchange=e=>{ const n=$("#acNom"); if(!n.value&&e.target.value) n.value=S.clientes[e.target.value]?.nombre||""; };
  $("#acRol").onchange=e=>{ const cl=e.target.value==="cliente"; $("#acCliC").classList.toggle("oculto",!cl); $("#acMenC").classList.toggle("oculto",cl); };
  bc.onclick=async()=>{
    const nombre=$("#acNom").value.trim(), email=$("#acEmail").value.trim().toLowerCase(), clave=$("#acClave").value, rol=$("#acRol").value;
    const clienteId=rol==="cliente"?$("#acCli").value:"", mensajeroId=rol==="cliente"?"":$("#acMen").value;
    if(!nombre||!email) return toast("Escribe el nombre y el correo"); if(clave.length<6) return toast("La contraseña debe tener al menos 6 caracteres");
    if(rol==="cliente"&&!clienteId) return toast("Elige a qué cliente corresponde este acceso");
    if(mensajeroId&&vinculosDe(mensajeroId).length) return toast("Ese nombre ya está vinculado. Libéralo primero en la tabla de arriba.");
    bc.disabled=true;
    try{ await cu.crear({email,clave,nombre,rol,mensajeroId,clienteId}); registrar("Creó acceso para "+nombre+" ("+email+")"); toast("Acceso creado. Entrega a "+nombre+" su correo y contraseña."); }
    catch(e){ console.error(e); const c=e?.code||""; toast(c.includes("email-already-in-use")?"Ese correo ya tiene una cuenta":c.includes("invalid-email")?"El correo no es válido":c.includes("weak-password")?"Contraseña muy corta":"No se pudo crear el acceso"); bc.disabled=false; }
  };
  v.querySelectorAll("[data-rolde]").forEach(sel=>sel.onchange=async()=>{ const id=sel.dataset.rolde, u=S.usuarios[id], nuevo=sel.value;
    if(!await confirmar("Cambiar el rol de "+(u?.nombre||u?.email||""),"Pasará a "+ROLES[nuevo]+". El cambio se aplica la próxima vez que abra la app.","Cambiar rol")){ sel.value=u?.rol||"mensajero"; return; }
    try{ await cu.cambiarRol(id,nuevo); registrar("Cambió el rol de "+(u?.nombre||"")+" a "+ROLES[nuevo]); toast("Rol actualizado"); }catch(e){ console.error(e); sel.value=u?.rol||"mensajero"; toast("No se pudo cambiar el rol"); } });
  v.querySelectorAll("[data-vinc]").forEach(sel=>sel.onchange=async()=>{ const id=sel.dataset.vinc, mid=sel.value, u=S.usuarios[id];
    const otro=mid&&vinculosDe(mid).find(x=>x.uid!==id); if(otro){ toast("Ese nombre ya está vinculado a otra cuenta. Cámbialo allá primero."); sel.value=S.vinculos[id]?.mensajeroId||""; return; }
    try{ await cu.vincular(id,mid); registrar(mid?"Vinculó a "+(u?.nombre||"")+" con "+(S.mensajeros[mid]?.nombre||""):"Desvinculó a "+(u?.nombre||"")); toast(mid?"Vinculado. Se aplica la próxima vez que abra la app.":"Vínculo quitado"); }catch(e){ console.error(e); toast("No se pudo cambiar el vínculo"); } });
  v.querySelectorAll("[data-clave]").forEach(b=>b.onclick=async()=>{ const em=b.dataset.clave; if(!em) return;
    if(!await confirmar("Cambiar contraseña de "+em,"Le llegará un correo con un enlace para crear una contraseña nueva.","Enviar correo")) return;
    try{ await cu.cambiarClave(em); toast("Correo enviado a "+em); }catch(e){ toast("No se pudo enviar el correo"); } });
  v.querySelectorAll("[data-sinacc]").forEach(b=>b.onclick=async()=>{ const id=b.dataset.sinacc, u=S.usuarios[id];
    if(!await confirmar("Quitar acceso a "+(u?.nombre||u?.email||""),"Esa cuenta ya no podrá entrar a la app. Sus pedidos y registros anteriores se conservan.","Quitar acceso")) return;
    try{ await cu.quitar(id); registrar("Quitó acceso a "+(u?.nombre||"")+" ("+(u?.email||"")+")"); toast("Acceso quitado"); }catch(e){ toast("No se pudo quitar el acceso"); } });
}

/* Cambio: el mensajero recibió una prenda de vuelta para el remitente; queda pendiente hasta que el cliente la reciba. */
const cambioPendiente = p => !!p.cambio && !p.cambioRecibido;
const sinServicio = p => p.estado==="entregado" && !!p.clienteId && !Number(p.valorServicio); // el saldo del cliente queda mal
const etqCambio = p => p.cambio ? (p.cambioRecibido?' <span class="etq ent">Cambio recibido</span>':' <span class="etq sin">Cambio por entregar</span>') : "";
const etqEstado = p => p.estado==="entregado" ? '<span class="etq ent">Entregado</span>' : p.estado==="devuelto" ? '<span class="etq dev">Devuelto</span>' : '<span class="etq pend">Por entregar</span>'+((p.intentos||[]).length?` <span class="etq sin">${p.intentos.length} intento${p.intentos.length===1?"":"s"}</span>`:"");
function filaPedido(p){
  const est = etqEstado(p)+etqCambio(p)+(Number(p.difCobro)?` <span class="etq sin">Diferencia ${pesos(p.difCobro)}</span>`:"");
  const cli = p.clienteId ? esc(nombreCliente(p.clienteId)) : `<span class="etq sin">Sin remitente</span>`;
  return `<button class="fila" data-ped="${esc(p.guia)}">${fotoSegura(p.mini)?`<img src="${fotoSegura(p.mini)}" alt="">`:'<span class="sinfoto"></span>'}
    <span class="info"><span class="guia">${esc(p.guia)}</span> ${est}<p>${cli} · ${esc(S.mensajeros[p.mensajeroId]?.nombre||"")} · ${hora(p.creado)}</p></span>
    <span class="n" style="text-align:right;font-weight:700">${p.estado==="entregado"?pesos(p.valorCobrado):""}</span></button>`;
}

/* Al reabrir un pedido, su foto y firma pasan a "previas" (en el mismo documento de entregas) en vez de borrarse. */
async function guardarPruebaAnterior(p){
  const e=await leer("entregas",p.guia); if(!e||(!e.foto&&!e.firma)) return;
  const previas=[...(e.previas||[]),{foto:e.foto||"",firma:e.firma||"",estado:p.estado,fecha:p.entregado||0,destinatario:p.destinatario||"",
    valorCobrado:Number(p.valorCobrado)||0,metodo:p.metodo||"",motivoDev:p.motivoDev||"",notaDev:p.notaDev||"",reabierto:Date.now()}];
  while(previas.length>1&&JSON.stringify(previas).length>850000) previas.shift(); // límite de tamaño de un documento
  await rawSet("entregas",p.guia,{previas});
  registrar("Reabrió "+p.guia+" (se guardaron las pruebas de la entrega anterior)");
}
const previasFotos = e => (e?.previas||[]).slice().reverse().flatMap(x=>{ const t=(x.estado==="devuelto"?"Devolución anterior":"Entrega anterior")+(x.fecha?" · "+hora(x.fecha):x.reabierto?" · reabierto "+hora(x.reabierto):"")+(x.destinatario?" · "+x.destinatario:"");
  return [[t,x.foto],["Firma · "+t,x.firma]]; });

async function abrirPedido(guia, cliElegido){
  const p=S.pedidos[guia]; if(!p) return;
  const cs=listaOrdenada(S.clientes,"nombre");
  const c=$("#dlgCont");
  c.innerHTML=`<header><div><h2 class="guia">${esc(guia)}</h2>${etqEstado(p)}</div><button class="cerrar" data-cerrar aria-label="Cerrar">×</button></header>
  <div class="linea2">
    <div class="campo"><label for="pCli">Remitente (cliente)</label><input id="pCliBuscar" type="search" placeholder="Buscar cliente…" autocomplete="off" aria-label="Buscar cliente"><select id="pCli"><option value="">Elige…</option>${cs.map(x=>`<option value="${esc(x.id)}" ${x.id===(cliElegido||p.clienteId)?"selected":""}>${esc(x.nombre)}</option>`).join("")}</select><button class="btn sec chico" id="pNuevoCli" type="button" style="align-self:start">+ Crear cliente nuevo</button></div>
    <div class="campo"><label for="pServ">Valor del servicio</label><input id="pServ" type="number" inputmode="numeric" min="0" step="100" value="${Number(p.valorServicio)||S.clientes[cliElegido||p.clienteId]?.tarifa||""}"></div>
  </div>
  <div class="campo"><label for="pCob">Valor a cobrar al destinatario (opcional)</label><input id="pCob" type="number" inputmode="numeric" min="0" step="100" value="${Number(p.aCobrar)||""}" placeholder="Lo que el mensajero debe recoger"></div>
  ${p.estado==="devuelto"?`<label class="check"><input type="checkbox" id="pDev" ${p.cobrarDev?"checked":""}> Cobrarle al cliente el domicilio de esta devolución</label>`:""}
  ${p.estado==="entregado"&&esAdmin?`<div class="linea2"><div class="campo"><label for="pValCob">Valor que cobró el mensajero</label><input id="pValCob" type="number" inputmode="numeric" min="0" step="100" value="${Number(p.valorCobrado)||0}"></div>
    <div class="campo"><label for="pMet">Cómo se lo pagaron</label><select id="pMet">${Object.entries(METODOS).map(([k,x])=>`<option value="${k}" ${p.metodo===k?"selected":""}>${x.t}</option>`).join("")}</select></div></div>
    ${pedidoLiquidado(p)?`<p class="sub" style="margin-top:-6px">Esta entrega ya está en una liquidación cerrada de ${esc(S.mensajeros[p.mensajeroId]?.nombre||"el mensajero")}: si la corriges, la diferencia pasa sola a lo que debe en su período abierto (“Correcciones a liquidaciones cerradas”).</p>`:""}`:""}
  ${p.estado==="entregado"&&(p.metodo==="transf_js"||esAdmin)?`<div class="campo ${p.metodo==="transf_js"?"":"oculto"}" id="pCtaBox"><label for="pCta">Cuenta de JS donde llegó la transferencia</label><select id="pCta"><option value="">Sin especificar</option>${Object.entries(CUENTAS_JS).map(([k,t])=>`<option value="${k}" ${p.cuentaJs===k?"selected":""}>${t}</option>`).join("")}</select></div>`:""}
  <div class="linea2"><div class="campo"><label for="pGasto">Flete / gasto pagado por el mensajero (se le cobra al cliente)</label><input id="pGasto" type="number" inputmode="numeric" min="0" step="1000" value="${gastoDe(p)||""}" placeholder="0"></div>
  <div class="campo"><label for="pGastoNota">Detalle del gasto</label><input id="pGastoNota" value="${esc(p.gastoNota||"")}" placeholder="Ej: bus a Pasto"></div></div>
  <label class="check"><input type="checkbox" id="pDomi" ${p.domiPagado?"checked":""}> El cliente ya pagó el domicilio</label>
  <div class="linea2 ${p.domiPagado?"":"oculto"}" id="pDomiBox"><div class="campo"><label for="pDomiMedio">¿Cómo pagó? (entra a la caja)</label><select id="pDomiMedio">${p.domiPagado&&!p.domiPagoMedio?'<option value="">No registrado en caja</option>':'<option value="">Elige…</option>'}${Object.entries(MEDIOS).map(([k,t])=>`<option value="${k}" ${p.domiPagoMedio===k?"selected":""}>${t}</option>`).join("")}</select></div>
  <div class="campo"><label for="pDomiVal">Valor que pagó</label><input id="pDomiVal" type="number" inputmode="numeric" min="0" step="100" value="${p.domiPagado?pagoDomi(p):""}"></div></div>
  <button class="btn" id="pGuardar">Guardar</button>
  <dl class="datos" style="margin-top:18px">
    ${p.cambio?`<dt>Cambio</dt><dd>${p.cambioRecibido?"El cliente lo recibió "+hora(p.cambioRecibido):"Prenda por entregar al cliente"}</dd>`:""}
    <dt>Mensajero</dt><dd>${esc(S.mensajeros[p.mensajeroId]?.nombre||"—")}</dd>
    <dt>Salió</dt><dd>${hora(p.creado)}</dd>
    ${(p.intentos||[]).map((i,k)=>`<dt>Intento ${k+1}</dt><dd>${hora(i.fecha)} · ${esc(MOTIVOS[i.motivo]||"")}${i.nota?" · "+esc(i.nota):""}</dd>`).join("")}
    ${p.estado==="devuelto"?`<dt>Devuelto</dt><dd>${hora(p.entregado)}</dd><dt>Motivo</dt><dd>${esc(MOTIVOS[p.motivoDev]||"")}${p.notaDev?" · "+esc(p.notaDev):""}</dd><dt>Efecto en saldo</dt><dd class="${saldoPedido(p)<0?"neg":""}">${pesos(saldoPedido(p))}</dd>`:""}
    ${p.estado==="entregado"&&Number(p.difCobro)?`<dt>Debía cobrar</dt><dd>${pesos(p.aCobrar)}</dd><dt>Diferencia</dt><dd class="neg">${pesos(p.difCobro)}${p.difRevisada?" (revisada)":""}</dd>`:""}
    ${p.estado==="entregado"?`<dt>Entregado</dt><dd>${hora(p.entregado)}</dd><dt>Recibió</dt><dd>${esc(p.destinatario)}</dd>
    <dt>Cobrado</dt><dd>${pesos(p.valorCobrado)}</dd><dt>Método</dt><dd>${metodoTxt(p)}</dd>
    ${p.domiPagado?`<dt>Pago de domicilio</dt><dd>${pesos(pagoDomi(p))}${p.domiPagoMedio?" · "+MEDIOS[p.domiPagoMedio]+" · "+hora(p.domiPagoFecha):" · sin registrar en caja"}</dd>`:""}
    <dt>Efecto en saldo</dt><dd class="${saldoPedido(p)<0?"neg":"pos"}">${pesos(saldoPedido(p))}</dd>`:""}
  </dl>
  <div class="fotos" id="pFotos"><span class="sub">Cargando fotos…</span></div>
  <div class="acciones">${!cerrado(p)&&tipoDe(S.mensajeros[p.mensajeroId])==="oficina"?'<button class="btn ok chico" id="pEntregar">Marcar entregado</button>':""}${cerrado(p)?(esAdmin?'<button class="btn sec chico" id="pReabrir">Devolver a por entregar</button>':""):'<button class="btn sec chico" id="pNoEnt">Registrar que no se pudo entregar</button>'}${Number(p.difCobro)&&!p.difRevisada?'<button class="btn sec chico" id="pDifOk">Marcar diferencia como revisada</button>':""}${cambioPendiente(p)?'<button class="btn sec chico" id="pCambioOk">Cambio entregado al cliente</button>':""}${esAdmin?'<button class="btn peligro chico" id="pBorrar">Eliminar pedido</button>':""}</div>`;
  abrirDlg();
  $("#pNuevoCli").onclick=()=>{ const sv=$("#pServ").value; formCliente(null, cid=>{ abrirPedido(guia, cid).then(()=>{ if(sv) $("#pServ").value=sv; }); }); };
  const pm=$("#pMet"); if(pm) pm.onchange=()=>$("#pCtaBox").classList.toggle("oculto",pm.value!=="transf_js");
  $("#pCli").onchange=e=>{ const t=S.clientes[e.target.value]?.tarifa; if(t && !$("#pServ").value) $("#pServ").value=t; };
  $("#pCliBuscar").oninput=e=>{ // filtra la lista; si queda un solo cliente, lo elige
    const q=sinTildes(e.target.value.trim()), sel=$("#pCli"), actual=sel.value;
    const vis=cs.filter(x=>!q||sinTildes(x.nombre+" "+(x.telefono||"")).includes(q));
    sel.innerHTML=`<option value="">${vis.length?(q?vis.length+" encontrado"+(vis.length===1?"":"s")+"…":"Elige…"):"Ningún cliente con ese nombre"}</option>`+vis.map(x=>`<option value="${esc(x.id)}" ${x.id===actual?"selected":""}>${esc(x.nombre)}</option>`).join("");
    if(vis.length===1&&q){ sel.value=vis[0].id; sel.onchange({target:sel}); } };
  $("#pDomi").onchange=e=>{ $("#pDomiBox").classList.toggle("oculto",!e.target.checked); if(e.target.checked&&!$("#pDomiVal").value) $("#pDomiVal").value=(Number($("#pServ").value)||0)+(Number($("#pGasto").value)||0)||""; };
  $("#pGuardar").onclick=async()=>{ const cid=$("#pCli").value; if(!cid) return toast("Elige el remitente");
    const datos={clienteId:cid,clienteNombre:S.clientes[cid]?.nombre||"",valorServicio:Number($("#pServ").value)||0,domiPagado:$("#pDomi").checked,aCobrar:Number($("#pCob").value)||0,
      gasto:Math.max(0,Number($("#pGasto").value)||0),gastoNota:$("#pGastoNota").value.trim()};
    if(datos.domiPagado){ const medio=$("#pDomiMedio").value, val=Number($("#pDomiVal").value)||0, antiguo=p.domiPagado&&!p.domiPagoMedio;
      if(!medio&&!antiguo) return toast("Elige cómo pagó el domicilio"); if(!(val>0)) return toast("Escribe el valor que pagó");
      Object.assign(datos,{domiPagoMedio:medio,domiPagoValor:val,domiPagoFecha:p.domiPagado&&p.domiPagoFecha?p.domiPagoFecha:Date.now(),domiPagoUid:p.domiPagado?(p.domiPagoUid||""):(uid||"")}); }
    else Object.assign(datos,{domiPagoMedio:"",domiPagoValor:"",domiPagoFecha:0});
    if($("#pDev")) datos.cobrarDev=$("#pDev").checked; if($("#pCta")) datos.cuentaJs=$("#pCta").value;
    if($("#pValCob")){ // corrección de lo que cobró el mensajero (se revisa abajo contra el arqueo) (solo administración); la diferencia se recalcula igual que al entregar
      const v=Number($("#pValCob").value), met=$("#pMet").value; if($("#pValCob").value===""||v<0) return toast("Escribe el valor cobrado (0 si no cobró)");
      const dif=datos.aCobrar?v-(met==="transf_cliente"?0:datos.aCobrar):0;
      Object.assign(datos,{valorCobrado:v,metodo:met,cuentaJs:met==="transf_js"?datos.cuentaJs||"":"",difCobro:dif});
      if(dif!==(Number(p.difCobro)||0)) datos.difRevisada=false; }
    if(cambiaLoContado(p,{...p,...datos})) return avisoContado();
    try{ await actualizar("pedidos",guia,datos); toast("Guía "+guia+" actualizada"); cerrarDlg(); }catch(e){toast("No se pudo guardar");} };
  if($("#pBorrar")) $("#pBorrar").onclick=async()=>{ if(cambiaLoContado(p,null)) return avisoContado(); if(!await confirmar("Eliminar la guía "+guia,"Se borran el pedido y sus fotos. No se puede deshacer.","Eliminar")) return abrirPedido(guia);
    const grupo=nuevoId(); try{ await borrar("pedidos",guia,{grupo}); await borrar("fotos",guia,{grupo}).catch(()=>{}); await borrar("entregas",guia,{grupo}).catch(()=>{}); cerrarDlg(); toast("Guía enviada a la papelera"); }catch(e){ toast("No se pudo eliminar"); } };
  const ne=$("#pNoEnt"); if(ne) ne.onclick=()=>abrirDevolucion(guia);
  const pe=$("#pEntregar"); if(pe) pe.onclick=()=>abrirEntrega(guia);
  const pc=$("#pCambioOk"); if(pc) pc.onclick=async()=>{ if(!await confirmar("Cambio de "+guia+" entregado","Se marca que el cliente ya recibió la prenda de cambio.","Marcar entregado")) return abrirPedido(guia);
    try{ await actualizar("pedidos",guia,{cambioRecibido:Date.now(),cambioConfirmo:uid||""}); toast("Cambio marcado como entregado"); abrirPedido(guia); }catch(e){ toast("No se pudo guardar"); } };
  const dk=$("#pDifOk"); if(dk) dk.onclick=async()=>{ try{ await actualizar("pedidos",guia,{difRevisada:true}); abrirPedido(guia); }catch(e){ toast("No se pudo guardar"); } };
  const rb=$("#pReabrir"); if(rb) rb.onclick=async()=>{ if(cambiaLoContado(p,{...p,estado:"pendiente",metodo:""})) return avisoContado(); if(!await confirmar("Reabrir la guía "+guia,"El pedido volverá a por entregar. La foto y la firma de esta entrega se guardan en el pedido como “entrega anterior”.","Reabrir")) return abrirPedido(guia);
    try{ await guardarPruebaAnterior(p); }catch(e){ return toast("No se pudieron guardar las pruebas de entrega. No se reabrió."); }
    try{ await actualizar("pedidos",guia,{estado:"pendiente",entregado:null,destinatario:"",valorCobrado:0,metodo:"",cuentaJs:"",difCobro:0,difRevisada:false,motivoDev:"",notaDev:"",cobrarDev:false}); toast("Guía "+guia+" reabierta"); cerrarDlg(); }
    catch(e){ toast("No se pudo reabrir"); } };
  try{
    const [f,e]=await Promise.all([leer("fotos",guia), leer("entregas",guia).catch(()=>null)]);
    const box=$("#pFotos"); if(!box) return;
    const items=[["Salida",f?.salida],...(cerrado(p)?[[p.estado==="devuelto"?"Evidencia":"Entrega",e?.foto],["Firma",e?.firma]]:[]),...previasFotos(e)].map(([t,x])=>[t,fotoSegura(x)]).filter(([,x])=>x);
    box.innerHTML=items.length?items.map(([t,s])=>`<figure><img src="${s}" alt="${esc(t)}"><figcaption>${esc(t)}</figcaption></figure>`).join(""):'<span class="sub">Sin fotos.</span>';
  }catch(err){ const box=$("#pFotos"); if(box) box.innerHTML='<span class="sub">No se pudieron cargar las fotos.</span>'; }
}

function formCliente(id, alGuardar){
  const c=id?S.clientes[id]:{};
  $("#dlgCont").innerHTML=`<header><h2>${id?"Editar cliente":"Nuevo cliente"}</h2><button class="cerrar" data-cerrar aria-label="Cerrar">×</button></header>
    <div class="campo"><label for="cNom">Nombre</label><input id="cNom" autocomplete="off" value="${esc(c.nombre||"")}"></div>
    <div class="campo"><label for="cTel">Número de celular</label><input id="cTel" type="tel" inputmode="tel" autocomplete="off" value="${esc(c.telefono||"")}"></div>
    <div class="campo"><label for="cTar">Valor del domicilio de este cliente (opcional)</label><input id="cTar" type="number" inputmode="numeric" min="0" step="100" value="${Number(c.tarifa)||""}" placeholder="Se llena solo al asignarle una guía"></div>
    <button class="btn" id="cGuardar" style="width:100%">Guardar cliente</button>`;
  abrirDlg(); $("#cNom").focus();
  $("#cGuardar").onclick=async()=>{ const n=$("#cNom").value.trim(), t=$("#cTel").value.trim();
    if(!n) return toast("Escribe el nombre"); if(!t) return toast("Escribe el número");
    const cid=id||nuevoId();
    try{ await guardar("clientes",cid,{id:cid,nombre:n,telefono:t,tarifa:Number($("#cTar").value)||0}); toast("Cliente "+n+" guardado");
      if(id&&c.nombre!==n) for(const p of Object.values(S.pedidos)) if(p.clienteId===cid&&p.estado==="pendiente") rawUpd("pedidos",p.guia,{clienteNombre:n}).catch(()=>{});
      if(alGuardar) setTimeout(()=>alGuardar(cid),150); else cerrarDlg(); }catch(e){toast("No se pudo guardar");} };
}

/* Registrar que el cliente pagó el domicilio de una guía: cómo y cuánto; entra a la caja. */
function pagoDomicilio(guia,despues){
  const p=S.pedidos[guia]; if(!p) return;
  $("#dlgCont").innerHTML=`<header><div><h2>Pago del domicilio</h2><span class="sub guia">${esc(guia)}</span></div><button class="cerrar" data-cerrar aria-label="Cerrar">×</button></header>
    <p class="sub">Domicilio ${pesos(servicio(p))}${gastoDe(p)?" + flete "+pesos(gastoDe(p)):""}. El valor entra a la caja.</p>
    <div class="linea2"><div class="campo"><label for="dpMedio">¿Cómo pagó?</label><select id="dpMedio"><option value="">Elige…</option>${Object.entries(MEDIOS).map(([k,t])=>`<option value="${k}">${t}</option>`).join("")}</select></div>
    <div class="campo"><label for="dpVal">Valor que pagó</label><input id="dpVal" type="number" inputmode="numeric" min="0" step="100" value="${cargoEnvio(p)||""}"></div></div>
    <button class="btn ok" id="dpGuardar" style="width:100%">Registrar pago</button>`;
  abrirDlg();
  $("#dpGuardar").onclick=async()=>{ const medio=$("#dpMedio").value, val=Number($("#dpVal").value)||0;
    if(!medio) return toast("Elige cómo pagó"); if(!(val>0)) return toast("Escribe el valor que pagó");
    const b=$("#dpGuardar"); b.disabled=true;
    try{ await actualizar("pedidos",guia,{domiPagado:true,domiPagoMedio:medio,domiPagoValor:val,domiPagoFecha:Date.now(),domiPagoUid:uid||""}); toast("Pago de "+pesos(val)+" registrado"); setTimeout(despues,200); }
    catch(e){ b.disabled=false; toast("No se pudo guardar"); } };
}
/* Mensaje de WhatsApp con el saldo del cliente y lo que lo forma desde la última vez que quedó en cero. */
function textoSaldo(cid){
  const c=S.clientes[cid], s=saldoCliente(cid); if(!c) return "";
  const asc=filasCuenta(cid).slice().reverse(); let acum=0, desde=0;
  asc.forEach((r,i)=>{ acum+=r.v; if(Math.round(acum)===0) desde=i+1; });
  const abiertas=asc.slice(desde), MAX=25;
  const L=[`*${EMPRESA.nombre}*`,`Hola ${c.nombre} 👋`,""];
  if(s<0) L.push(`Según nuestro registro tienes un saldo *pendiente por pagar de ${pesos(-s)}*.`);
  else if(s>0) L.push(`Según nuestro registro tienes un saldo *a tu favor de ${pesos(s)}* que JS Logistics te debe entregar.`);
  else L.push("Tu cuenta está a paz y salvo. ¡Gracias!");
  if(s&&abiertas.length){ L.push("","*Detalle:*");
    abiertas.slice(-MAX).forEach(r=>L.push(`• ${new Date(r.fecha).toLocaleDateString("es-CO",{day:"2-digit",month:"short"})} · ${r.det} → ${r.v<0?"− ":"+ "}${pesos(Math.abs(r.v))}`));
    if(abiertas.length>MAX) L.push(`(y ${abiertas.length-MAX} movimientos anteriores)`);
    L.push("",s<0?`*Total a pagar: ${pesos(-s)}*`:`*Total a tu favor: ${pesos(s)}*`); }
  if(s<0) L.push("",...PAGOS_TEXTO);
  L.push("",s<0?"Quedamos atentos a tu pago. Si ya lo hiciste, por favor envíanos el comprobante.":s>0?"Cuéntanos cómo prefieres recibirlo.":"","",EMPRESA.lema,EMPRESA.tel);
  return L.filter((x,i,a)=>!(x===""&&a[i-1]==="")).join("\n");
}
const linkSaldo = cid => linkWhatsApp(S.clientes[cid]?.telefono,textoSaldo(cid));
const ENVIADOS_K = () => "js_wa_saldos_"+hoy();
function enviadosHoy(){ try{ return new Set(JSON.parse(lsGet(ENVIADOS_K())||"[]")); }catch(e){ return new Set(); } }
function marcarEnviado(cid){ const e=enviadosHoy(); e.add(cid); lsSet(ENVIADOS_K(),JSON.stringify([...e])); registrar("Envió saldo por WhatsApp a "+nombreCliente(cid)+" ("+pesos(saldoCliente(cid))+")"); }

/* Envío en cadena: WhatsApp no permite mandar mensajes solos desde una página, así que se abre un chat tras otro. */
let tipoMasivo="cobrar";
function envioMasivo(tipo){
  tipoMasivo=tipo||tipoMasivo;
  const env=enviadosHoy();
  const lista=listaOrdenada(S.clientes,"nombre").map(c=>({...c,s:saldoCliente(c.id)})).filter(c=>tipoMasivo==="cobrar"?c.s<0:c.s>0);
  const conTel=lista.filter(c=>telWhatsApp(c.telefono)), sinTel=lista.filter(c=>!telWhatsApp(c.telefono));
  const pend=conTel.filter(c=>!env.has(c.id)), sig=pend[0];
  $("#dlgCont").innerHTML=`<header><div><h2>Enviar saldos por WhatsApp</h2><span class="sub">${conTel.length-pend.length} de ${conTel.length} enviados hoy</span></div><button class="cerrar" data-cerrar aria-label="Cerrar">×</button></header>
    <div class="filtros">${[["cobrar","Clientes que deben"],["pagar","Saldos a favor"]].map(([k,t])=>`<button data-tm="${k}" aria-pressed="${tipoMasivo===k}">${t}</button>`).join("")}</div>
    <p class="sub">Toca “Enviar al siguiente”: se abre el chat con el mensaje listo; envíalo en WhatsApp y vuelve aquí para el próximo.</p>
    ${sig?`<a class="btn ok" id="waSig" style="width:100%" href="${linkSaldo(sig.id)}" target="_blank" rel="noopener">Enviar al siguiente: ${esc(sig.nombre)} (${pesos(Math.abs(sig.s))})</a>`:`<div class="vacio">${conTel.length?"¡Listo! Ya se envió a todos.":"No hay clientes en esta lista."}</div>`}
    ${conTel.length?`<div class="tabla-env" style="margin-top:12px"><table><thead><tr><th>Cliente</th><th class="n">Saldo</th><th></th></tr></thead><tbody>${conTel.map(c=>`<tr><td><b>${esc(c.nombre)}</b></td><td class="n ${c.s<0?"neg":"pos"}">${pesos(Math.abs(c.s))}</td><td>${env.has(c.id)?'<span class="etq ent">✓ Enviado</span> ':""}<a class="btn sec chico" data-wa="${esc(c.id)}" href="${linkSaldo(c.id)}" target="_blank" rel="noopener">${env.has(c.id)?"Reenviar":"Enviar"}</a></td></tr>`).join("")}</tbody></table></div>`:""}
    ${sinTel.length?`<div class="aviso" style="margin-top:12px">Sin celular registrado: ${sinTel.map(c=>esc(c.nombre)).join(", ")}.</div>`:""}
    ${env.size?`<div class="acciones"><button class="btn sec chico" id="waReiniciar">Volver a empezar la lista de hoy</button></div>`:""}`;
  abrirDlg();
  $("#dlgCont").querySelectorAll("[data-tm]").forEach(b=>b.onclick=()=>envioMasivo(b.dataset.tm));
  const tras=cid=>{ marcarEnviado(cid); setTimeout(()=>envioMasivo(),300); };
  const ws=$("#waSig"); if(ws) ws.onclick=()=>tras(sig.id);
  $("#dlgCont").querySelectorAll("[data-wa]").forEach(a=>a.onclick=()=>tras(a.dataset.wa));
  const wr=$("#waReiniciar"); if(wr) wr.onclick=()=>{ lsSet(ENVIADOS_K(),"[]"); envioMasivo(); };
}

function filasCuenta(cid){
  const ps=Object.values(S.pedidos).filter(p=>p.clienteId===cid&&cerrado(p)).map(p=>({fecha:p.entregado,det:`${p.guia} · ${p.destinatario||""} · ${metodoTxt(p)} · cobró ${pesos(p.valorCobrado)} · ${textoDomi(p)}`,v:saldoPedido(p),pid:p.guia,dp:!!p.domiPagado,nom:p.destinatario||(p.estado==="devuelto"?"Devolucion":"")}));
  const ms=Object.values(S.movimientos).filter(m=>m.clienteId===cid).map(m=>({fecha:m.fecha,det:(MOVS[m.tipo]?.corto||"Movimiento")+(m.nota?" · "+m.nota:""),v:signoMov(m),mid:m.id,nom:(MOVS[m.tipo]?.corto||"Movimiento")+(m.nota?" "+m.nota:"")}));
  return [...ps,...ms].sort((a,b)=>b.fecha-a.fecha);
}
function abrirCuenta(cid){
  const c=S.clientes[cid]; if(!c) return;
  const rows=filasCuenta(cid);
  const pendientes=Object.values(S.pedidos).filter(p=>p.clienteId===cid&&p.estado==="pendiente").length;
  const s=saldoCliente(cid);
  $("#dlgCont").innerHTML=`<header><div><h2>${esc(c.nombre)}</h2><span class="sub">${esc(c.telefono||"")}${pendientes?` · ${pendientes} en ruta`:""}</span></div><button class="cerrar" data-cerrar aria-label="Cerrar">×</button></header>
    <div class="saldo-grande ${s<0?"neg":s>0?"pos":""}">${pesos(Math.abs(s))}</div>
    <p class="sub">${s>0?"Cuenta por pagar: JS le debe este valor al cliente.":s<0?"Cuenta por cobrar: el cliente le debe este valor a JS.":"Cuenta a paz y salvo."}</p>
    ${s?(telWhatsApp(c.telefono)?`<div class="acciones" style="margin:0 0 6px"><a class="btn ok" id="cWa" href="${linkSaldo(cid)}" target="_blank" rel="noopener">Enviar ${s<0?"cobro":"saldo a favor"} por WhatsApp</a><button class="btn sec" id="cWaCopiar" type="button">Copiar mensaje</button></div>`:'<div class="aviso">Agrega el celular del cliente para enviarle el saldo por WhatsApp.</div>'):""}
    ${esAdmin||esAsistente?`<h2>${esAdmin?"Registrar pago o ajuste":"Registrar pago, compra o ganancia"}</h2>
    <div class="campo"><label for="mTipo">Tipo</label><select id="mTipo">${Object.entries(MOVS).filter(([k])=>esAdmin||MOVS_OFICINA.includes(k)).map(([k,x])=>`<option value="${k}">${x.t}</option>`).join("")}</select></div>
    <div class="linea2"><div class="campo"><label for="mFecha">Día</label><input id="mFecha" type="date" value="${hoy()}"></div>
    <div class="campo"><label for="mVal">Valor</label><input id="mVal" type="number" inputmode="numeric" min="0" step="100" value="${Math.abs(s)||""}"></div></div>
    <div class="linea2"><div class="campo"><label for="mMedio">Medio (para pagos)</label><select id="mMedio">${Object.entries(MEDIOS).map(([k,t])=>`<option value="${k}">${t}</option>`).join("")}</select></div>
    <div class="campo"><label for="mNota">Nota (opcional)</label><input id="mNota" placeholder="Ej: compra, transferencia Nequi"></div></div>
    <div class="acciones"><button class="btn ok" id="mReg">Registrar</button><button class="btn sec" id="cEdit">Editar cliente</button><button class="btn sec" id="cImpr">Imprimir recibo</button>${descargas&&esAdmin?'<button class="btn sec" id="cCsv">Descargar para Excel</button>':""}</div>`:'<div class="acciones"><button class="btn sec" id="cEdit">Editar cliente</button></div>'}
    <h2>Movimientos</h2>
    ${rows.length?`<div class="tabla-env"><table><thead><tr><th>Fecha</th><th>Detalle</th><th class="n">Valor</th><th></th></tr></thead><tbody>
    ${rows.map(r=>`<tr><td>${hora(r.fecha)}</td><td>${esc(r.det)}</td><td class="n ${r.v<0?"neg":"pos"}">${pesos(r.v)}</td><td>${r.mid?(esAdmin?`<button class="btn peligro chico" data-delmov="${esc(r.mid)}">Quitar</button>`:""):(r.pid&&(r.v<0||r.dp))?`<button class="btn sec chico" data-domi="${esc(r.pid)}">${r.dp?"Desmarcar pago":"Ya pagó domicilio"}</button>`:""}</td></tr>`).join("")}</tbody></table></div>`:'<div class="vacio">Sin movimientos.</div>'}`;
  if(!$("#dlg").open) abrirDlg();
  if($("#mTipo")&&esAdmin) $("#mTipo").value = s<0 ? "pago_de_cliente" : "pago_a_cliente";
  if($("#mTipo")&&!esAdmin){ if(s>0) $("#mTipo").value="pago_a_cliente"; else if(s===0) $("#mVal").value=""; } // el asistente arranca en "pagarle" si el cliente tiene saldo a favor, o en "pago del cliente" si debe
  $("#cEdit").onclick=()=>formCliente(cid);
  const ci=$("#cImpr"); if(ci) ci.onclick=()=>imprimirReciboCliente(cid);
  const wa=$("#cWa"); if(wa) wa.onclick=()=>marcarEnviado(cid);
  const wc=$("#cWaCopiar"); if(wc) wc.onclick=async()=>{ try{ await navigator.clipboard.writeText(textoSaldo(cid)); toast("Mensaje copiado. Pégalo en WhatsApp."); }catch(e){ toast("No se pudo copiar en este navegador"); } };
  if($("#mReg")) $("#mReg").onclick=async()=>{ const val=Number($("#mVal").value); if(!(val>0)) return toast("Escribe un valor mayor a cero"); const id=nuevoId();
    const tipo=$("#mTipo").value, diaM=$("#mFecha")?.value||hoy(), caja=mueveCaja({tipo}); if(esAdmin&&caja&&diaAntesDelArqueo(diaM)) return;
    const fecha=!esAdmin&&esPago({tipo})?Date.now():caja?fechaCaja(diaM):fechaDia(diaM); // el pago que registra el asistente queda con la hora del momento
    try{ await guardar("movimientos",id,{id,clienteId:cid,tipo,valor:val,medio:$("#mMedio").value,nota:$("#mNota").value.trim(),fecha,porUid:uid||"",porNombre:miNombre()}); toast("Movimiento registrado"); setTimeout(()=>abrirCuenta(cid),200); }catch(e){toast("No se pudo guardar");} };
  document.querySelectorAll("[data-domi]").forEach(b=>b.onclick=async()=>{ const g=b.dataset.domi, ped=S.pedidos[g];
    if(ped?.domiPagado){ if(cambiaLoContado(ped,{...ped,domiPagado:false,domiPagoMedio:""})) return avisoContado(); if(!await confirmar("Desmarcar el pago de "+g,"El pago del domicilio se quita de la caja y vuelve a sumarse al saldo del cliente.","Desmarcar")) return abrirCuenta(cid);
      try{ await actualizar("pedidos",g,{domiPagado:false,domiPagoMedio:"",domiPagoValor:"",domiPagoFecha:0}); toast("Guía "+g+" actualizada"); }catch(e){ toast("No se pudo guardar"); } return setTimeout(()=>abrirCuenta(cid),200); }
    pagoDomicilio(g,()=>abrirCuenta(cid)); });
  document.querySelectorAll("[data-delmov]").forEach(b=>b.onclick=async()=>{ const m=S.movimientos[b.dataset.delmov]; if(!m) return; if(mueveCaja(m)&&yaContado(m.fecha)) return avisoContado();
    if(!await confirmar("Quitar movimiento",`${MOVS[m.tipo]?.corto||"Movimiento"} · ${pesos(m.valor)}. Se quita de la cuenta del cliente${mueveCaja(m)?" y de la caja":""}.`,"Quitar")) return abrirCuenta(cid);
    b.disabled=true; try{ await borrar("movimientos",b.dataset.delmov); toast("Movimiento quitado"); setTimeout(()=>abrirCuenta(cid),200); }catch(e){ b.disabled=false; toast("No se pudo quitar"); } });
  const bc=$("#cCsv"); if(bc) bc.onclick=async()=>{
    const lin=[["Fecha","Detalle","Valor"],...rows.slice().reverse().map(r=>[new Date(r.fecha).toLocaleString("es-CO"),r.det,Math.round(r.v)]),["","Saldo",Math.round(s)]];
    const csv="\uFEFF"+lin.map(l=>l.map(x=>`"${String(x).replace(/"/g,'""')}"`).join(";")).join("\r\n");
    try{ await descargas.save({filename:`cuenta-${c.nombre.replace(/[^\w]+/g,"-")}-${hoy()}.csv`, data:csv}); }catch(e){ toast("No se descargó el archivo"); }
  };
}

/* Tickets para la impresora térmica de la oficina (SAT-16TU): lista de clientes y recibo de un cliente.
   La impresora imprime como texto: el ticket se arma en líneas de ancho fijo, sin tildes ni símbolos
   (salen como caracteres raros). El ancho del papel (80 o 58 mm) se elige en la vista previa y queda guardado en este equipo. */
const tkTxt = x => String(x??"").replace(/[\u00a0\u202f]/g," ").normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/[^\x20-\x7E]/g,"").replace(/\s+/g," ").trim();
const tkPesos = v => (Math.round(v)<0?"-":"")+"$"+Math.abs(Math.round(v)).toLocaleString("es-CO").replace(/[^\d]/g,".");
function tkLineas(cols){
  const L=[];
  return { L, cols,
    centro:t=>{ t=tkTxt(t).slice(0,cols); L.push(" ".repeat(Math.floor((cols-t.length)/2))+t); },
    raya:(c="-")=>L.push(c.repeat(cols)),
    fila:(izq,der="")=>{ der=tkTxt(der); izq=tkTxt(izq).slice(0,Math.max(1,cols-der.length-1)); L.push(izq+" ".repeat(Math.max(1,cols-izq.length-der.length))+der); },
    texto:t=>{ let x=tkTxt(t); while(x.length>cols){ let k=x.lastIndexOf(" ",cols); if(k<1) k=cols; L.push(x.slice(0,k)); x=x.slice(k).trim(); } if(x) L.push(x); },
    vacio:()=>L.push("") };
}
function imprimirTicket(titulo,armar,antes){ // armar: una función que llena el ticket, o una lista para imprimir varios seguidos
  // antes: {texto, fn} — algo que se guarda una sola vez al tocar Imprimir (por ejemplo, pagar los saldos); si falla, no se imprime
  let mm=lsGet("js_papel")==="58"?58:80;
  const lista=Array.isArray(armar)?armar:[armar];
  const lineas=()=>lista.map(fn=>{ const cols=mm===80?40:32, t=tkLineas(cols);
    t.centro(EMPRESA.nombre); t.centro(new Date().toLocaleString("es-CO",{dateStyle:"short",timeStyle:"short"})); t.raya("=");
    fn(t); t.raya("="); t.centro(EMPRESA.lema); t.centro(EMPRESA.tel); for(let i=0;i<5;i++) t.vacio(); // espacio para cortar el papel sin perder el final
    return {txt:t.L.join("\n"), cols}; });
  const pre=(xs,ancho)=>xs.map((x,i)=>`<pre style="margin:0;font:700 ${(ancho/x.cols/0.6).toFixed(2)}mm/1.25 'Courier New',Courier,monospace;color:#000;white-space:pre;${i<xs.length-1?"break-after:page;page-break-after:always":""}">${esc(x.txt)}</pre>`).join("");
  $("#dlgCont").innerHTML=`<header><div><h2>${esc(titulo)}</h2><span class="sub">Impresora de tickets SAT-16TU</span></div><button class="cerrar" data-cerrar aria-label="Cerrar">×</button></header>
    <div class="filtros">${[[80,"Papel de 80 mm"],[58,"Papel de 58 mm"]].map(([x,t])=>`<button data-mm="${x}" aria-pressed="${mm===x}">${t}</button>`).join("")}</div>
    <p class="sub">En la ventana de impresión elige la SAT-16TU, márgenes “Ninguno” y escala 100 %.${lista.length>1?` Son ${lista.length} recibos, uno detrás de otro.`:""}</p>
    <div id="tkPrev" style="background:#fff;color:#000;padding:8px;border:1px solid var(--borde,#ccc);overflow:auto;max-height:50vh"></div>
    ${antes?`<div class="aviso" style="margin-top:10px">${antes.texto}</div>`:""}
    <button class="btn" id="tkImprimir" style="width:100%;margin-top:10px">${antes?"Pagar e imprimir":"Imprimir"}${lista.length>1?" "+lista.length+" recibos":""}</button>`;
  const ver=()=>{ $("#tkPrev").innerHTML=pre(lineas(),mm===80?72:48); $("#dlgCont").querySelectorAll("[data-mm]").forEach(b=>b.setAttribute("aria-pressed",String(Number(b.dataset.mm)===mm))); };
  if(!$("#dlg").open) abrirDlg(); ver();
  $("#dlgCont").querySelectorAll("[data-mm]").forEach(b=>b.onclick=()=>{ mm=Number(b.dataset.mm); lsSet("js_papel",String(mm)); ver(); });
  $("#tkImprimir").onclick=async()=>{ // se imprime desde un marco aparte para que salga solo el ticket
    if(antes){ const b=$("#tkImprimir"); b.disabled=true; b.textContent="Guardando…";
      try{ await antes.fn(); }catch(e){ b.disabled=false; b.textContent="Pagar e imprimir"; return toast("No se pudo guardar el pago. No se imprimió."); }
      antes=null; b.disabled=false; b.textContent="Imprimir otra vez"; $("#dlgCont").querySelector(".aviso")?.remove(); }
    const fr=document.createElement("iframe"); fr.style.cssText="position:fixed;width:0;height:0;border:0;right:0;bottom:0"; document.body.appendChild(fr);
    const d=fr.contentWindow.document; d.open(); d.write(`<!doctype html><html><head><meta charset="utf-8"><title>${esc(tkTxt(titulo))}</title><style>@page{margin:0}html,body{margin:0;background:#fff}body{padding:2mm 4mm}</style></head><body>${pre(lineas(),mm===80?72:48)}</body></html>`); d.close();
    setTimeout(()=>{ fr.contentWindow.focus(); fr.contentWindow.print(); setTimeout(()=>fr.remove(),60000); },200); };
}
function imprimirClientes(secciones,k){
  imprimirTicket("Imprimir lista",t=>{
    if(diaCliF) t.centro("Movimiento del "+diaCliF);
    secciones.forEach(([tit,txt,cs,tot],i)=>{ if(i) t.vacio(); t.centro(tit.toUpperCase()); t.raya();
      if(cs.length) cs.forEach(c=>t.fila(c.nombre,tkPesos(Math.abs(k(c))))); else t.centro("Ninguno");
      t.raya(); t.fila(`${txt} (${cs.length})`,tkPesos(tot)); });
  });
}
/* Recibo de un cliente: una línea por pedido (guía, quien recibió y lo que suma o resta) desde la última vez que quedó
   a paz y salvo; los más viejos se juntan en "saldo anterior". */
const imprimirReciboCliente = cid => { const fn=armarRecibo(cid); if(fn) imprimirTicket("Recibo de "+S.clientes[cid].nombre,fn); };
function armarRecibo(cid,pago){ // pago: {medio} cuando en ese momento se le paga el saldo a favor
  const c=S.clientes[cid]; if(!c) return null;
  const asc=filasCuenta(cid).slice().reverse(); let corte=0, acc=0;
  asc.forEach((r,i)=>{ acc+=r.v; if(Math.round(acc)===0) corte=i+1; });
  let rows=asc.slice(corte); const MAX=60, viejas=rows.length>MAX?rows.slice(0,rows.length-MAX):[]; rows=rows.slice(viejas.length);
  const anterior=viejas.reduce((a,r)=>a+r.v,0), s=saldoCliente(cid);
  return t=>{
    t.centro("RECIBO DE CUENTA"); t.centro(c.nombre); if(c.telefono) t.centro(c.telefono); t.raya();
    if(anterior) t.fila("Saldo anterior",tkPesos(anterior));
    if(rows.length) rows.forEach(r=>t.fila((r.pid?r.pid+" ":"")+r.nom,tkPesos(r.v))); else t.centro("Sin movimientos pendientes");
    t.raya(); t.fila(s>0?"JS LE DEBE":s<0?"DEBE A JS":"PAZ Y SALVO",tkPesos(Math.abs(s)));
    if(pago&&s>0){ t.fila("PAGADO EN "+MEDIOS[pago.medio].toUpperCase(),tkPesos(-s)); t.fila("SALDO","$0"); t.vacio(); t.vacio(); t.fila("Recibido: ______________________"); }
    if(s<0){ t.vacio(); t.texto("Nequi 316 493 3854 - Bancolombia ahorros 815 13203390 - Javier Salazar"); }
  };
}
/* Varios recibos de una vez: se eligen los clientes de la lista que se está viendo en Clientes. */
function recibosVarios(cs,k){
  const sel=new Set();
  $("#dlgCont").innerHTML=`<header><div><h2>Imprimir recibos</h2><span class="sub">Elige los clientes</span></div><button class="cerrar" data-cerrar aria-label="Cerrar">×</button></header>
    <div class="campo"><input id="rvBus" type="search" placeholder="Buscar cliente…" autocomplete="off"></div>
    <div class="acciones" style="margin:0 0 8px"><button class="btn sec chico" id="rvTodos">Marcar todos</button><button class="btn sec chico" id="rvNinguno">Ninguno</button></div>
    <div id="rvLista" style="max-height:45vh;overflow:auto"></div>
    <label style="display:flex;gap:8px;align-items:flex-start;margin-top:10px"><input type="checkbox" id="rvPagar" checked style="width:auto;margin-top:3px"><span>Pagarles su saldo a favor y dejarlos en $ 0 (sale de la caja)</span></label>
    <div class="campo" id="rvMedioC" style="margin-top:6px"><label for="rvMedio">Les pagas en</label><select id="rvMedio">${Object.entries(MEDIOS).map(([k,t])=>`<option value="${k}">${t}</option>`).join("")}</select></div>
    <p class="sub" id="rvRes"></p>
    <button class="btn" id="rvImprimir" style="width:100%;margin-top:6px" disabled>Imprimir</button>`;
  abrirDlg();
  const vis=()=>{ const q=sinTildes($("#rvBus").value.trim()); return cs.filter(c=>!q||sinTildes(c.nombre+" "+(c.telefono||"")).includes(q)); };
  const aPagar=()=>$("#rvPagar").checked?[...sel].map(id=>[id,Math.round(saldoCliente(id))]).filter(([,v])=>v>0):[];
  const boton=()=>{ const b=$("#rvImprimir"); b.disabled=!sel.size; b.textContent=sel.size?`Imprimir ${sel.size} recibo${sel.size===1?"":"s"}`:"Imprimir";
    const ps=aPagar(), tot=ps.reduce((a,[,v])=>a+v,0), deben=[...sel].filter(id=>saldoCliente(id)<0).length;
    $("#rvMedioC").classList.toggle("oculto",!$("#rvPagar").checked);
    $("#rvRes").textContent=$("#rvPagar").checked&&sel.size?(ps.length?`Se les pagan ${pesos(tot)} a ${ps.length} cliente${ps.length===1?"":"s"}.`:"Ninguno de los elegidos tiene saldo a favor.")+(deben?` ${deben} que te debe${deben===1?"":"n"} no cambia${deben===1?"":"n"}.`:""):""; };
  $("#rvPagar").onchange=boton;
  const ver=()=>{ const l=vis(); $("#rvLista").innerHTML=l.length?`<table><tbody>${l.map(c=>`<tr><td style="width:32px"><input type="checkbox" data-rv="${esc(c.id)}" ${sel.has(c.id)?"checked":""} aria-label="${esc(c.nombre)}" style="width:auto"></td><td><span data-rvl="${esc(c.id)}" style="cursor:pointer"><b>${esc(c.nombre)}</b></span></td><td class="n ${k(c)<0?"neg":k(c)>0?"pos":""}">${pesos(Math.abs(k(c)))}</td></tr>`).join("")}</tbody></table>`:'<div class="vacio">Ningún cliente con ese nombre.</div>';
    $("#rvLista").querySelectorAll("[data-rv]").forEach(x=>x.onchange=()=>{ x.checked?sel.add(x.dataset.rv):sel.delete(x.dataset.rv); boton(); });
    $("#rvLista").querySelectorAll("[data-rvl]").forEach(x=>x.onclick=()=>{ const cb=$("#rvLista").querySelector(`[data-rv="${x.dataset.rvl}"]`); cb.checked=!cb.checked; cb.onchange(); });
    boton(); };
  $("#rvBus").oninput=ver;
  $("#rvTodos").onclick=()=>{ vis().forEach(c=>sel.add(c.id)); ver(); };
  $("#rvNinguno").onclick=()=>{ sel.clear(); ver(); };
  $("#rvImprimir").onclick=()=>{ const ids=cs.map(c=>c.id).filter(id=>sel.has(id)), medio=$("#rvMedio").value, ps=aPagar(), pagar=new Map(ps), tot=ps.reduce((a,[,v])=>a+v,0);
    const fns=ids.map(id=>armarRecibo(id,pagar.has(id)?{medio}:null)).filter(Boolean);
    // el pago se guarda al tocar "Pagar e imprimir", con el saldo de ese momento (si ya quedó en 0, no se paga dos veces)
    const antes=ps.length?{texto:`Al imprimir se registra el pago de <b>${pesos(tot)}</b> en ${MEDIOS[medio]} a ${ps.length} cliente${ps.length===1?"":"s"} y quedan en $ 0.`,
      fn:async()=>{ let n=0, total=0; for(const [cid] of ps){ const v=Math.round(saldoCliente(cid)); if(!(v>0)) continue; const id=nuevoId();
          await guardar("movimientos",id,{id,clienteId:cid,tipo:"pago_a_cliente",valor:v,medio,nota:"Pago con recibo impreso",fecha:Date.now(),porUid:uid||"",porNombre:miNombre()}); n++; total+=v; }
        toast(`Pagados ${pesos(total)} a ${n} cliente${n===1?"":"s"}`); }}:null;
    imprimirTicket(`${ids.length} recibo${ids.length===1?"":"s"}`,fns,antes); };
  ver();
}

/* ======================= RECIBOS DE CUADRE ======================= */
const LOGO=document.querySelector(".marca img").src;
/* Datos de pago que van en los mensajes de cobro por WhatsApp. */
const PAGOS_TEXTO=["💳 *Opciones de pago – Transferencias*","","Para tu comodidad, puedes realizar tu pago a cualquiera de nuestras cuentas:","",
  "📱 *NEQUI*","Número: 316 493 3854","Titular: Javier Salazar","",
  "🇨🇴 *Bancolombia – Cuenta de Ahorros*","Número: 815 13203390","Titular: Javier Salazar"];
const EMPRESA={nombre:"JS LOGISTICS CALI", lema:"¡SERVIR ES NUESTRA LABOR!", tel:"TEL: 316 493 3854", ig:"IG: @JS.LOGISTICS.CALI"};
const PCT_SUELDO=0.7, DESC_SUELDO=25000;
const sueldoDe = domicilios => domicilios*PCT_SUELDO - DESC_SUELDO;
const sueldoPedidos = ps => { const g={}; ps.forEach(p=>{ const d=diaDe(p.entregado); g[d]=(g[d]||0)+servicio(p); }); return Object.values(g).reduce((a,x)=>a+sueldoDe(x),0); };
const MEDIOS={efectivo:"Efectivo",nequi:"Nequi",bancolombia:"Bancolombia"};
const TIPOS={mensajero:"Mensajero",dueno:"Dueño (Javier)",oficina:"Oficina (JS)",patinador:"Patinador",empresa:"Empresa (JS)"};
/* Oficina: sus pedidos son 100% de JS (suman al sueldo del dueño); a la persona se le paga fijo por día. */
const PAGO_FIJO=["patinador","oficina","empresa"];
const tipoDe = m => m?.tipo || "mensajero";
const esRepartidor = m => ["mensajero","dueno","oficina"].includes(tipoDe(m));
const ganaPorcentaje = m => tipoDe(m)==="mensajero";
const sueldoTexto = (mid,ps) => tipoDe(S.mensajeros[mid])==="dueno" ? "Ver “Mi sueldo”" : tipoDe(S.mensajeros[mid])==="oficina" ? "Pago por día" : pesos(sueldoPedidos(ps));
function liquidacionesDe(mid){ return Object.values(S.liquidaciones).filter(l=>l.mensajeroId===mid).sort((a,b)=>b.fecha-a.fecha); }
const yaLiquidado = (mid,fecha) => { const ul=liquidacionesDe(mid)[0]; return !!ul && fecha<=ul.fecha; };
const guiasLiquidadas = mid => new Set(liquidacionesDe(mid).flatMap(l=>l.guias||[]));
const pedidoLiquidado = p => cerrado(p) && guiasLiquidadas(p.mensajeroId).has(p.guia);
/* Período abierto: las entregas que no están en ninguna liquidación, por pertenencia y no por la hora
   (así no se pierde una entrega que llegó tarde por falta de señal o con el reloj del celular corrido).
   ajuste: lo que cambió después en liquidaciones ya cerradas (valores corregidos, dinero recibido editado o quitado,
   bases o fletes), menos lo que ya absorbió una liquidación posterior. Así lo que debe el mensajero siempre cuadra con la caja. */
function periodoMensajero(mid){
  const liqs=liquidacionesDe(mid), ul=liqs[0]||null, desde=ul?ul.fecha:0, anterior=ul?(Number(ul.debe)||0):0;
  const enLiq=new Set(liqs.flatMap(l=>l.guias||[])), sinGuias=Math.max(0,...liqs.filter(l=>!Array.isArray(l.guias)).map(l=>l.fecha)); // liquidaciones viejas sin lista de guías: por hora
  const ps=Object.values(S.pedidos).filter(p=>cerrado(p)&&p.mensajeroId===mid&&!enLiq.has(p.guia)&&p.entregado>sinGuias).sort((a,b)=>a.entregado-b.entregado);
  const todosRecs=Object.values(S.recaudos).filter(r=>r.mensajeroId===mid), todasBases=Object.values(S.cajamovs).filter(c=>c.cat==="base"&&c.personaId===mid);
  const recs=todosRecs.filter(r=>r.fecha>desde).sort((a,b)=>a.fecha-b.fecha);
  const bases=todasBases.filter(c=>c.fecha>desde).sort((a,b)=>a.fecha-b.fecha);
  const enVentana=(xs,l)=>xs.filter(x=>x.fecha>(Number(l.desde)||0)&&x.fecha<=l.fecha).reduce((a,x)=>a+(Number(x.valor)||0),0);
  let ajuste=0;
  for(const l of liqs){ if(!Array.isArray(l.guias)) continue;
    const lp=l.guias.map(g=>S.pedidos[g]).filter(p=>p&&cerrado(p));
    ajuste+=(totales(lp).efectivo-(Number(l.efectivo)||0))-(lp.reduce((a,p)=>a+gastoDe(p),0)-(Number(l.gastos)||0))
      +(enVentana(todasBases,l)-(Number(l.base)||0))-(enVentana(todosRecs,l)-(Number(l.recibido)||0))-(Number(l.ajuste)||0); }
  ajuste=Math.round(ajuste);
  const efectivo=totales(ps).efectivo, recibido=recs.reduce((a,r)=>a+(Number(r.valor)||0),0), base=bases.reduce((a,c)=>a+(Number(c.valor)||0),0), gastos=ps.reduce((a,p)=>a+gastoDe(p),0);
  return {ul,desde,anterior,ajuste,ps,recs,bases,base,gastos,efectivo,recibido,debe:anterior+ajuste+efectivo+base-gastos-recibido}; // la base vuelve con lo cobrado; los fletes que pagó se descuentan
}
const ajusteTxt = x => (x>0?"+ ":"− ")+pesos(Math.abs(x));
const filaAjuste = pm => pm.ajuste?`<dt>Correcciones a liquidaciones cerradas</dt><dd class="${pm.ajuste>0?"neg":"pos"}">${ajusteTxt(pm.ajuste)}</dd>`:"";
const recibidoDia=(mid,dia)=>Object.values(S.recaudos).filter(r=>r.mensajeroId===mid&&diaDe(r.fecha)===dia).reduce((a,r)=>a+(Number(r.valor)||0),0);
const textoLiq = d => d>0 ? "Debe "+pesos(d) : d<0 ? "Sobró "+pesos(-d) : "Quedó en $ 0";

/* Semanas a las que se puede cargar el adelanto: la actual y la anterior (el sábado se paga la semana que terminó el viernes). */
function semanasAdelanto(){
  const act=semanaDe(hoy()), ant=moverSemana(act,-1), txt=w=>{ const d=diasSemana(w); return new Date(d[0]+"T12:00:00").toLocaleDateString("es-CO",{day:"numeric",month:"short"})+" al "+new Date(d[6]+"T12:00:00").toLocaleDateString("es-CO",{day:"numeric",month:"short"}); };
  const sab=new Date().getDay()===6, l=[[ant,"Semana del "+txt(ant)+(sab?" (la que se paga hoy)":"")],[act,"Semana del "+txt(act)+(sab?"":" (esta semana)")]];
  return sab?l:l.reverse();
}
function liquidar(mid){
  const m=S.mensajeros[mid]; if(!m) return;
  const pm=periodoMensajero(mid), t=totales(pm.ps), sueldo=ganaPorcentaje(m)?sueldoPedidos(pm.ps):0;
  const enRuta=Object.values(S.pedidos).filter(p=>p.estado==="pendiente"&&p.mensajeroId===mid).length;
  const sinValor=pm.ps.filter(p=>!Number(p.valorServicio)).length;
  $("#dlgCont").innerHTML=`<header><div><h2>Liquidar período</h2><span class="sub">${esc(m.nombre)} · desde ${pm.ul?hora(pm.ul.fecha):"el inicio"} hasta ahora</span></div><button class="cerrar" data-cerrar aria-label="Cerrar">×</button></header>
    ${enRuta?`<div class="aviso">Tiene ${enRuta} pedido${enRuta===1?"":"s"} en ruta. Cuando los entregue, contarán para el siguiente período.</div>`:""}
    ${sinValor?`<div class="aviso">${sinValor} entrega${sinValor===1?"":"s"} sin valor de servicio: el sueldo puede salir más bajo.</div>`:""}
    <dl class="datos">
      <dt>Entregas</dt><dd>${pm.ps.length}</dd>
      <dt>Efectivo cobrado</dt><dd>${pesos(t.efectivo)}</dd>
      ${pm.base?`<dt>Base para vueltos</dt><dd>${pesos(pm.base)}</dd>`:""}${pm.gastos?`<dt>Fletes / gastos pagados</dt><dd>− ${pesos(pm.gastos)}</dd>`:""}
      ${pm.anterior?`<dt>Pendiente de la liquidación anterior</dt><dd>${pesos(pm.anterior)}</dd>`:""}${filaAjuste(pm)}
      <dt>Ya entregó</dt><dd>${pesos(pm.recibido)}</dd>
      <dt>Pendiente por entregar</dt><dd class="neg">${pesos(pm.debe)}</dd>
      <dt>Transferencias a JS</dt><dd>${pesos(t.transfJs)}</dd>
      <dt>Pagado directo al cliente</dt><dd>${pesos(t.transfCli)}</dd>
      <dt>Sueldo del período</dt><dd>${ganaPorcentaje(m)?pesos(sueldo):sueldoTexto(mid,pm.ps)}</dd>
    </dl>
    <div class="linea2"><div class="campo"><label for="lVal">Entrega final (lo que te da ahora)</label><input id="lVal" type="number" inputmode="numeric" min="0" step="1000" value="${pm.debe>0?pm.debe:0}"></div>
    <div class="campo"><label for="lMedio">Medio</label><select id="lMedio">${Object.entries(MEDIOS).map(([k,x])=>`<option value="${k}">${x}</option>`).join("")}</select></div></div>
    <div class="res-liq cero" id="lRes"></div>
    <div id="lAdelC" class="oculto" style="margin:10px 0"><label style="display:flex;gap:8px;align-items:flex-start"><input type="checkbox" id="lAdel" checked style="width:auto;margin-top:3px"><span>Pasar lo que queda debiendo a <b>adelanto de sueldo</b>, hasta lo que tiene por cobrar de sueldo esa semana. Si debe más, el resto queda pendiente para el próximo período.</span></label>
      <div class="campo" style="margin-top:6px"><label for="lSem">Descontar del sueldo de la semana</label><select id="lSem">${semanasAdelanto().map(([w,t])=>`<option value="${w}">${t}</option>`).join("")}</select></div></div>
    <button class="btn ok" id="lGuardar" style="width:100%">Liquidar y cerrar período</button>`;
  abrirDlg();
  // adelanto = lo que queda debiendo, sin pasar del sueldo que le falta por cobrar esa semana (el sueldo no puede quedar negativo)
  const adelanto=d=>d>0&&$("#lAdel").checked?Math.max(0,Math.min(d,Math.round(sueldoPersonaSemana(mid,$("#lSem").value).neto))):0;
  const calc=()=>{ const val=Number($("#lVal").value)||0, d=pm.debe-val, r=$("#lRes"), adel=adelanto(d), resto=d-adel;
    $("#lAdelC").classList.toggle("oculto",!(d>0)); $("#lSem").disabled=!$("#lAdel").checked;
    r.className="res-liq "+(resto>0?"debe":d<0?"sobra":"cero");
    r.innerHTML=`<span>Resultado</span><b>${adel?(resto>0?"Adelanto de "+pesos(adel)+" · sigue debiendo "+pesos(resto):"Quedó en $ 0 · adelanto de "+pesos(adel)):d>0&&$("#lAdel").checked?textoLiq(d)+" (no tiene sueldo por cobrar esa semana)":textoLiq(d)}</b>`; };
  $("#lAdel").onchange=calc; $("#lSem").onchange=calc;
  $("#lVal").oninput=calc; calc(); $("#lVal").select();
  $("#lGuardar").onclick=async()=>{ const val=Number($("#lVal").value)||0; if(val<0) return toast("El valor no puede ser negativo");
    const b=$("#lGuardar"); b.disabled=true;
    try{
      const t0=Date.now();
      if(val>0){ const rid=nuevoId(); await guardar("recaudos",rid,{id:rid,mensajeroId:mid,valor:val,medio:$("#lMedio").value,nota:"Liquidación",fecha:t0}); }
      const fecha=Math.max(Date.now(),t0+1), id=mid+"_"+fecha, queda=pm.debe-val, adel=adelanto(queda);
      await guardar("liquidaciones",id,{id,mensajeroId:mid,desde:pm.desde,fecha,dia:diaDe(fecha),entregas:pm.ps.length,guias:pm.ps.map(p=>p.guia),efectivo:t.efectivo,base:pm.base,gastos:pm.gastos,anterior:pm.anterior,recibidoAntes:pm.recibido,entregaFinal:val,recibido:pm.recibido+val,debe:queda-adel,adelanto:adel,ajuste:pm.ajuste,transfJs:t.transfJs,transfCli:t.transfCli,sueldo,enRuta});
      if(adel){ // la plata ya la tiene el mensajero: es un adelanto que no sale de la caja (ver libroCaja) y se descuenta del sueldo de esa semana
        const sem=$("#lSem").value, aid=nuevoId();
        await guardar("cajamovs",aid,{id:aid,tipo:"sale",cat:"adelanto",personaId:mid,valor:adel,medio:"efectivo",concepto:"Lo que quedó debiendo en la liquidación del "+hora(fecha),fecha,semana:sem,deLiquidacion:id}); }
      toast(`${m.nombre}: ${adel?"adelanto de "+pesos(adel)+" en su sueldo":textoLiq(queda).toLowerCase()}`); setTimeout(()=>verLiquidacion(id),200);
    }catch(e){ b.disabled=false; toast("No se pudo guardar"); } };
}
function verLiquidacion(id){
  const l=S.liquidaciones[id]; if(!l){ cerrarDlg(); return; }
  const nom=S.mensajeros[l.mensajeroId]?.nombre||"Mensajero";
  const esUltima=liquidacionesDe(l.mensajeroId)[0]?.id===id;
  const ps=(l.guias||[]).map(g=>S.pedidos[g]).filter(Boolean);
  $("#dlgCont").innerHTML=`<header><div><h2>Liquidación</h2><span class="sub">${esc(nom)} · ${l.desde?"desde "+hora(l.desde)+" ":""}hasta ${hora(l.fecha)}</span></div><button class="cerrar" data-cerrar aria-label="Cerrar">×</button></header>
    <div class="res-liq ${l.debe>0?"debe":l.debe<0?"sobra":"cero"}"><span>Resultado</span><b>${textoLiq(l.debe)}${l.adelanto?" · adelanto de "+pesos(l.adelanto):""}</b></div>
    <dl class="datos">
      <dt>Entregas</dt><dd>${l.entregas}</dd>
      <dt>Efectivo cobrado</dt><dd>${pesos(l.efectivo)}</dd>
      ${l.base?`<dt>Base para vueltos</dt><dd>${pesos(l.base)}</dd>`:""}
      ${l.gastos?`<dt>Fletes / gastos pagados</dt><dd>− ${pesos(l.gastos)}</dd>`:""}
      ${l.anterior?`<dt>Pendiente anterior</dt><dd>${pesos(l.anterior)}</dd>`:""}
      ${l.ajuste?`<dt>Correcciones a liquidaciones anteriores</dt><dd>${ajusteTxt(l.ajuste)}</dd>`:""}
      <dt>Entregó durante el período</dt><dd>${pesos(l.recibidoAntes)}</dd>
      <dt>Entrega final</dt><dd>${pesos(l.entregaFinal)}</dd>
      <dt>Total entregado</dt><dd>${pesos(l.recibido)}</dd>
      ${l.adelanto?`<dt>Pasado a adelanto de sueldo</dt><dd class="neg">${pesos(l.adelanto)}</dd>`:""}
      <dt>Transferencias a JS</dt><dd>${pesos(l.transfJs)}</dd>
      <dt>Pagado directo al cliente</dt><dd>${pesos(l.transfCli)}</dd>
      <dt>Sueldo del período</dt><dd>${pesos(l.sueldo)}</dd>
    </dl>
    ${ps.length?`<h2>Entregas incluidas</h2>${tablaEntregas(ps,true)}`:""}
    ${esUltima?`<div class="acciones" style="margin-top:14px"><button class="btn peligro chico" id="lReabrir">Reabrir período</button></div><p class="sub" style="margin-top:8px;font-size:.85rem">Reabrir borra esta liquidación y junta sus entregas con el período actual. El dinero recibido se conserva en la caja.${l.adelanto?" El adelanto que salió de esta liquidación se quita del sueldo.":""}</p>`:""}`;
  abrirDlg();
  const rb=$("#lReabrir"); if(rb) rb.onclick=async()=>{ try{ for(const c of Object.values(S.cajamovs).filter(c=>c.deLiquidacion===id)) await borrar("cajamovs",c.id); // el adelanto que salió de esta liquidación
    await borrar("liquidaciones",id); toast("Período reabierto"); cerrarDlg(); }catch(e){ toast("No se pudo reabrir"); } };
}
/* Caja de oficina: la plata que maneja cada asistente, por medio (efectivo, Nequi, Bancolombia).
   + base que le da administración, + lo que recibe (mensajeros, pagos de clientes, domicilios),
   − bases que entrega a mensajeros, − compras que paga, − lo que entrega a administración al cierre.
   Es parte de la caja general: dar la base o recibir el cierre no cambia el total, solo quién tiene la plata. */
const asistentes = () => Object.values(S.usuarios||{}).filter(u=>u.rol==="asistente").sort((a,b)=>String(a.nombre).localeCompare(String(b.nombre),"es"));
const antesTxt = x => x.medioAntes&&x.medioAntes!==x.medio?` (antes ${MEDIOS[x.medioAntes]||x.medioAntes})`:"";
function cajaOficina(auid){
  const L=[], nomM=id=>S.mensajeros[id]?.nombre||"", add=(fecha,concepto,valor,medio,ref)=>L.push({fecha,concepto,valor,medio:MEDIOS[medio]?medio:"efectivo",ref});
  for(const c of Object.values(S.cajamovs)){
    if(c.cat==="oficina"&&c.personaUid===auid) add(c.fecha,(c.tipo==="base"?"Base de caja que entregó administración":"Entregado a administración (cierre)")+(c.concepto?" · "+c.concepto:""),(c.tipo==="base"?1:-1)*(Number(c.valor)||0),c.medio,c.id);
    else if(c.cat==="sobrante"&&c.personaUid===auid) add(c.fecha,"Sobrante registrado al cierre"+(c.concepto?" · "+c.concepto:""),Number(c.valor)||0,c.medio,c.id);
    else if(c.cat==="base"&&c.porUid===auid) add(c.fecha,"Base para vueltos a "+nomM(c.personaId),-(Number(c.valor)||0),c.medio);
    else if(c.cat==="interna"&&!c.inicial&&c.porUid===auid) add(c.fecha,(c.tipo==="entra"?"Entrada de ":"Salida a ")+(S.cuentas[c.cuentaId]?.nombre||"cuenta interna"),(c.tipo==="entra"?1:-1)*(Number(c.valor)||0),c.medio); }
  for(const r of Object.values(S.recaudos)) if(r.porUid===auid) add(r.fecha,"Entrega de "+nomM(r.mensajeroId)+antesTxt(r),Number(r.valor)||0,r.medio);
  for(const m of Object.values(S.movimientos)) if(m.porUid===auid&&["pago_de_cliente","pago_a_cliente","compra_cliente"].includes(m.tipo))
    add(m.fecha,(m.tipo==="pago_de_cliente"?"Pago de ":m.tipo==="pago_a_cliente"?"Pago a ":"Compra para ")+nombreCliente(m.clienteId)+antesTxt(m),(m.tipo==="pago_de_cliente"?1:-1)*(Number(m.valor)||0),m.medio);
  for(const p of Object.values(S.pedidos)) if(p.domiPagado&&p.domiPagoUid===auid&&p.domiPagoMedio) add(p.domiPagoFecha,"Pago de domicilio · "+p.guia,pagoDomi(p),p.domiPagoMedio);
  L.sort((a,b)=>a.fecha-b.fecha);
  const saldo={efectivo:0,nequi:0,bancolombia:0}; L.forEach(x=>saldo[x.medio]+=x.valor);
  return {L,saldo,total:L.reduce((a,x)=>a+x.valor,0)};
}
const sumaMedios = L => { const o={efectivo:0,nequi:0,bancolombia:0}; L.forEach(x=>o[x.medio]+=x.valor); return o; };
function tarjetaCajaOficina(u,dia){
  const C=cajaOficina(u.uid), hasta=sumaMedios(C.L.filter(x=>diaDe(x.fecha)<=dia)), delDia=C.L.filter(x=>diaDe(x.fecha)===dia), ahora=dia===hoy();
  return `<div class="mcard"><div class="mcard-top"><b>${esc(esAdmin?(u.nombre||u.email):"Mi caja de oficina")}</b>${esAdmin?`<span class="acciones" style="margin:0;gap:6px"><button class="btn sec chico" data-ofbase="${esc(u.uid)}">Dar base</button><button class="btn ok chico" data-ofcierre="${esc(u.uid)}">Recibir cierre</button></span>`:`<span class="acciones" style="margin:0"><button class="btn sec chico" data-ofbasem>Dar base a un mensajero</button></span>`}</div>
    <span class="sub" style="font-size:.85rem">${ahora?"Lo que tiene ahora y debe entregar al cierre":"Lo que tenía al final de ese día"}</span>
    <dl class="datos">${Object.entries(MEDIOS).map(([k,t])=>`<dt>${t}</dt><dd class="${hasta[k]<0?"neg":""}">${pesos(hasta[k])}</dd>`).join("")}
    <div class="debe" style="display:contents"><dt>Total</dt><dd>${pesos(hasta.efectivo+hasta.nequi+hasta.bancolombia)}</dd></div></dl>
    ${delDia.length?`<div class="tabla-env" style="margin-top:8px"><table><tbody>${delDia.map(x=>`<tr><td>${new Date(x.fecha).toLocaleTimeString("es-CO",{hour:"2-digit",minute:"2-digit"})}</td><td>${esc(x.concepto)}</td><td>${MEDIOS[x.medio]}</td><td class="n ${x.valor<0?"neg":"pos"}">${x.valor<0?"− ":"+ "}${pesos(Math.abs(x.valor))}</td>${esAdmin&&x.ref?`<td><button class="btn peligro chico" data-ofdel="${esc(x.ref)}">Quitar</button></td>`:esAdmin?"<td></td>":""}</tr>`).join("")}</tbody></table></div>`:'<p class="sub">Sin movimientos este día.</p>'}</div>`;
}
function bloqueCajaOficina(){
  if(esAdmin){ const as=asistentes(); if(!as.length) return "";
    return `<h2>Caja de oficina</h2><p class="sub">Lo que maneja cada asistente en efectivo, Nequi y Bancolombia: la base que le das, más lo que recibe (mensajeros, pagos de clientes, domicilios), menos las bases que da a los mensajeros, las compras que paga y lo que les paga a los clientes, menos lo que te entrega al cierre.</p>
      <div class="mgrid">${as.map(u=>tarjetaCajaOficina(u,diaCaja)).join("")}</div>`; }
  if(esAsistente&&uid) return `<h2>Mi caja de oficina</h2><p class="sub">Tu base más lo que recibes, menos las bases que das a los mensajeros y lo que les pagas a los clientes. Al final del día entrega a administración lo que dice cada medio.</p>
    <div class="mgrid">${tarjetaCajaOficina({uid},diaCaja)}</div>`;
  return "";
}
function movOficina(auid,tipo){
  const u=(S.usuarios||{})[auid], C=cajaOficina(auid), base=tipo==="base";
  $("#dlgCont").innerHTML=`<header><div><h2>${base?"Dar base de caja":"Recibir cierre de caja"}</h2><span class="sub">${esc(u?.nombre||u?.email||"")} · tiene ${Object.entries(MEDIOS).map(([k,t])=>t+" "+pesos(C.saldo[k])).join(" · ")}</span></div><button class="cerrar" data-cerrar aria-label="Cerrar">×</button></header>
    <p class="sub">${base?"Efectivo que le entregas para trabajar y dar base a los mensajeros.":"Lo que te entrega en cada medio. Viene lleno con lo que debe tener; cámbialo si te entrega otra cosa (por ejemplo, si le dejas base para mañana). Si en un medio está en negativo o te entrega de más, sobró plata: se registra como sobrante y ese medio queda en $ 0."}</p>
    ${base?`<div class="campo"><label for="of_efectivo">Valor (efectivo)</label><input id="of_efectivo" data-ofm="efectivo" type="number" inputmode="numeric" min="0" step="1000"></div>`
      :`<div class="linea2">${Object.entries(MEDIOS).map(([k,t])=>`<div class="campo" style="min-width:120px"><label for="of_${k}">${t}</label><input id="of_${k}" data-ofm="${k}" type="number" inputmode="numeric" min="0" step="1000" value="${C.saldo[k]>0?C.saldo[k]:""}"></div>`).join("")}</div>`}
    ${base?"":'<div id="ofRes" class="sub" style="margin:-4px 0 10px"></div>'}
    <div class="campo"><label for="ofNota">Nota (opcional)</label><input id="ofNota" placeholder="${base?"Ej: base del día":"Ej: cierre del día"}"></div>
    <button class="btn ${base?"":"ok"}" id="ofGuardar" style="width:100%">${base?"Entregar base":"Registrar cierre"}</button>`;
  abrirDlg(); $("#of_efectivo").focus();
  // Al cierre: lo que entrega de más sobre lo que debe tener (o lo que está en negativo) es sobrante; entra a la caja y el medio queda en 0
  const entregas=()=>[...document.querySelectorAll("[data-ofm]")].map(i=>[i.dataset.ofm,Number(i.value)||0]);
  const sobrantes=()=>base?[]:entregas().map(([m,v])=>[m,Math.round(v-C.saldo[m])]).filter(([,x])=>x>0);
  const resumen=()=>{ const r=$("#ofRes"); if(!r) return; const sb=new Map(sobrantes());
    r.innerHTML=entregas().map(([m,v])=>{ const queda=Math.round(C.saldo[m]-v); return `${MEDIOS[m]}: ${sb.has(m)?`<b class="pos">sobrante ${pesos(sb.get(m))}</b>, queda en $ 0`:queda?`queda ${pesos(queda)} en su caja`:"queda en $ 0"}`; }).join(" · "); };
  document.querySelectorAll("[data-ofm]").forEach(i=>i.oninput=resumen); resumen();
  $("#ofGuardar").onclick=async()=>{ if(entregas().some(([,v])=>v<0)) return toast("Los valores no pueden ser negativos");
    const vals=entregas().filter(([,v])=>v>0), sobs=sobrantes();
    if(!vals.length&&!sobs.length) return toast("Escribe un valor mayor a cero");
    const b=$("#ofGuardar"); b.disabled=true; const nota=$("#ofNota").value.trim(), t=Date.now(), quien=u?.nombre||u?.email||"";
    try{ for(const [medio,val] of sobs){ const id=nuevoId(); await guardar("cajamovs",id,{id,tipo:"entra",cat:"sobrante",personaUid:auid,personaId:"",valor:val,medio,concepto:quien+(nota?" · "+nota:""),fecha:t}); }
      for(const [medio,val] of vals){ const id=nuevoId(); await guardar("cajamovs",id,{id,tipo,cat:"oficina",personaUid:auid,personaId:"",valor:val,medio,concepto:nota,fecha:t+1}); }
      cerrarDlg(); toast((base?"Base entregada: ":"Cierre recibido: ")+(vals.map(([m,v])=>MEDIOS[m]+" "+pesos(v)).join(" · ")||"sin entrega")+(sobs.length?" · Sobrante: "+sobs.map(([m,v])=>MEDIOS[m]+" "+pesos(v)).join(" · "):"")); }
    catch(e){ b.disabled=false; toast("No se pudo guardar"); } };
}
/* Base para vueltos que el asistente le da a un mensajero desde su caja de oficina (siempre en efectivo y con la hora del momento). */
function baseDesdeOficina(mid){
  const elegir=!mid, ms=listaOrdenada(S.mensajeros,"nombre").filter(x=>esRepartidor(x)&&tipoDe(x)==="mensajero"); // desde "Mi caja de oficina" se elige el mensajero
  if(!elegir&&!S.mensajeros[mid]) return; const C=cajaOficina(uid);
  $("#dlgCont").innerHTML=`<header><div><h2>${elegir?"Dar base a un mensajero":"Dar base a "+esc(S.mensajeros[mid].nombre)}</h2><span class="sub">Tienes ${pesos(C.saldo.efectivo)} en efectivo</span></div><button class="cerrar" data-cerrar aria-label="Cerrar">×</button></header>
    <p class="sub">Sale de tu caja en efectivo y se le suma a lo que el mensajero debe entregar.</p>
    ${elegir?`<div class="campo"><label for="bmMen">Mensajero</label><select id="bmMen"><option value="">Elige…</option>${ms.map(x=>`<option value="${esc(x.id)}">${esc(x.nombre)}</option>`).join("")}</select></div>`:""}
    <div class="linea2"><div class="campo"><label for="bmVal">Valor</label><input id="bmVal" type="number" inputmode="numeric" min="0" step="1000"></div>
    <div class="campo"><label for="bmNota">Nota (opcional)</label><input id="bmNota" placeholder="Ej: base del día"></div></div>
    <button class="btn" id="bmGuardar" style="width:100%">Dar base</button>`;
  abrirDlg(); (elegir?$("#bmMen"):$("#bmVal")).focus();
  $("#bmGuardar").onclick=async()=>{ if(elegir) mid=$("#bmMen").value; const m=S.mensajeros[mid]; if(!m) return toast("Elige el mensajero");
    const val=Number($("#bmVal").value); if(!(val>0)) return toast("Escribe un valor mayor a cero");
    const b=$("#bmGuardar"); b.disabled=true; const id=nuevoId();
    try{ await guardar("cajamovs",id,{id,tipo:"sale",cat:"base",personaId:mid,valor:val,medio:"efectivo",concepto:$("#bmNota").value.trim(),fecha:Date.now(),semana:"",porUid:uid||"",porNombre:miNombre()});
      cerrarDlg(); toast(`Base de ${pesos(val)} para ${m.nombre}. Te quedan ${pesos(C.saldo.efectivo-val)} en efectivo`); }
    catch(e){ b.disabled=false; toast("No se pudo guardar"); } };
}
function conectarCajaOficina(v){
  v.querySelectorAll("[data-ofbase]").forEach(b=>b.onclick=()=>movOficina(b.dataset.ofbase,"base"));
  v.querySelectorAll("[data-ofbasem]").forEach(b=>b.onclick=()=>baseDesdeOficina());
  v.querySelectorAll("[data-ofcierre]").forEach(b=>b.onclick=()=>movOficina(b.dataset.ofcierre,"entrega"));
  v.querySelectorAll("[data-ofdel]").forEach(b=>b.onclick=async()=>{ if(yaContado(S.cajamovs[b.dataset.ofdel]?.fecha)) return avisoContado(); if(!await confirmar("Quitar movimiento de la caja de oficina","Se quita la base o el cierre registrado.","Quitar")) return;
    try{ await borrar("cajamovs",b.dataset.ofdel); toast("Movimiento quitado"); }catch(e){ toast("No se pudo quitar"); } });
}
/* El asistente corrige el medio (efectivo, Nequi, Bancolombia) de un pago o una entrega que él registró, hasta 24 horas después.
   Queda guardado el medio anterior para que administración lo revise. */
const puedoCambiarMedio = x => esAsistente && !!uid && x.porUid===uid && Date.now()-x.fecha<86400000 && !yaContado(x.fecha);
const medioAntesTxt = x => x.medioAntes&&x.medioAntes!==x.medio?` <span class="sub" style="font-size:.8rem">(antes ${MEDIOS[x.medioAntes]||x.medioAntes})</span>`:"";
async function cambiarMedio(col,id){
  const x=S[col]?.[id]; if(!x) return; if(esAsistente) await leerCorte(); if(yaContado(x.fecha)) return avisoContado();
  const quien=col==="recaudos"?"Entrega de "+(S.mensajeros[x.mensajeroId]?.nombre||""):(x.tipo==="pago_de_cliente"?"Pago de ":x.tipo==="pago_a_cliente"?"Pago a ":"Compra para ")+nombreCliente(x.clienteId);
  $("#dlgCont").innerHTML=`<header><div><h2>Cambiar medio</h2><span class="sub">${esc(quien)} · ${pesos(x.valor)} · ${hora(x.fecha)}</span></div><button class="cerrar" data-cerrar aria-label="Cerrar">×</button></header>
    <p class="sub">Está como <b>${MEDIOS[x.medio]||"sin medio"}</b>. Administración verá el cambio.</p>
    <div class="campo"><label for="cmMedio">Medio correcto</label><select id="cmMedio">${Object.entries(MEDIOS).map(([k,t])=>`<option value="${k}" ${k===x.medio?"selected":""}>${t}</option>`).join("")}</select></div>
    <button class="btn" id="cmGuardar" style="width:100%">Guardar</button>`;
  abrirDlg();
  $("#cmGuardar").onclick=async()=>{ const medio=$("#cmMedio").value; if(medio===x.medio) return cerrarDlg();
    const b=$("#cmGuardar"); b.disabled=true;
    try{ await actualizar(col,id,{medio,medioAntes:x.medioAntes||x.medio||"",medioCambio:Date.now()}); cerrarDlg(); toast(`Quedó en ${MEDIOS[medio]}`); }
    catch(e){ b.disabled=false; toast("No se pudo cambiar"); } };
}
function recibirDinero(mid){
  const m=S.mensajeros[mid]; if(!m) return;
  const pm=periodoMensajero(mid);
  $("#dlgCont").innerHTML=`<header><div><h2>Recibir dinero</h2><span class="sub">${esc(m.nombre)}</span></div><button class="cerrar" data-cerrar aria-label="Cerrar">×</button></header>
    <dl class="datos"><dt>Efectivo cobrado</dt><dd>${pesos(pm.efectivo)}</dd>${pm.base?`<dt>Base para vueltos</dt><dd>${pesos(pm.base)}</dd>`:""}${pm.gastos?`<dt>Fletes / gastos pagados</dt><dd>− ${pesos(pm.gastos)}</dd>`:""}${pm.anterior?`<dt>Pendiente anterior</dt><dd>${pesos(pm.anterior)}</dd>`:""}${filaAjuste(pm)}<dt>Ya entregó</dt><dd>${pesos(pm.recibido)}</dd><dt>Debe</dt><dd class="neg">${pesos(pm.debe)}</dd></dl>
    <div class="linea2"><div class="campo"><label for="rVal">Valor que entrega</label><input id="rVal" type="number" inputmode="numeric" min="0" step="1000" value="${pm.debe>0?pm.debe:""}"></div>
    <div class="campo"><label for="rMedio">Medio</label><select id="rMedio">${Object.entries(MEDIOS).map(([k,t])=>`<option value="${k}">${t}</option>`).join("")}</select></div></div>
    <div class="campo"><label for="rNota">Nota (opcional)</label><input id="rNota" placeholder="Ej: primera entrega de la tarde"></div>
    <button class="btn ok" id="rGuardar" style="width:100%">Registrar entrega de dinero</button>`;
  abrirDlg(); $("#rVal").select();
  $("#rGuardar").onclick=async()=>{ const val=Number($("#rVal").value); if(!(val>0)) return toast("Escribe un valor mayor a cero");
    const b=$("#rGuardar"); b.disabled=true; const id=nuevoId();
    try{ await guardar("recaudos",id,{id,mensajeroId:mid,valor:val,medio:$("#rMedio").value,nota:$("#rNota").value.trim(),fecha:Date.now(),porUid:uid||"",porNombre:miNombre()});
      const falta=pm.debe-val; cerrarDlg(); toast(`Recibido ${pesos(val)} de ${m.nombre}. ${falta>0?"Le falta "+pesos(falta):falta<0?"Entregó "+pesos(-falta)+" de más":"Quedó a paz y salvo"}`); }
    catch(e){ b.disabled=false; toast("No se pudo guardar"); } };
}
/* Corregir una entrega de dinero ya registrada (valor, medio o nota). */
function editarRecaudo(id){
  const r=S.recaudos[id]; if(!r) return; if(yaContado(r.fecha)) return avisoContado(); const m=S.mensajeros[r.mensajeroId];
  $("#dlgCont").innerHTML=`<header><div><h2>Editar dinero recibido</h2><span class="sub">${esc(m?.nombre||"")} · ${hora(r.fecha)}</span></div><button class="cerrar" data-cerrar aria-label="Cerrar">×</button></header>
    ${yaLiquidado(r.mensajeroId,r.fecha)?`<div class="aviso">Esta entrega de dinero ya está en una liquidación cerrada: si la corriges, la diferencia pasa sola a lo que debe en su período abierto.</div>`:""}
    <div class="linea2"><div class="campo"><label for="erVal">Valor que entregó</label><input id="erVal" type="number" inputmode="numeric" min="0" step="1000" value="${Number(r.valor)||""}"></div>
    <div class="campo"><label for="erMedio">Medio</label><select id="erMedio">${Object.entries(MEDIOS).map(([k,t])=>`<option value="${k}" ${r.medio===k?"selected":""}>${t}</option>`).join("")}</select></div></div>
    <div class="campo"><label for="erNota">Nota (opcional)</label><input id="erNota" value="${esc(r.nota||"")}"></div>
    <button class="btn ok" id="erGuardar" style="width:100%">Guardar cambios</button>`;
  abrirDlg(); $("#erVal").select();
  $("#erGuardar").onclick=async()=>{ const val=Number($("#erVal").value); if(!(val>0)) return toast("Escribe un valor mayor a cero");
    const b=$("#erGuardar"); b.disabled=true;
    try{ await actualizar("recaudos",id,{valor:val,medio:$("#erMedio").value,nota:$("#erNota").value.trim()}); cerrarDlg(); toast("Entrega de dinero corregida"); }
    catch(e){ b.disabled=false; toast("No se pudo guardar"); } };
}
let diaRec=hoy();

function cuadreDia(dia){
  const res={};
  const get=cid=>res[cid]=res[cid]||{cid,anterior:0,lineas:[],delDia:0,pagos:0};
  for(const p of Object.values(S.pedidos)){
    if(p.estado!=="entregado"||!p.clienteId) continue;
    const d=diaDe(p.entregado), s=saldoPedido(p);
    if(d<dia) get(p.clienteId).anterior+=s;
    else if(d===dia){ const r=get(p.clienteId); r.lineas.push({t:p.destinatario||p.guia,guia:p.guia,p,v:s,f:p.entregado}); r.delDia+=s; }
  }
  for(const m of Object.values(S.movimientos)){
    const d=diaDe(m.fecha), s=signoMov(m);
    if(d<dia) get(m.clienteId).anterior+=s;
    else if(d===dia){ const r=get(m.clienteId);
      if(esPago(m)) r.pagos+=s; else { r.lineas.push({t:(MOVS[m.tipo]?.corto||"Ajuste")+(m.nota?": "+m.nota:""),v:s,f:m.fecha}); r.delDia+=s; } }
  }
  return Object.values(res).filter(r=>S.clientes[r.cid]&&(r.lineas.length||r.pagos))
    .map(r=>{ r.lineas.sort((a,b)=>a.f-b.f); return {...r,nombre:nombreCliente(r.cid),total:r.anterior+r.delDia,queda:r.anterior+r.delDia+r.pagos}; })
    .sort((a,b)=>a.nombre.localeCompare(b.nombre,"es"));
}

function pintarRecibos(v,aviso){
  const lista=cuadreDia(diaRec);
  const sinRem=Object.values(S.pedidos).filter(p=>cerrado(p)&&!p.clienteId&&diaDe(p.entregado)===diaRec).length;
  v.innerHTML=aviso+`<h1>Recibos de cuadre</h1><p class="sub">El saldo de cada cliente en el día, listo para imprimir o descargar en Excel.</p>
    <div class="linea2" style="align-items:end"><div class="campo" style="max-width:220px"><label for="diaR">Día</label><input type="date" id="diaR" value="${diaRec}"></div>
    <div class="campo">${descargas&&esAdmin?`<button class="btn" id="xlsDia" ${lista.length?"":"disabled"}>Descargar Excel del día</button>`:""}</div></div>
    ${sinRem?`<div class="aviso">${sinRem===1?"1 entrega de este día no tiene remitente":sinRem+" entregas de este día no tienen remitente"} y no sale en los recibos. Asígnalo en Pedidos.</div>`:""}
    ${lista.length?`<div class="tabla-env"><table><thead><tr><th>Cliente</th><th class="n">Entregas</th><th class="n">Saldo anterior</th><th class="n">Del día</th><th class="n">Total</th><th class="n">Pagado</th><th></th></tr></thead><tbody>
    ${lista.map(r=>`<tr><td><b>${esc(r.nombre)}</b></td><td class="n">${r.lineas.filter(l=>l.p).length}</td><td class="n">${pesos(r.anterior)}</td><td class="n">${pesos(r.delDia)}</td><td class="n ${r.total<0?"neg":r.total>0?"pos":""}">${pesos(r.total)}</td><td class="n">${r.pagos?pesos(r.pagos):"—"}</td><td><button class="btn sec chico" data-rec="${esc(r.cid)}">Ver recibo</button></td></tr>`).join("")}
    </tbody></table></div>`:`<div class="vacio">No hay entregas con remitente en este día.</div>`}`;
  $("#diaR").onchange=e=>{diaRec=e.target.value||hoy(); pintar();};
  const bx=$("#xlsDia"); if(bx) bx.onclick=()=>descargarExcel(diaRec,null,bx);
  v.querySelectorAll("[data-rec]").forEach(b=>b.onclick=()=>verRecibo(b.dataset.rec));
}

function telWhatsApp(t){ let d=String(t||"").replace(/\D/g,""); if(d.length===10&&d[0]==="3") d="57"+d; return d; }
const linkWhatsApp=(tel,txt)=>"https://wa.me/"+telWhatsApp(tel)+"?text="+encodeURIComponent(txt);
function textoRecibo(r){
  const L=[`*${EMPRESA.nombre}*`,`Recibo de cuadre · ${fechaLarga(diaRec)}`,`Cliente: *${r.nombre}*`,""];
  if(r.anterior) L.push(`Saldo anterior: ${pesos(r.anterior)}`);
  r.lineas.forEach(l=>L.push(l.p?`• ${l.t} (${l.guia}) · ${metodoTxt(l.p)} · cobró ${pesos(l.p.valorCobrado)} · ${textoDomi(l.p)} → ${pesos(l.v)}`:`• ${l.t} → ${pesos(l.v)}`));
  L.push("",`*Total: ${pesos(r.total)}*`);
  if(r.pagos) L.push(`Pagado: ${pesos(r.pagos)}`,`*Queda pendiente: ${pesos(r.queda)}*`);
  L.push(r.queda>0?"JS le debe este valor.":r.queda<0?"Este valor queda pendiente por pagar a JS.":"Cuadre en cero.","",EMPRESA.lema,EMPRESA.tel);
  return L.join("\n");
}
function verRecibo(cid){
  const r=cuadreDia(diaRec).find(x=>x.cid===cid); if(!r){ cerrarDlg(); return; }
  $("#dlgCont").innerHTML=`<header><h2>Recibo de cuadre</h2><button class="cerrar" data-cerrar aria-label="Cerrar">×</button></header>
  <div class="ticket">
    <div class="t-cab"><img src="${LOGO}" alt=""><b>${EMPRESA.nombre}</b><span>Recibo de cuadre</span><span>${fechaLarga(diaRec)}</span></div>
    <div class="t-cli">${esc(r.nombre)}</div>
    ${r.anterior?`<div class="t-l"><span>Saldo anterior</span><span>${pesos(r.anterior)}</span></div>`:""}
    ${r.lineas.map(l=>`<div class="t-l"><span>${esc(l.t)}${l.p?`<small>${esc(l.guia)} · ${metodoTxt(l.p)} · cobró ${pesos(l.p.valorCobrado)} · ${textoDomi(l.p)}</small>`:""}</span><span>${pesos(l.v)}</span></div>`).join("")}
    <div class="t-l t-total"><span>Total</span><span>${pesos(r.total)}</span></div>
    ${r.pagos?`<div class="t-l"><span>Pagado</span><span>${pesos(r.pagos)}</span></div><div class="t-l t-total"><span>Queda pendiente</span><span>${pesos(r.queda)}</span></div>`:""}
    <div class="t-pie">${EMPRESA.lema}<br>${EMPRESA.tel}<br>${EMPRESA.ig}</div>
  </div>
  <p class="sub" style="margin-top:12px;text-align:center">${r.queda>0?"Cuenta por pagar: JS le debe entregar este valor al cliente.":r.queda<0?"Cuenta por cobrar: el cliente le debe este valor a JS.":"Cuadre en cero."}</p>
  <div class="acciones" style="justify-content:center">${esCliente?"":`<a class="btn ok" href="${linkWhatsApp(S.clientes[cid]?.telefono,textoRecibo(r))}" target="_blank" rel="noopener">Enviar por WhatsApp</a>`}<button class="btn sec" id="copiarRec">Copiar texto</button>${descargas?'<button class="btn" id="xlsUno">Descargar recibo en Excel</button>':""}${r.queda&&esAdmin?`<button class="btn ok" id="liquidar">${r.queda>0?"Registrar que JS pagó ":"Registrar que el cliente pagó "}${pesos(Math.abs(r.queda))}</button>`:""}</div>`;
  abrirDlg();
  const bx=$("#xlsUno"); if(bx) bx.onclick=()=>descargarExcel(diaRec,cid,bx);
  $("#copiarRec").onclick=async()=>{ try{ await navigator.clipboard.writeText(textoRecibo(r)); toast("Texto copiado. Pégalo en WhatsApp."); }catch(e){ toast("No se pudo copiar en este navegador"); } };
  const lq=$("#liquidar"); if(lq) lq.onclick=async()=>{ lq.disabled=true; const id=nuevoId();
    try{ await guardar("movimientos",id,{id,clienteId:cid,tipo:r.queda>0?"pago_a_cliente":"pago_de_cliente",valor:Math.abs(r.queda),medio:"efectivo",nota:"Cuadre del "+diaRec,fecha:fechaDia(diaRec)});
      toast("Pago registrado"); setTimeout(()=>verRecibo(cid),200); }catch(e){ lq.disabled=false; toast("No se pudo guardar"); } };
}

async function descargarExcel(dia,soloCid,btn){
  if(!descargas) return;
  if(!window.ExcelJS) return toast("El generador de Excel no ha cargado. Espera unos segundos e intenta de nuevo.");
  const txt=btn.textContent; btn.disabled=true; btn.textContent="Preparando…";
  try{
    const lista=cuadreDia(dia).filter(r=>!soloCid||r.cid===soloCid);
    const wb=new ExcelJS.Workbook(); wb.creator="JS Logistics";
    const MON='"$" #,##0;[Red]-"$" #,##0';
    const cab=row=>{ row.eachCell(c=>{ c.font={bold:true,color:{argb:"FFFFFFFF"}}; c.fill={type:"pattern",pattern:"solid",fgColor:{argb:"FF115072"}}; c.alignment={vertical:"middle"}; }); row.height=20; };
    const [y,mo,d]=dia.split("-"); const corto=`${d}-${mo}-${y}`;

    // Recibos imprimibles
    const wr=wb.addWorksheet(soloCid?"Recibo":"Recibos");
    wr.columns=[{width:32},{width:15}];
    let fila=1, enPagina=0;
    for(const r of lista){
      const alto=12+r.lineas.length+(r.anterior?1:0)+(r.pagos?2:0);
      if(enPagina && enPagina+alto>52){ wr.getRow(fila-1).addPageBreak(); enPagina=0; }
      const put=(a,b,o={})=>{ const row=wr.getRow(fila++); row.getCell(1).value=a;
        if(b!==undefined&&b!==null){ row.getCell(2).value=b; row.getCell(2).numFmt=MON; }
        if(o.center){ wr.mergeCells(row.number,1,row.number,2); row.getCell(1).alignment={horizontal:"center"}; }
        else row.getCell(1).alignment={wrapText:true,vertical:"top"};
        if(o.bold) [1,2].forEach(c=>row.getCell(c).font={bold:true,size:o.size||11});
        if(o.abajo) [1,2].forEach(c=>row.getCell(c).border={bottom:{style:"dashed"}});
        if(o.arriba) [1,2].forEach(c=>row.getCell(c).border={top:{style:"dashed"}});
        return row; };
      put(EMPRESA.nombre,null,{bold:true,center:true});
      put("RECIBO DE CUADRE",null,{bold:true,center:true});
      put(fechaLarga(dia),null,{center:true});
      put(r.nombre,null,{bold:true,size:14,center:true,abajo:true});
      const ini=fila;
      if(r.anterior) put("Saldo anterior",r.anterior);
      r.lineas.forEach(l=>put(l.t,l.v));
      const fin=fila-1;
      const tRow=put("TOTAL:",null,{bold:true,arriba:true});
      tRow.getCell(2).value = fin>=ini ? {formula:`SUM(B${ini}:B${fin})`,result:r.total} : r.total; tRow.getCell(2).numFmt=MON;
      if(r.pagos){ put("Pagado",r.pagos); const q=put("QUEDA PENDIENTE:",null,{bold:true}); q.getCell(2).value={formula:`B${tRow.number}+B${tRow.number+1}`,result:r.queda}; q.getCell(2).numFmt=MON; }
      put("");
      put(EMPRESA.lema,null,{bold:true,center:true}); put(EMPRESA.tel,null,{center:true}); put(EMPRESA.ig,null,{center:true});
      put("- - - - - - - - - - - - - - - - - - - - - - - -",null,{center:true}); put("");
      enPagina+=alto;
    }
    wr.pageSetup={orientation:"portrait",fitToPage:true,fitToWidth:1,fitToHeight:0,horizontalCentered:true,margins:{left:.4,right:.4,top:.4,bottom:.4,header:.2,footer:.2},printArea:`A1:B${Math.max(1,fila-1)}`};

    if(!soloCid){
      const ent=Object.values(S.pedidos).filter(p=>cerrado(p)&&diaDe(p.entregado)===dia).sort((a,b)=>a.entregado-b.entregado);
      const n=ent.length;
      // Resumen por cliente
      const wc=wb.addWorksheet("Resumen clientes",{views:[{state:"frozen",ySplit:1}]});
      wc.columns=[{header:"Cliente",width:26},{header:"Saldo anterior",width:15,style:{numFmt:MON}},{header:"Entregas del día",width:16,style:{numFmt:MON}},{header:"Ajustes del día",width:15,style:{numFmt:MON}},{header:"Total cuadre",width:15,style:{numFmt:MON}},{header:"Pagado",width:13,style:{numFmt:MON}},{header:"Queda pendiente",width:16,style:{numFmt:MON}},{header:"Tipo de cuenta",width:15}];
      cab(wc.getRow(1));
      lista.forEach((r,i)=>{ const k=i+2; const ped=r.lineas.filter(l=>l.p).reduce((a,l)=>a+l.v,0);
        wc.addRow([r.nombre,r.anterior,null,r.delDia-ped,null,r.pagos,null]);
        wc.getCell("C"+k).value={formula:`SUMIF(Pedidos!D:D,A${k},Pedidos!H:H)`,result:ped};
        wc.getCell("E"+k).value={formula:`B${k}+C${k}+D${k}`,result:r.total};
        wc.getCell("G"+k).value={formula:`E${k}+F${k}`,result:r.queda};
        wc.getCell("H"+k).value={formula:`IF(G${k}>0,"Por pagar",IF(G${k}<0,"Por cobrar","Paz y salvo"))`,result:tipoCuenta(r.queda)}; });
      const tc=lista.length+2; wc.getCell("A"+tc).value="TOTAL"; wc.getRow(tc).font={bold:true};
      const sumL=(f)=>lista.reduce((a,r)=>a+f(r),0);
      [["B",r=>r.anterior],["C",r=>r.lineas.filter(l=>l.p).reduce((a,l)=>a+l.v,0)],["D",r=>r.delDia-r.lineas.filter(l=>l.p).reduce((a,l)=>a+l.v,0)],["E",r=>r.total],["F",r=>r.pagos],["G",r=>r.queda]]
        .forEach(([c,f])=>wc.getCell(c+tc).value={formula:`SUM(${c}2:${c}${tc-1})`,result:sumL(f)});

      // Pedidos del día (como tu hoja diaria)
      const wp=wb.addWorksheet("Pedidos",{views:[{state:"frozen",ySplit:1}]});
      wp.columns=[{header:"Guía",width:11},{header:"Mensajero",width:16},{header:"Precio",width:11,style:{numFmt:MON}},{header:"Cliente",width:22},{header:"Destinatario",width:24},{header:"Cobro",width:12,style:{numFmt:MON}},{header:"Método",width:24},{header:"Saldo",width:12,style:{numFmt:MON}},{header:"Pagó domicilio",width:15,style:{numFmt:MON}},{header:"Flete / gasto",width:13,style:{numFmt:MON}}];
      cab(wp.getRow(1));
      ent.forEach((p,i)=>{ const k=i+2;
        wp.addRow([p.guia,S.mensajeros[p.mensajeroId]?.nombre||"",servicio(p),nombreCliente(p.clienteId)||"SIN REMITENTE",p.destinatario||"",Number(p.valorCobrado)||0,metodoTxt(p),null,pagoDomi(p),gastoDe(p)]);
        wp.getCell("H"+k).value={formula:`IF(G${k}="${METODOS.transf_cliente.t}",0,F${k})-C${k}-J${k}+I${k}`,result:saldoPedido(p)}; });
      const tp=n+2; wp.getCell("A"+tp).value="TOTAL"; wp.getRow(tp).font={bold:true};
      wp.getCell("C"+tp).value={formula:`SUM(C2:C${tp-1})`,result:ent.reduce((a,p)=>a+servicio(p),0)};
      wp.getCell("F"+tp).value={formula:`SUM(F2:F${tp-1})`,result:ent.reduce((a,p)=>a+(Number(p.valorCobrado)||0),0)};
      wp.getCell("H"+tp).value={formula:`SUM(H2:H${tp-1})`,result:ent.reduce((a,p)=>a+saldoPedido(p),0)};

      // Mensajeros
      const wm=wb.addWorksheet("Mensajeros",{views:[{state:"frozen",ySplit:1}]});
      wm.columns=[{header:"Mensajero",width:18},{header:"Entregas",width:10},{header:"Domicilios",width:13,style:{numFmt:MON}},{header:"Sueldo (70% - 25.000)",width:20,style:{numFmt:MON}},{header:"Efectivo",width:13,style:{numFmt:MON}},{header:"Transf. a JS",width:13,style:{numFmt:MON}},{header:"Directo al cliente",width:16,style:{numFmt:MON}},{header:"Entregó",width:13,style:{numFmt:MON}},{header:"Debe",width:13,style:{numFmt:MON}}];
      cab(wm.getRow(1));
      const porM={}; ent.forEach(p=>(porM[p.mensajeroId]=porM[p.mensajeroId]||[]).push(p));
      Object.entries(porM).forEach(([mid,ps],i)=>{ const k=i+2, t=totales(ps), nom=S.mensajeros[mid]?.nombre||"Sin nombre";
        wm.addRow([nom,null,null,null,null,null,null,null,null]);
        wm.getCell("B"+k).value={formula:`COUNTIF(Pedidos!B:B,A${k})`,result:ps.length};
        wm.getCell("C"+k).value={formula:`SUMIF(Pedidos!B:B,A${k},Pedidos!C:C)`,result:t.servicio};
        wm.getCell("D"+k).value=ganaPorcentaje(S.mensajeros[mid])?{formula:`C${k}*${PCT_SUELDO}-${DESC_SUELDO}`,result:sueldoPedidos(ps)}:(TIPOS[tipoDe(S.mensajeros[mid])]||"");
        wm.getCell("E"+k).value={formula:`SUMIFS(Pedidos!F:F,Pedidos!B:B,A${k},Pedidos!G:G,"${METODOS.efectivo.t}")`,result:t.efectivo};
        wm.getCell("F"+k).value={formula:`SUMIFS(Pedidos!F:F,Pedidos!B:B,A${k},Pedidos!G:G,"${METODOS.transf_js.t}")`,result:t.transfJs};
        wm.getCell("G"+k).value={formula:`SUMIFS(Pedidos!F:F,Pedidos!B:B,A${k},Pedidos!G:G,"${METODOS.transf_cliente.t}")`,result:t.transfCli};
        wm.getCell("H"+k).value=recibidoDia(mid,dia);
        wm.getCell("I"+k).value={formula:`E${k}-H${k}`,result:t.efectivo-recibidoDia(mid,dia)}; });
    }

    const buf=await wb.xlsx.writeBuffer();
    const slug=s=>s.normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/[^\w]+/g,"-").replace(/^-|-$/g,"").toLowerCase();
    const nombre = soloCid ? `recibo-${slug(nombreCliente(soloCid))}-${corto}.xlsx` : `cuadre-${corto}.xlsx`;
    await descargas.save({filename:nombre, data:new Blob([buf])});
  }catch(e){
    console.error(e);
    if(e?.code!=="declined") toast("No se pudo generar el Excel.");
  }finally{ btn.disabled=false; btn.textContent=txt; }
}

let filtroCli="todos";
async function descargarCartera(btn){
  if(!descargas) return;
  if(!window.ExcelJS) return toast("El generador de Excel no ha cargado. Espera unos segundos e intenta de nuevo.");
  const txt=btn.textContent; btn.disabled=true; btn.textContent="Preparando…";
  try{
    const MON='"$" #,##0';
    const cs=listaOrdenada(S.clientes,"nombre").map(c=>({...c,s:saldoCliente(c.id)}));
    const wb=new ExcelJS.Workbook(); wb.creator="JS Logistics";
    const hoja=(titulo,lista,signo)=>{
      const w=wb.addWorksheet(titulo,{views:[{state:"frozen",ySplit:2}]});
      w.mergeCells("A1:D1"); w.getCell("A1").value=`${titulo.toUpperCase()} · corte ${fechaLarga(hoy())}`; w.getCell("A1").font={bold:true,size:13};
      w.getRow(2).values=["Cliente","Número","Valor","Último movimiento"];
      w.columns=[{width:28},{width:16},{width:15,style:{numFmt:MON}},{width:20}];
      w.getRow(2).eachCell(c=>{ c.font={bold:true,color:{argb:"FFFFFFFF"}}; c.fill={type:"pattern",pattern:"solid",fgColor:{argb:"FF115072"}}; });
      lista.forEach(c=>{ const ult=Math.max(0,...Object.values(S.pedidos).filter(p=>p.clienteId===c.id&&p.entregado).map(p=>p.entregado),...Object.values(S.movimientos).filter(m=>m.clienteId===c.id).map(m=>m.fecha));
        w.addRow([c.nombre,c.telefono||"",Math.abs(c.s),ult?new Date(ult).toLocaleDateString("es-CO"):""]); });
      const t=lista.length+3; w.getCell("A"+t).value="TOTAL"; w.getRow(t).font={bold:true};
      w.getCell("C"+t).value={formula:`SUM(C3:C${t-1})`,result:lista.reduce((a,c)=>a+Math.abs(c.s),0)}; w.getCell("C"+t).numFmt=MON;
    };
    hoja("Cuentas por cobrar",cs.filter(c=>c.s<0));
    hoja("Cuentas por pagar",cs.filter(c=>c.s>0));
    const buf=await wb.xlsx.writeBuffer();
    const [y,mo,d]=hoy().split("-");
    await descargas.save({filename:`cartera-clientes-${d}-${mo}-${y}.xlsx`, data:new Blob([buf])});
  }catch(e){ console.error(e); if(e?.code!=="declined") toast("No se pudo generar el Excel."); }
  finally{ btn.disabled=false; btn.textContent=txt; }
}

/* ======================= CAJA GENERAL ======================= */
const MEDIOS_CAJA={...MEDIOS, cuentas:"Cuentas JS (transferencias)"};
const CATS={arqueo:"Arqueo",interna:"Cuenta interna",inicial:"Caja inicial",otro_entra:"Otra entrada",sobrante:"Sobrante de caja",gasto:"Gasto",base:"Base para vueltos",arriendo:"Arriendo",adelanto:"Adelanto",sueldo:"Pago de sueldo",otro:"Otra salida"};
const CATS_TIPO={entra:["otro_entra"],sale:["gasto","base","arriendo","adelanto","sueldo","otro"]};
const CATS_PERSONA=["adelanto","sueldo","base"]; // movimientos de caja que van a nombre de una persona
const CATS_SEMANA=["adelanto","sueldo"]; // se descuentan del sueldo de la semana que se elige, sin importar el día en que salió la plata
/* Semanas para elegir: la que se paga (o esta), la anterior y hasta 6 atrás, más la que venga de Sueldos. */
function semanasSueldo(pre){
  const l=semanasAdelanto(), ya=new Set(l.map(([w])=>w)), txt=w=>{ const d=diasSemana(w); return "Semana del "+new Date(d[0]+"T12:00:00").toLocaleDateString("es-CO",{day:"numeric",month:"short"})+" al "+new Date(d[6]+"T12:00:00").toLocaleDateString("es-CO",{day:"numeric",month:"short"}); };
  for(let i=2;i<=6;i++){ const w=moverSemana(semanaDe(hoy()),-i); if(!ya.has(w)){ l.push([w,txt(w)]); ya.add(w); } }
  if(pre&&!ya.has(pre)) l.unshift([pre,txt(pre)]);
  return l;
}
let diaLibro=hoy();
/* ---- Arqueo: el conteo real de la plata ----
   Lo que ya se contó no se cambia ni se borra: si algo quedó mal, se corrige con un movimiento nuevo.
   La diferencia entre lo contado y lo que la app esperaba queda como faltante o sobrante, con fecha y quién contó. */
let corteRemoto=0; // el asistente no ve los arqueos: lee solo la fecha del último en meta/caja
function corteCaja(sin){ let c=corteRemoto; for(const x of Object.values(S.cajamovs)) if((x.cat==="arqueo"||x.cat==="inicial")&&!(sin&&sin.includes(x.id))) c=Math.max(c,Number(x.fecha)||0); return c; }
async function leerCorte(){ try{ const c=await leer("meta","caja"); corteRemoto=Number(c?.corte)||0; }catch(e){} }
const yaContado = f => { const c=corteCaja(); return !!c && Number(f)<=c; };
const avisoContado = () => toast("Eso ya quedó contado en el arqueo del "+hora(corteCaja())+". Para corregirlo, registra un movimiento nuevo.");
const diaMinCaja = () => corteCaja()?diaDe(corteCaja()):"";
const fechaCaja = dia => Math.max(fechaDia(dia),corteCaja()+1); // lo del mismo día del arqueo queda después del arqueo
const diaAntesDelArqueo = dia => { const m=diaMinCaja(); if(m&&dia<m){ toast("La caja ya se contó el "+fechaLarga(m)+": no se pueden registrar movimientos de días anteriores."); return true; } return false; };
/* Las líneas de caja que produce un pedido: transferencia a JS y pago del domicilio. */
const lineasCajaPedido = p => [...(cerrado(p)&&p.metodo==="transf_js"?[[p.entregado,p.cuentaJs||"cuentas",Number(p.valorCobrado)||0]]:[]),...(p.domiPagado&&p.domiPagoMedio?[[p.domiPagoFecha||p.entregado||p.creado,p.domiPagoMedio,pagoDomi(p)]]:[])];
function cambiaLoContado(antes,despues){ const c=corteCaja(); if(!c) return false;
  const k=p=>p?lineasCajaPedido(p).filter(l=>l[0]<=c).map(l=>l.join("|")).sort().join(";"):""; return k(antes)!==k(despues); }
function arqueosCaja(){
  const g={}; for(const c of Object.values(S.cajamovs)) if(c.cat==="arqueo"){ const a=g[c.arqueoId||c.id]=g[c.arqueoId||c.id]||{id:c.arqueoId||c.id,fecha:c.fecha,dif:{},docs:[]}; a.docs.push(c.id);
    if(c.tipo==="marca") Object.assign(a,{esperado:c.esperado||{},contado:c.contado||{},nota:c.concepto||"",por:c.porNombre||""}); else a.dif[c.medio]=(a.dif[c.medio]||0)+(c.tipo==="entra"?1:-1)*(Number(c.valor)||0); }
  return Object.values(g).sort((a,b)=>b.fecha-a.fecha);
}
/* Lo que la app espera que tengas tú: la caja general menos lo que está en las cajas de oficina (eso se cuenta al recibir el cierre). */
function esperadoArqueo(){
  const R=resumenCaja(), of={efectivo:0,nequi:0,bancolombia:0};
  if(esAdmin) asistentes().forEach(u=>{ const x=cajaOficina(u.uid).saldo; for(const k in of) of[k]+=x[k]; });
  const e={}; for(const k of Object.keys(MEDIOS)) e[k]=Math.round((R.porMedio[k]||0)-of[k]);
  return {e,of,sinCuenta:Math.round(R.porMedio.cuentas||0)};
}
const resultadoArqueo = a => { const f=Object.entries(a.dif).filter(([,x])=>Math.round(x)); return f.length?f.map(([m,x])=>`${x<0?"faltó":"sobró"} ${pesos(Math.abs(x))} en ${MEDIOS[m]||m}`).join(" · "):"Cuadró exacto"; };
function hacerArqueo(){
  const {e,of,sinCuenta}=esperadoArqueo(), conOf=Object.values(of).some(x=>Math.round(x));
  $("#dlgCont").innerHTML=`<header><div><h2>Arqueo de caja</h2><span class="sub">Cuenta la plata que tienes ahora mismo</span></div><button class="cerrar" data-cerrar aria-label="Cerrar">×</button></header>
    <p class="sub">Escribe lo que cuentas en cada medio: el efectivo en la mano y el saldo que ves en la app de Nequi y de Bancolombia. La diferencia queda registrada como faltante o sobrante y desde ese momento esa plata ya no se puede cambiar.</p>
    ${sinCuenta?`<div class="aviso alerta">Hay ${pesos(sinCuenta)} en transferencias a JS sin cuenta asignada. Antes del arqueo, abre esos pedidos y elige si llegaron a Nequi o a Bancolombia.</div>`:""}
    ${conOf?`<div class="aviso">No cuentes la plata de las cajas de oficina (${Object.entries(of).filter(([,x])=>Math.round(x)).map(([k,x])=>MEDIOS[k]+" "+pesos(x)).join(" · ")}): esa se cuenta cuando recibes el cierre de cada asistente.</div>`:""}
    ${Object.entries(MEDIOS).map(([k,t])=>`<div class="linea2" style="align-items:center"><div class="campo"><label for="aq_${k}">${t} que cuentas</label><input id="aq_${k}" data-aq="${k}" type="number" inputmode="numeric" min="0" step="100"></div>
      <div class="campo"><span class="lbl">La app espera</span><b style="font-size:1.1rem">${pesos(e[k])}</b><span class="sub" id="aqd_${k}" style="margin:0"></span></div></div>`).join("")}
    <div class="campo"><label for="aqNota">Nota (opcional)</label><input id="aqNota" placeholder="Ej: arqueo de cierre del sábado"></div>
    <button class="btn ok" id="aqGuardar" style="width:100%">Guardar arqueo</button>`;
  abrirDlg(); $("#aq_efectivo").focus();
  const leerC=()=>Object.fromEntries(Object.keys(MEDIOS).map(k=>[k,$("#aq_"+k).value]));
  const ver=()=>{ const c=leerC(); for(const k of Object.keys(MEDIOS)){ const d=c[k]===""?null:Math.round(Number(c[k])-e[k]), el=$("#aqd_"+k);
    el.innerHTML=d===null?"":d===0?'<b class="pos">Cuadra</b>':d<0?`<b class="neg">Falta ${pesos(-d)}</b>`:`<b class="pos">Sobra ${pesos(d)}</b>`; } };
  document.querySelectorAll("[data-aq]").forEach(i=>i.oninput=ver);
  $("#aqGuardar").onclick=async()=>{ const c=leerC();
    if(Object.values(c).some(x=>x==="")) return toast("Escribe lo que contaste en cada medio (0 si no hay nada)");
    if(Object.values(c).some(x=>Number(x)<0)) return toast("Los valores no pueden ser negativos");
    const b=$("#aqGuardar"); b.disabled=true; const aid=nuevoId(), t=Date.now(), nota=$("#aqNota").value.trim(), contado=Object.fromEntries(Object.entries(c).map(([k,x])=>[k,Math.round(Number(x))]));
    try{ for(const k of Object.keys(MEDIOS)){ const d=contado[k]-e[k]; if(!d) continue; const id=nuevoId();
        await guardar("cajamovs",id,{id,cat:"arqueo",tipo:d>0?"entra":"sale",valor:Math.abs(d),medio:k,arqueoId:aid,personaId:"",concepto:nota,fecha:t,porNombre:miNombre()}); }
      await rawSet("meta","caja",{corte:t});
      await guardar("cajamovs",aid,{id:aid,cat:"arqueo",tipo:"marca",valor:0,medio:"",arqueoId:aid,personaId:"",esperado:e,contado,oficina:of,concepto:nota,fecha:t,porNombre:miNombre()});
      cerrarDlg(); const a=arqueosCaja().find(x=>x.id===aid); toast("Arqueo guardado: "+(a?resultadoArqueo(a):"listo")); }
    catch(err){ b.disabled=false; toast("No se pudo guardar el arqueo"); } };
}
async function deshacerArqueo(id){
  const a=arqueosCaja().find(x=>x.id===id); if(!a) return;
  if(!await confirmar("Deshacer el arqueo del "+hora(a.fecha),"Se quitan el conteo y su faltante o sobrante. La caja vuelve a quedar abierta hasta el arqueo anterior.","Deshacer")) return;
  try{ const antes=corteCaja(a.docs); corteRemoto=0; for(const d of a.docs) await borrar("cajamovs",d); await rawSet("meta","caja",{corte:antes}); toast("Arqueo deshecho"); }catch(e){ toast("No se pudo deshacer"); }
}
function libroCaja(){
  const L=[], nomM=id=>S.mensajeros[id]?.nombre||"";
  for(const r of Object.values(S.recaudos)) L.push({fecha:r.fecha,concepto:"Entrega de "+nomM(r.mensajeroId)+(r.nota?" · "+r.nota:""),valor:Number(r.valor)||0,medio:r.medio||"efectivo",cat:"Mensajeros",ref:"recaudos|"+r.id});
  for(const p of Object.values(S.pedidos)) if(cerrado(p)&&p.metodo==="transf_js") L.push({fecha:p.entregado,concepto:"Transferencia a JS · "+p.guia+(p.destinatario?" · "+p.destinatario:""),valor:Number(p.valorCobrado)||0,medio:p.cuentaJs||"cuentas",cat:"Transferencias"});
  for(const p of Object.values(S.pedidos)) if(p.domiPagado&&p.domiPagoMedio) L.push({fecha:p.domiPagoFecha||p.entregado||p.creado,concepto:"Pago de domicilio · "+p.guia+(p.clienteId?" · "+nombreCliente(p.clienteId):""),valor:pagoDomi(p),medio:p.domiPagoMedio,cat:"Clientes"});
  for(const m of Object.values(S.movimientos)) if(mueveCaja(m)) L.push({fecha:m.fecha,concepto:(m.tipo==="pago_de_cliente"?"Pago de ":m.tipo==="compra_cliente"?"Compra por encargo de ":"Pago a ")+nombreCliente(m.clienteId)+(m.nota?" · "+m.nota:""),valor:signoMov(m),medio:m.medio||"efectivo",cat:"Clientes"});
  for(const c of Object.values(S.cajamovs)) if((c.cat==="interna"&&c.inicial)||c.cat==="oficina"||c.deLiquidacion||(c.cat==="arqueo"&&c.tipo==="marca")) continue; // oficina: la plata pasa de tus manos a las del asistente // saldo inicial de la cuenta: la plata salió antes del empalme // adelanto de una liquidación: el mensajero ya tenía esa plata, no sale de la caja
  else if(c.cat==="arqueo") L.push({fecha:c.fecha,concepto:(c.tipo==="entra"?"Sobrante":"Faltante")+" de arqueo"+(c.concepto?" · "+c.concepto:""),valor:(c.tipo==="entra"?1:-1)*(Number(c.valor)||0),medio:c.medio||"efectivo",cat:"Arqueo",ref:"cajamovs|"+c.id});
  else if(c.cat==="interna"){ const n=S.cuentas[c.cuentaId]?.nombre||"Cuenta interna";
    L.push({fecha:c.fecha,concepto:(c.tipo==="entra"?"Entrada de ":"Salida a ")+n+(c.concepto?" · "+c.concepto:""),valor:(c.tipo==="entra"?1:-1)*(Number(c.valor)||0),medio:c.medio||"efectivo",cat:n,ref:"cajamovs|"+c.id}); }
  else L.push({fecha:c.fecha,concepto:(CATS[c.cat]||"Movimiento")+(c.personaId?" · "+nomM(c.personaId):"")+(c.concepto?" · "+c.concepto:""),valor:(c.tipo==="entra"?1:-1)*(Number(c.valor)||0),medio:c.medio||"efectivo",cat:CATS[c.cat]||"Otro",ref:"cajamovs|"+c.id});
  return L.sort((a,b)=>a.fecha-b.fecha);
}
function resumenCaja(){
  const L=libroCaja(), total=L.reduce((a,x)=>a+x.valor,0);
  const porMedio={}; L.forEach(x=>porMedio[x.medio]=(porMedio[x.medio]||0)+x.valor);
  let porPagar=0, porCobrar=0; Object.keys(S.clientes).forEach(id=>{ const s=saldoCliente(id); if(s>0) porPagar+=s; else porCobrar-=s; });
  const sem=resumenSemana(semanaDe(hoy())); const sueldosPend=sem.filas.reduce((a,f)=>a+Math.max(0,f.neto),0);
  const enMens=Object.values(S.mensajeros).filter(esRepartidor).reduce((a,m)=>a+Math.max(0,periodoMensajero(m.id).debe),0);
  const sobs=Object.values(S.cajamovs).filter(c=>c.cat==="sobrante"), mes=hoy().slice(0,7);
  const sobrantes={n:sobs.length,total:sobs.reduce((a,c)=>a+(Number(c.valor)||0),0),mes:sobs.filter(c=>diaDe(c.fecha).startsWith(mes)).reduce((a,c)=>a+(Number(c.valor)||0),0)};
  return {L,total,porMedio,porPagar,porCobrar,sueldosPend,enMens,sobrantes,disponible:total-porPagar-sueldosPend};
}
function bloqueCajaGeneral(){
  const R=resumenCaja();
  const delDia=R.L.filter(x=>diaDe(x.fecha)===diaLibro);
  const ent=delDia.filter(x=>x.valor>0).reduce((a,x)=>a+x.valor,0), sal=delDia.filter(x=>x.valor<0).reduce((a,x)=>a-x.valor,0);
  return `<div class="cifras">
    <div class="cifra fuerte"><span>Total en caja</span><b>${pesos(R.total)}</b><span>${Object.entries(R.porMedio).filter(([,x])=>Math.round(x)).map(([m,x])=>`${MEDIOS_CAJA[m]||m}: ${pesos(x)}`).join(" · ")||"Sin movimientos"}</span></div>
    <div class="cifra"><span>De clientes (cuentas por pagar)</span><b>${pesos(R.porPagar)}</b><span>Se resta cuando les pagas</span></div>
    <div class="cifra"><span>Sueldos por pagar esta semana</span><b>${pesos(R.sueldosPend)}</b></div>
    <div class="cifra"><span>Disponible de JS</span><b class="${R.disponible<0?"neg":""}">${pesos(R.disponible)}</b><span>Caja − clientes − sueldos</span></div>
    <div class="cifra"><span>Todavía en manos de mensajeros</span><b>${pesos(R.enMens)}</b></div>
    <div class="cifra"><span>Cuentas por cobrar a clientes</span><b>${pesos(R.porCobrar)}</b></div>
    ${(()=>{ const a=arqueosCaja()[0]; return `<div class="cifra"><span>Último arqueo</span><b>${a?hora(a.fecha):"Nunca"}</b><span>${a?resultadoArqueo(a):"Cuenta la plata real para comprobar que cuadra"}</span></div>`; })()}
    ${R.sobrantes.n?`<div class="cifra"><span>Sobrantes de cajas de oficina</span><b class="pos">${pesos(R.sobrantes.mes)}</b><span>Este mes · ${R.sobrantes.n} en total (${pesos(R.sobrantes.total)})</span></div>`:""}
  </div>
  <div class="acciones" style="margin:14px 0"><button class="btn" id="cjArqueo">Hacer arqueo</button><button class="btn ok" id="cjEntra">Registrar entrada</button><button class="btn sec" id="cjSale">Registrar salida o gasto</button>${descargas?'<button class="btn sec" id="cjXls">Descargar cuadre de caja</button>':""}</div>
  <h2>Movimientos de caja</h2>
  <div class="campo" style="max-width:220px"><label for="diaL">Día</label><input type="date" id="diaL" value="${diaLibro}"></div>
  ${delDia.length?`<div class="tabla-env"><table><thead><tr><th>Hora</th><th>Concepto</th><th>Tipo</th><th>Medio</th><th class="n">Valor</th><th></th></tr></thead><tbody>
  ${delDia.map(x=>`<tr><td>${hora(x.fecha)}</td><td>${esc(x.concepto)}</td><td>${esc(x.cat)}</td><td>${MEDIOS_CAJA[x.medio]||""}</td><td class="n ${x.valor<0?"neg":"pos"}">${pesos(x.valor)}</td><td>${x.ref?`<button class="btn peligro chico" data-delref="${esc(x.ref)}">Quitar</button>`:""}</td></tr>`).join("")}
  <tr><td></td><td><b>Entradas ${pesos(ent)} · Salidas ${pesos(sal)}</b></td><td></td><td></td><td class="n"><b>${pesos(ent-sal)}</b></td><td></td></tr>
  </tbody></table></div>`:`<div class="vacio">Sin movimientos de caja este día.</div>`}
  ${(()=>{ const A=arqueosCaja().slice(0,10); if(!A.length) return ""; const M=Object.keys(MEDIOS);
    return `<h2>Arqueos</h2><div class="tabla-env"><table><thead><tr><th>Fecha</th>${M.map(k=>`<th class="n">${MEDIOS[k]}<br><small>contado / esperado</small></th>`).join("")}<th>Resultado</th><th>Contó</th><th></th></tr></thead><tbody>
    ${A.map((a,i)=>`<tr><td>${hora(a.fecha)}${a.nota?`<br><span class="sub" style="font-size:.8rem">${esc(a.nota)}</span>`:""}</td>${M.map(k=>`<td class="n">${a.contado?pesos(a.contado[k]):"—"}<br><span class="sub" style="font-size:.8rem">${a.esperado?pesos(a.esperado[k]):""}</span></td>`).join("")}<td class="${Object.values(a.dif).some(x=>x<0)?"neg":"pos"}">${resultadoArqueo(a)}</td><td>${esc(a.por||"")}</td><td>${i===0?`<button class="btn sec chico" data-deshacer="${esc(a.id)}">Deshacer</button>`:""}</td></tr>`).join("")}</tbody></table></div>`; })()}`;
}
function conectarCajaGeneral(v){
  $("#diaL").onchange=e=>{diaLibro=e.target.value||hoy(); pintar();};
  $("#cjArqueo").onclick=()=>hacerArqueo();
  v.querySelectorAll("[data-deshacer]").forEach(b=>b.onclick=()=>deshacerArqueo(b.dataset.deshacer));
  $("#cjEntra").onclick=()=>movCaja("entra");
  $("#cjSale").onclick=()=>movCaja("sale");
  const bx=$("#cjXls"); if(bx) bx.onclick=()=>descargarCajaExcel(bx);
  v.querySelectorAll("[data-delref]").forEach(b=>b.onclick=async()=>{ const [col,id]=b.dataset.delref.split("|"), x=S[col]?.[id]; if(!x) return;
    if(yaContado(x.fecha)) return avisoContado();
    if(!await confirmar("Quitar movimiento de caja",`${hora(x.fecha)} · ${pesos(x.valor)}. Se quita de la caja.`,"Quitar")) return;
    b.disabled=true; try{ await borrar(col,id); toast("Movimiento quitado"); }catch(e){ b.disabled=false; toast("No se pudo quitar"); } });
}
function movCaja(tipo,pre={}){
  const personas=listaOrdenada(S.mensajeros,"nombre");
  const cat0=pre.cat||CATS_TIPO[tipo][0];
  $("#dlgCont").innerHTML=`<header><h2>${tipo==="entra"?"Registrar entrada":"Registrar salida"}</h2><button class="cerrar" data-cerrar aria-label="Cerrar">×</button></header>
    <div class="linea2"><div class="campo"><label for="cjCat">Tipo</label><select id="cjCat">${CATS_TIPO[tipo].map(k=>`<option value="${k}" ${k===cat0?"selected":""}>${CATS[k]}</option>`).join("")}</select></div>
    <div class="campo" id="cjPerC"><label for="cjPer">Persona</label><select id="cjPer"><option value="">Elige…</option>${personas.map(m=>`<option value="${esc(m.id)}" ${m.id===pre.personaId?"selected":""}>${esc(m.nombre)}</option>`).join("")}</select></div></div>
    <div class="linea2"><div class="campo"><label for="cjVal">Valor</label><input id="cjVal" type="number" inputmode="numeric" min="0" step="1000" value="${pre.valor>0?Math.round(pre.valor):""}"></div>
    <div class="campo"><label for="cjMedio">Medio</label><select id="cjMedio">${Object.entries(MEDIOS).map(([k,t])=>`<option value="${k}">${t}</option>`).join("")}</select></div></div>
    <div class="campo" id="cjSemC"><label for="cjSem">Semana del sueldo</label><select id="cjSem">${semanasSueldo(pre.semana).map(([w,t])=>`<option value="${w}" ${w===pre.semana?"selected":""}>${t}</option>`).join("")}</select></div>
    <div class="linea2"><div class="campo"><label for="cjDia">Día en que salió o entró la plata</label><input id="cjDia" type="date" value="${pre.dia||hoy()}" min="${diaMinCaja()}" max="${hoy()}"></div>
    <div class="campo"><label for="cjCon">Detalle (opcional)</label><input id="cjCon" placeholder="Ej: gasolina, arriendo de mayo"></div></div>
    <button class="btn ${tipo==="entra"?"ok":""}" id="cjGuardar" style="width:100%">Guardar</button>`;
  abrirDlg();
  const ver=()=>{ $("#cjPerC").classList.toggle("oculto",!CATS_PERSONA.includes($("#cjCat").value)); $("#cjSemC").classList.toggle("oculto",!CATS_SEMANA.includes($("#cjCat").value)); }; $("#cjCat").onchange=ver; ver();
  $("#cjVal").focus();
  $("#cjGuardar").onclick=async()=>{ const val=Number($("#cjVal").value), cat=$("#cjCat").value, per=CATS_PERSONA.includes(cat)?$("#cjPer").value:"";
    if(!(val>0)) return toast("Escribe un valor mayor a cero"); if(CATS_PERSONA.includes(cat)&&!per) return toast("Elige la persona");
    const dia=$("#cjDia").value||hoy(), id=nuevoId(); if(diaAntesDelArqueo(dia)) return; const b=$("#cjGuardar"); b.disabled=true;
    try{ await guardar("cajamovs",id,{id,tipo,cat,personaId:per,valor:val,medio:$("#cjMedio").value,concepto:$("#cjCon").value.trim(),fecha:fechaCaja(dia),semana:CATS_SEMANA.includes(cat)?$("#cjSem").value:""});
      cerrarDlg(); toast((CATS[cat]||"Movimiento")+" registrado"); }catch(e){ b.disabled=false; toast("No se pudo guardar"); } };
}
async function descargarCajaExcel(btn){
  if(!window.ExcelJS) return toast("El generador de Excel no ha cargado. Espera unos segundos e intenta de nuevo.");
  const txt=btn.textContent; btn.disabled=true; btn.textContent="Preparando…";
  try{
    const R=resumenCaja(), MON='"$" #,##0;[Red]-"$" #,##0';
    const wb=new ExcelJS.Workbook(); wb.creator="JS Logistics";
    const cab=row=>row.eachCell(c=>{ c.font={bold:true,color:{argb:"FFFFFFFF"}}; c.fill={type:"pattern",pattern:"solid",fgColor:{argb:"FF115072"}}; });
    const n=R.L.length+1;
    const wr=wb.addWorksheet("Resumen"); wr.columns=[{width:38},{width:18,style:{numFmt:MON}}];
    wr.addRow([`CUADRE DE CAJA · ${fechaLarga(hoy())}`]).font={bold:true,size:13};
    wr.addRow([]);
    wr.addRow(["Total en caja",{formula:`SUM(Movimientos!E2:E${Math.max(2,n)})-SUM(Movimientos!F2:F${Math.max(2,n)})`,result:R.total}]).font={bold:true};
    Object.entries(R.porMedio).forEach(([m,x])=>wr.addRow(["   "+(MEDIOS_CAJA[m]||m),{formula:`SUMIF(Movimientos!D:D,"${MEDIOS_CAJA[m]||m}",Movimientos!E:E)-SUMIF(Movimientos!D:D,"${MEDIOS_CAJA[m]||m}",Movimientos!F:F)`,result:x}]));
    wr.addRow([]);
    const r1=wr.addRow(["De clientes (cuentas por pagar)",R.porPagar]).number;
    const r2=wr.addRow(["Sueldos por pagar esta semana",R.sueldosPend]).number;
    wr.addRow(["Disponible de JS",{formula:`B3-B${r1}-B${r2}`,result:R.disponible}]).font={bold:true};
    wr.addRow([]);
    wr.addRow(["Todavía en manos de mensajeros",R.enMens]);
    wr.addRow(["Cuentas por cobrar a clientes",R.porCobrar]);
    wr.eachRow(r=>r.getCell(2).numFmt=MON);
    const wm=wb.addWorksheet("Movimientos",{views:[{state:"frozen",ySplit:1}]});
    wm.columns=[{header:"Fecha",width:18},{header:"Concepto",width:42},{header:"Tipo",width:16},{header:"Medio",width:22},{header:"Entra",width:13,style:{numFmt:MON}},{header:"Sale",width:13,style:{numFmt:MON}},{header:"Saldo",width:14,style:{numFmt:MON}}];
    cab(wm.getRow(1)); let run=0;
    R.L.forEach((x,i)=>{ const k=i+2; run+=x.valor;
      wm.addRow([new Date(x.fecha).toLocaleString("es-CO"),x.concepto,x.cat,MEDIOS_CAJA[x.medio]||x.medio,x.valor>0?x.valor:null,x.valor<0?-x.valor:null,null]);
      wm.getCell("G"+k).value={formula:k===2?`E2-F2`:`G${k-1}+E${k}-F${k}`,result:run}; });
    const buf=await wb.xlsx.writeBuffer(); const [y,mo,d]=hoy().split("-");
    await descargas.save({filename:`cuadre-caja-${d}-${mo}-${y}.xlsx`,data:new Blob([buf])});
  }catch(e){ console.error(e); if(e?.code!=="declined") toast("No se pudo generar el Excel."); }
  finally{ btn.disabled=false; btn.textContent=txt; }
}

/* ======================= SUELDOS ======================= */
const DIAS_SEM=["Sáb","Dom","Lun","Mar","Mié","Jue","Vie"];
function semanaDe(dia){ const d=new Date(dia+"T12:00:00"); d.setDate(d.getDate()-((d.getDay()+1)%7)); return diaDe(d.getTime()); }
function diasSemana(sem){ return [...Array(7)].map((_,i)=>{ const d=new Date(sem+"T12:00:00"); d.setDate(d.getDate()+i); return diaDe(d.getTime()); }); }
function moverSemana(sem,n){ const d=new Date(sem+"T12:00:00"); d.setDate(d.getDate()+7*n); return diaDe(d.getTime()); }
let semSel=semanaDe(hoy());
const jornada=(pid,dia)=>Number(S.jornadas[pid+"_"+dia]?.valor)||0;
/* Sueldo anterior: lo que alguien ya llevaba ganado esa semana antes de usar la app (empalme).
   Se suma al total de la semana, pero no a ningún día, así no cambia el cálculo diario ni el de Javier. */
const previoId=(pid,sem)=>pid+"_previo_"+sem;
const sueldoPrevio=(pid,sem)=>Number(S.jornadas[previoId(pid,sem)]?.valor)||0;
function sueldosDia(dia){
  const ent=Object.values(S.pedidos).filter(p=>cerrado(p)&&diaDe(p.entregado)===dia);
  const res={}, porM={}; ent.forEach(p=>(porM[p.mensajeroId]=porM[p.mensajeroId]||[]).push(p));
  let dom30=0, propios=0, desc=0, fijos=0, nMens=0;
  for(const [mid,ps] of Object.entries(porM)){ const dom=ps.reduce((a,p)=>a+servicio(p),0);
    if(["dueno","oficina"].includes(tipoDe(S.mensajeros[mid]))) propios+=dom; // 100% para JS
    else { res[mid]=sueldoDe(dom); dom30+=dom*(1-PCT_SUELDO); desc+=DESC_SUELDO; nMens++; } }
  for(const m of Object.values(S.mensajeros)) if(PAGO_FIJO.includes(tipoDe(m))){ const x=jornada(m.id,dia); if(x){ res[m.id]=x; fijos+=x; } }
  const ganancias=Object.values(S.movimientos).filter(m=>m.tipo==="ganancia"&&diaDe(m.fecha)===dia).reduce((a,m)=>a+(Number(m.valor)||0),0); // 100% para JS
  const javier=dom30+propios+desc+ganancias-fijos;
  const dueno=Object.values(S.mensajeros).find(m=>tipoDe(m)==="dueno");
  if(dueno&&(ent.length||fijos||ganancias)) res[dueno.id]=javier;
  return {res,dom30,propios,desc,ganancias,fijos,nMens,javier};
}
const ORDEN_TIPO=["mensajero","oficina","patinador","empresa","dueno"];
const esDeSemana = (c,sem,dias) => c.semana ? c.semana===sem : dias.includes(diaDe(c.fecha)); // adelantos viejos sin semana: por la fecha
function resumenSemana(sem){
  const dias=diasSemana(sem), porDia=dias.map(sueldosDia);
  const personas=listaOrdenada(S.mensajeros,"nombre").sort((a,b)=>ORDEN_TIPO.indexOf(tipoDe(a))-ORDEN_TIPO.indexOf(tipoDe(b)));
  const filas=personas.map(m=>{ const vals=porDia.map(x=>x.res[m.id]||0), previo=sueldoPrevio(m.id,sem), total=vals.reduce((a,x)=>a+x,0)+previo;
    const movs=Object.values(S.cajamovs).filter(c=>c.personaId===m.id);
    const adelantos=movs.filter(c=>c.cat==="adelanto"&&esDeSemana(c,sem,dias));
    const adel=adelantos.reduce((a,c)=>a+(Number(c.valor)||0),0);
    const pagado=movs.filter(c=>c.cat==="sueldo"&&c.semana===sem).reduce((a,c)=>a+(Number(c.valor)||0),0);
    return {m,vals,previo,total,adel,adelantos,pagado,neto:total-adel-pagado}; })
    ; // todo el personal aparece, aunque no tenga movimiento, para poder marcarle días o sueldo anterior
  return {sem,dias,porDia,filas};
}
/* ---- sueldo visto por el propio mensajero ---- */
let semM=semanaDe(hoy());
function sueldoPersonaSemana(mid,sem){
  const dias=diasSemana(sem), porDia=dias.map(sueldosDia), vals=porDia.map(x=>x.res[mid]||0), previo=sueldoPrevio(mid,sem), total=vals.reduce((a,x)=>a+x,0)+previo;
  const movs=Object.values(S.cajamovs).filter(c=>c.personaId===mid);
  const adelantos=movs.filter(c=>c.cat==="adelanto"&&esDeSemana(c,sem,dias));
  const pagos=movs.filter(c=>c.cat==="sueldo"&&c.semana===sem);
  const adel=adelantos.reduce((a,c)=>a+(Number(c.valor)||0),0), pagado=pagos.reduce((a,c)=>a+(Number(c.valor)||0),0);
  return {sem,dias,vals,previo,total,adelantos,pagos,adel,pagado,neto:total-adel-pagado};
}
function pendienteAnterior(mid,sem){ // semanas anteriores con saldo sin pagar (hasta 12 semanas atrás)
  const out=[]; for(let i=1;i<=12;i++){ const w=moverSemana(sem,-i), r=sueldoPersonaSemana(mid,w); if(Math.round(r.neto)>0) out.push(r); } return out;
}
function miSueldoHtml(mid){
  const yo=S.mensajeros[mid], R=sueldoPersonaSemana(mid,semM), hoyS=hoy(), esDueno=tipoDe(yo)==="dueno";
  const ent=Object.values(S.pedidos).filter(p=>cerrado(p)&&p.mensajeroId===mid);
  const filas=R.dias.map((d,i)=>{ const ps=ent.filter(p=>diaDe(p.entregado)===d), dom=ps.reduce((a,p)=>a+servicio(p),0);
    if(!ps.length&&!R.vals[i]) return `<tr><td>${DIAS_SEM[i]} ${d.slice(8)}</td><td class="n sub" colspan="3">${d>hoyS?"":"No trabajó"}</td></tr>`;
    return `<tr><td><b>${DIAS_SEM[i]} ${d.slice(8)}</b></td><td class="n">${ps.length}</td><td class="n">${pesos(dom)}</td><td class="n"><b class="${R.vals[i]<0?"neg":""}">${pesos(R.vals[i])}</b></td></tr>`; }).join("");
  const movs=[...R.adelantos.map(c=>({...c,t:"Adelanto"})),...R.pagos.map(c=>({...c,t:"Pago de sueldo"}))].sort((a,b)=>a.fecha-b.fecha);
  const ant=pendienteAnterior(mid,semM), antTot=ant.reduce((a,r)=>a+r.neto,0);
  const neto=Math.round(R.neto), pagadoTodo=R.pagado>0&&neto<=0;
  return `<h1>Mi sueldo</h1><p class="sub">${esc(yo.nombre)} · semana del ${fechaLarga(R.dias[0])} al ${fechaLarga(R.dias[6])}</p>
    <div class="acciones" style="margin-bottom:14px"><button class="btn sec chico" id="msAnt">← Anterior</button><button class="btn sec chico" id="msHoy">Esta semana</button><button class="btn sec chico" id="msSig">Siguiente →</button></div>
    <div class="cifras">
      <div class="cifra fuerte"><span>${pagadoTodo?"Pagado ✓ · te deben":"Te deben esta semana"}</span><b class="${neto<0?"neg":""}">${pesos(neto)}</b></div>
      <div class="cifra"><span>Sueldo de la semana</span><b>${pesos(R.total)}</b>${R.previo?`<span>Incluye ${pesos(R.previo)} que llevabas antes de la app</span>`:""}</div>
      <div class="cifra"><span>Adelantos</span><b>${R.adel?"− "+pesos(R.adel):pesos(0)}</b></div>
      <div class="cifra"><span>Ya te pagaron</span><b>${R.pagado?"− "+pesos(R.pagado):pesos(0)}</b></div>
    </div>
    ${neto<0?`<p class="sub" style="margin-top:10px">Los adelantos superan lo ganado esta semana: quedas debiendo ${pesos(-neto)}.</p>`:""}
    ${antTot?`<div class="aviso" style="margin-top:12px">De semanas anteriores te deben ${pesos(antTot)} (${ant.map(r=>"semana del "+r.sem.slice(8)+"/"+r.sem.slice(5,7)+": "+pesos(r.neto)).join(" · ")}).</div>`:""}
    <h2>Día por día</h2>
    <div class="tabla-env"><table><thead><tr><th>Día</th><th class="n">Entregas</th><th class="n">Domicilios</th><th class="n">Sueldo</th></tr></thead><tbody>${filas}
      <tr><td><b>Total</b></td><td class="n">${ent.filter(p=>R.dias.includes(diaDe(p.entregado))).length}</td><td class="n"></td><td class="n"><b>${pesos(R.total)}</b></td></tr></tbody></table></div>
    <p class="sub" style="margin-top:8px">${esDueno?"Tu sueldo diario: 30% de los domicilios de los mensajeros + tus domicilios y los de oficina + ganancias ocasionales + "+pesos(DESC_SUELDO)+" por mensajero − pagos fijos (patinadores, oficina y JS).":tipoDe(yo)==="oficina"?"Pago fijo por día trabajado. Los domicilios de tus pedidos son 100% de JS.":"Cada día: 70% de tus domicilios − "+pesos(DESC_SUELDO)+"."}</p>
    <h2>Adelantos y pagos</h2>
    ${movs.length?`<div class="tabla-env"><table><thead><tr><th>Fecha</th><th>Tipo</th><th>Medio</th><th class="n">Valor</th></tr></thead><tbody>${movs.map(c=>`<tr><td>${hora(c.fecha)}</td><td>${c.t}${c.concepto?`<br><span class="sub" style="font-size:.8rem">${esc(c.concepto)}</span>`:""}</td><td>${MEDIOS[c.medio]||""}</td><td class="n">${pesos(c.valor)}</td></tr>`).join("")}</tbody></table></div>`:`<div class="vacio">Sin adelantos ni pagos esta semana.</div>`}`;
}

function pintarSueldos(v,aviso){
  const R=resumenSemana(semSel), hoyS=hoy();
  const tot=R.filas.reduce((a,f)=>({total:a.total+f.total,adel:a.adel+f.adel,pagado:a.pagado+f.pagado,neto:a.neto+f.neto}),{total:0,adel:0,pagado:0,neto:0});
  const dueno=Object.values(S.mensajeros).find(m=>tipoDe(m)==="dueno");
  const adelSem=R.filas.flatMap(f=>f.adelantos.map(c=>({...c,nom:f.m.nombre}))).sort((a,b)=>a.fecha-b.fecha);
  v.innerHTML=aviso+`<h1>Sueldos</h1><p class="sub">Semana del ${fechaLarga(R.dias[0])} al ${fechaLarga(R.dias[6])}</p>
    <div class="acciones" style="margin-bottom:14px"><button class="btn sec chico" id="semAnt">← Semana anterior</button><button class="btn sec chico" id="semHoy">Esta semana</button><button class="btn sec chico" id="semSig">Semana siguiente →</button>${descargas?'<button class="btn chico" id="semXls">Descargar planilla</button>':""}</div>
    ${!dueno?`<div class="aviso">Para calcular el sueldo de Javier, márcalo como “Dueño (Javier)” en la pestaña Personal.</div>`:""}
    <div class="cifras" style="margin-bottom:14px">
      <div class="cifra"><span>Total sueldos</span><b>${pesos(tot.total)}</b></div>
      <div class="cifra"><span>Adelantos</span><b>${pesos(tot.adel)}</b></div>
      <div class="cifra"><span>Ya pagado</span><b>${pesos(tot.pagado)}</b></div>
      <div class="cifra fuerte"><span>Neto por pagar</span><b>${pesos(tot.neto)}</b></div>
    </div>
    ${R.filas.length?`<div class="tabla-env"><table><thead><tr><th>Persona</th>${R.dias.map((d,i)=>`<th class="n">${DIAS_SEM[i]} ${d.slice(8)}</th>`).join("")}<th class="n">Anterior</th><th class="n">Total</th><th class="n">Adelantos</th><th class="n">Pagado</th><th class="n">Neto</th><th></th></tr></thead><tbody>
    ${R.filas.map(f=>{ const t=tipoDe(f.m), editable=PAGO_FIJO.includes(t);
      return `<tr><td><b>${esc(f.m.nombre)}</b><br><span class="sub" style="font-size:.8rem">${TIPOS[t]}</span>${editable?`<br><span class="sub" style="font-size:.8rem">${f.m.tarifa?`${pesos(f.m.tarifa)} por día · <a href="#" data-tarifa-ed="${esc(f.m.id)}">cambiar</a> · <a href="#" data-otro="${esc(f.m.id)}">otro valor</a>`:`<a href="#" data-tarifa-ed="${esc(f.m.id)}">Poner pago por día</a>`}</span>`:""}</td>
      ${R.dias.map((d,i)=>{ const j=jornada(f.m.id,d); return `<td class="n">${editable?`<button class="dia-btn" data-jd="${esc(f.m.id)}|${d}" aria-pressed="${!!j}" ${d>hoyS&&!j?"disabled":""} aria-label="${esc(f.m.nombre)} ${DIAS_SEM[i]} ${d.slice(8)}: ${j?"trabajó":"no trabajó"}">${j?"✓ "+pesos(j):"—"}</button>`:(f.vals[i]?`<span class="${f.vals[i]<0?"neg":""}">${pesos(f.vals[i])}</span>`:"—")}</td>`; }).join("")}
      <td class="n"><a href="#" data-previo="${esc(f.m.id)}" title="Sueldo que llevaba antes de la app">${f.previo?pesos(f.previo):"+"}</a></td>
      <td class="n"><b>${pesos(f.total)}</b></td><td class="n">${f.adel?pesos(f.adel):"—"}</td><td class="n">${f.pagado?pesos(f.pagado):"—"}</td><td class="n"><b class="${f.neto<0?"neg":""}">${pesos(f.neto)}</b></td>
      <td><div class="acciones" style="margin:0;flex-wrap:nowrap"><button class="btn sec chico" data-adel="${esc(f.m.id)}">Adelanto</button>${f.neto>0?`<button class="btn ok chico" data-pagar="${esc(f.m.id)}">Pagar</button>`:""}</div></td></tr>`; }).join("")}
    <tr><td><b>Total</b></td>${R.dias.map((d,i)=>`<td class="n">${pesos(R.filas.reduce((a,f)=>a+f.vals[i],0))}</td>`).join("")}<td class="n">${pesos(R.filas.reduce((a,f)=>a+f.previo,0))}</td><td class="n"><b>${pesos(tot.total)}</b></td><td class="n">${pesos(tot.adel)}</td><td class="n">${pesos(tot.pagado)}</td><td class="n"><b>${pesos(tot.neto)}</b></td><td></td></tr>
    </tbody></table></div>`:`<div class="vacio">Registra tu personal en la pestaña Personal.</div>`}
    <p class="sub" style="margin-top:10px">Mensajeros: 70% de sus domicilios del día − ${pesos(DESC_SUELDO)}. Patinadores, oficina y JS: toca cada día que trabajó (se marca con su pago por día); toca otra vez para quitarlo. Para un valor distinto, usa “otro valor”. Los domicilios de pedidos a nombre de oficina son 100% de JS y suman al sueldo de Javier.</p>
    ${dueno?`<h2>Cálculo del sueldo de ${esc(dueno.nombre)}</h2><div class="tabla-env"><table><thead><tr><th>Día</th><th class="n">30% domicilios mensajeros</th><th class="n">Domicilios propios y de oficina</th><th class="n">Ganancias ocasionales</th><th class="n">${pesos(DESC_SUELDO)} × mensajeros</th><th class="n">− Pagos fijos (patinadores, oficina, JS)</th><th class="n">Sueldo</th></tr></thead><tbody>
    ${R.dias.map((d,i)=>{ const x=R.porDia[i]; if(!x.dom30&&!x.propios&&!x.fijos&&!x.ganancias) return ""; return `<tr><td>${DIAS_SEM[i]} ${d.slice(8)}</td><td class="n">${pesos(x.dom30)}</td><td class="n">${pesos(x.propios)}</td><td class="n">${pesos(x.ganancias)}</td><td class="n">${pesos(x.desc)} (${x.nMens})</td><td class="n neg">${pesos(-x.fijos)}</td><td class="n"><b>${pesos(x.javier)}</b></td></tr>`; }).join("")||`<tr><td colspan="7" class="sub">Sin movimiento esta semana.</td></tr>`}
    </tbody></table></div>`:""}
    <h2>Adelantos de la semana</h2>
    ${adelSem.length?`<div class="tabla-env"><table><thead><tr><th>Día</th><th>Persona</th><th>Medio</th><th>Detalle</th><th class="n">Valor</th><th></th></tr></thead><tbody>${adelSem.map(c=>`<tr><td>${hora(c.fecha)}</td><td>${esc(c.nom)}</td><td>${MEDIOS[c.medio]||""}</td><td>${esc(c.concepto||"")}</td><td class="n">${pesos(c.valor)}</td><td><button class="btn peligro chico" data-delref="cajamovs|${esc(c.id)}">Quitar</button></td></tr>`).join("")}</tbody></table></div>`:`<div class="vacio">Sin adelantos esta semana. Usa el botón “Adelanto” en cada persona.</div>`}`;
  $("#semAnt").onclick=()=>{semSel=moverSemana(semSel,-1); pintar();};
  $("#semSig").onclick=()=>{semSel=moverSemana(semSel,1); pintar();};
  $("#semHoy").onclick=()=>{semSel=semanaDe(hoy()); pintar();};
  const bx=$("#semXls"); if(bx) bx.onclick=()=>descargarPlanilla(R,bx);
  // Un toque marca el día con el pago por día de la persona; otro toque lo quita
  v.querySelectorAll("[data-jd]").forEach(b=>b.onclick=async()=>{ const [pid,dia]=b.dataset.jd.split("|"), m=S.mensajeros[pid], id=pid+"_"+dia;
    if(!m) return; if(!Number(m.tarifa)&&!jornada(pid,dia)) return pedirTarifa(m,()=>marcarDia(m,dia));
    b.disabled=true;
    try{ if(jornada(pid,dia)) await borrar("jornadas",id); else await marcarDia(m,dia); }catch(e){ b.disabled=false; toast("No se pudo guardar"); } });
  v.querySelectorAll("[data-tarifa-ed]").forEach(a=>a.onclick=e=>{ e.preventDefault(); pedirTarifa(S.mensajeros[a.dataset.tarifaEd]); });
  v.querySelectorAll("[data-otro]").forEach(a=>a.onclick=e=>{ e.preventDefault(); otroValorDias(S.mensajeros[a.dataset.otro],R.dias); });
  v.querySelectorAll("[data-previo]").forEach(a=>a.onclick=e=>{ e.preventDefault(); editarPrevio(S.mensajeros[a.dataset.previo],R.sem); });
  v.querySelectorAll("[data-adel]").forEach(b=>b.onclick=()=>movCaja("sale",{cat:"adelanto",personaId:b.dataset.adel,semana:R.sem}));
  v.querySelectorAll("[data-pagar]").forEach(b=>b.onclick=()=>{ const f=R.filas.find(x=>x.m.id===b.dataset.pagar); movCaja("sale",{cat:"sueldo",personaId:f.m.id,valor:f.neto,semana:R.sem}); });
  v.querySelectorAll("[data-delref]").forEach(b=>b.onclick=async()=>{ const [col,id]=b.dataset.delref.split("|"); b.disabled=true; try{ await borrar(col,id); toast("Adelanto quitado"); }catch(e){ b.disabled=false; toast("No se pudo quitar"); } });
}
/* Pago fijo por día (patinadores, oficina, JS): se guarda en Personal y se usa al marcar cada día en Sueldos. */
const marcarDia = (m,dia) => guardar("jornadas",m.id+"_"+dia,{id:m.id+"_"+dia,personaId:m.id,dia,valor:Number(m.tarifa)});
function pedirTarifa(m,despues){
  if(!m) return; const ultimo=Object.values(S.jornadas).filter(j=>j.personaId===m.id).sort((a,b)=>b.dia.localeCompare(a.dia))[0];
  $("#dlgCont").innerHTML=`<header><h2>Pago por día de ${esc(m.nombre)}</h2><button class="cerrar" data-cerrar aria-label="Cerrar">×</button></header>
    <p class="sub">Es lo que se marca cada vez que tocas un día en Sueldos. Cambiarlo no modifica los días ya marcados.</p>
    <div class="campo"><label for="tfVal">Valor por día</label><input id="tfVal" type="number" inputmode="numeric" min="0" step="1000" value="${Number(m.tarifa)||Number(ultimo?.valor)||""}"></div>
    <button class="btn" id="tfGuardar" style="width:100%">Guardar${despues?" y marcar el día":""}</button>`;
  abrirDlg(); $("#tfVal").select();
  $("#tfGuardar").onclick=async()=>{ const val=Number($("#tfVal").value); if(!(val>0)) return toast("Escribe un valor mayor a cero");
    const b=$("#tfGuardar"); b.disabled=true;
    try{ await actualizar("mensajeros",m.id,{tarifa:val}); m.tarifa=val; cerrarDlg(); toast("Pago por día de "+m.nombre+": "+pesos(val)); if(despues) await despues(); }
    catch(e){ b.disabled=false; toast("No se pudo guardar"); } };
}
function editarPrevio(m,sem){
  if(!m) return; const id=previoId(m.id,sem), actual=sueldoPrevio(m.id,sem);
  $("#dlgCont").innerHTML=`<header><div><h2>Sueldo anterior de ${esc(m.nombre)}</h2><span class="sub">Semana del ${fechaLarga(sem)}</span></div><button class="cerrar" data-cerrar aria-label="Cerrar">×</button></header>
    <p class="sub">Lo que ya llevaba ganado esta semana antes de registrarlo en la app. Se suma al total de la semana. Déjalo en 0 para quitarlo.</p>
    <div class="campo"><label for="prVal">Valor</label><input id="prVal" type="number" inputmode="numeric" min="0" step="1000" value="${actual||""}"></div>
    <button class="btn" id="prGuardar" style="width:100%">Guardar</button>`;
  abrirDlg(); $("#prVal").select();
  $("#prGuardar").onclick=async()=>{ const val=Number($("#prVal").value)||0; const b=$("#prGuardar"); b.disabled=true;
    try{ if(val>0) await guardar("jornadas",id,{id,personaId:m.id,dia:sem,valor:val,previo:true,nota:"Sueldo anterior"}); else if(actual) await borrar("jornadas",id);
      cerrarDlg(); toast("Sueldo anterior de "+m.nombre+": "+pesos(val)); }catch(e){ b.disabled=false; toast("No se pudo guardar"); } };
}
/* Días con un valor distinto al de siempre (medio día, horas extra…). Vacío o 0 = no trabajó. */
function otroValorDias(m,dias){
  if(!m) return;
  $("#dlgCont").innerHTML=`<header><div><h2>${esc(m.nombre)}</h2><span class="sub">Valor de cada día de la semana</span></div><button class="cerrar" data-cerrar aria-label="Cerrar">×</button></header>
    <div class="linea2">${dias.map((d,i)=>`<div class="campo" style="min-width:120px"><label for="ov_${d}">${DIAS_SEM[i]} ${d.slice(8)}</label><input id="ov_${d}" data-ov="${d}" type="number" inputmode="numeric" min="0" step="1000" value="${jornada(m.id,d)||""}" placeholder="No trabajó"></div>`).join("")}</div>
    <button class="btn" id="ovGuardar" style="width:100%">Guardar</button>`;
  abrirDlg();
  $("#ovGuardar").onclick=async()=>{ const b=$("#ovGuardar"); b.disabled=true;
    try{ for(const inp of document.querySelectorAll("[data-ov]")){ const dia=inp.dataset.ov, val=Number(inp.value)||0, id=m.id+"_"+dia;
        if(val===jornada(m.id,dia)) continue; if(val>0) await guardar("jornadas",id,{id,personaId:m.id,dia,valor:val}); else await borrar("jornadas",id); }
      cerrarDlg(); toast("Días de "+m.nombre+" guardados"); }
    catch(e){ b.disabled=false; toast("No se pudo guardar"); } };
}
async function descargarPlanilla(R,btn){
  if(!window.ExcelJS) return toast("El generador de Excel no ha cargado. Espera unos segundos e intenta de nuevo.");
  const txt=btn.textContent; btn.disabled=true; btn.textContent="Preparando…";
  try{
    const MON='"$" #,##0;[Red]-"$" #,##0', wb=new ExcelJS.Workbook(); wb.creator="JS Logistics";
    const cab=row=>row.eachCell(c=>{ c.font={bold:true,color:{argb:"FFFFFFFF"}}; c.fill={type:"pattern",pattern:"solid",fgColor:{argb:"FF115072"}}; });
    const dl=R.dias.map((d,i)=>`${DIAS_SEM[i].toUpperCase()} ${d.slice(8)}`);
    const ws=wb.addWorksheet("Sueldos");
    ws.columns=[{header:"X",width:20},...dl.map(h=>({header:h,width:12,style:{numFmt:MON}})),{header:"TOTAL",width:13,style:{numFmt:MON}},{header:"ADELANTOS",width:13,style:{numFmt:MON}},{header:"PAGADO",width:13,style:{numFmt:MON}},{header:"TOTAL NETO",width:14,style:{numFmt:MON}}];
    cab(ws.getRow(1));
    R.filas.forEach((f,i)=>{ const k=i+2;
      ws.addRow([f.m.nombre,...f.vals.map(x=>x?Math.round(x):null),null,null,f.pagado||null,null]);
      ws.getCell("I"+k).value={formula:`SUM(B${k}:H${k})${f.previo?"+"+Math.round(f.previo):""}`,result:f.total}; // + sueldo anterior
      ws.getCell("J"+k).value={formula:`Adelantos!I${k}`,result:f.adel};
      ws.getCell("L"+k).value={formula:`I${k}-J${k}-K${k}`,result:f.neto}; });
    const t=R.filas.length+2; ws.getCell("A"+t).value="TOTAL SUELDOS"; ws.getRow(t).font={bold:true};
    ["B","C","D","E","F","G","H","I","J","K","L"].forEach(c=>ws.getCell(c+t).value={formula:`SUM(${c}2:${c}${t-1})`});
    const wa=wb.addWorksheet("Adelantos");
    wa.columns=[{header:"X",width:20},...dl.map(h=>({header:h,width:12,style:{numFmt:MON}})),{header:"TOTAL",width:13,style:{numFmt:MON}}];
    cab(wa.getRow(1));
    R.filas.forEach((f,i)=>{ const k=i+2; const porDia=R.dias.map(d=>f.adelantos.filter(c=>diaDe(c.fecha)===d).reduce((a,c)=>a+(Number(c.valor)||0),0));
      wa.addRow([f.m.nombre,...porDia.map(x=>x||null),null]); wa.getCell("I"+k).value={formula:`SUM(B${k}:H${k})`,result:f.adel}; });
    const wj=wb.addWorksheet("Cálculo Javier");
    wj.columns=[{header:"Día",width:12},{header:"30% domicilios mensajeros",width:24,style:{numFmt:MON}},{header:"Domicilios propios",width:18,style:{numFmt:MON}},{header:"Descuentos de mensajeros",width:24,style:{numFmt:MON}},{header:"Patinadores y JS",width:18,style:{numFmt:MON}},{header:"Sueldo",width:14,style:{numFmt:MON}}];
    cab(wj.getRow(1));
    R.porDia.forEach((x,i)=>{ const k=i+2; wj.addRow([dl[i],Math.round(x.dom30),x.propios,x.desc,x.fijos,null]); wj.getCell("F"+k).value={formula:`B${k}+C${k}+D${k}-E${k}`,result:Math.round(x.javier)}; });
    const tj=9; wj.getCell("A"+tj).value="TOTAL"; wj.getRow(tj).font={bold:true}; ["B","C","D","E","F"].forEach(c=>wj.getCell(c+tj).value={formula:`SUM(${c}2:${c}8)`});
    const buf=await wb.xlsx.writeBuffer(); const [y,mo,d]=R.sem.split("-");
    await descargas.save({filename:`sueldos-semana-${d}-${mo}-${y}.xlsx`,data:new Blob([buf])});
  }catch(e){ console.error(e); if(e?.code!=="declined") toast("No se pudo generar el Excel."); }
  finally{ btn.disabled=false; btn.textContent=txt; }
}

/* ======================= MÁS ======================= */
const SUBMAS=[["panel","Resultados"],["personal","Personal"],["historial","Historial"],["papelera","Papelera"],["respaldo","Respaldo y espacio"]];
function pintarMas(v,aviso){
  const nav=`<div class="filtros" style="margin-bottom:16px">${SUBMAS.map(([k,t])=>`<button data-sm="${k}" aria-pressed="${subMas===k}">${t}</button>`).join("")}</div>`;
  if(subMas==="personal") pintarPersonal(v,aviso+nav);
  else if(subMas==="historial") pintarHistorial(v,aviso+nav);
  else if(subMas==="papelera") pintarPapelera(v,aviso+nav);
  else if(subMas==="respaldo") pintarRespaldo(v,aviso+nav);
  else pintarPanel(v,aviso+nav);
  v.querySelectorAll("[data-sm]").forEach(b=>b.onclick=()=>{ subMas=b.dataset.sm; if(subMas==="historial") histEstado=""; if(subMas==="papelera") papEstado=""; pintar(); });
}

/* ---- Resultados ---- */
let panelRango="mes";
function rangoPanel(){
  const h=hoy(), d=new Date(h+"T12:00:00");
  if(panelRango==="hoy") return [h,h,"Hoy"];
  if(panelRango==="7") return [diaDe(d.getTime()-6*864e5),h,"Últimos 7 días"];
  if(panelRango==="mesant"){ const a=new Date(d.getFullYear(),d.getMonth()-1,1,12), b=new Date(d.getFullYear(),d.getMonth(),0,12); return [diaDe(a.getTime()),diaDe(b.getTime()),"Mes pasado"]; }
  return [h.slice(0,8)+"01",h,"Este mes"];
}
function pintarPanel(v,aviso){
  const [a,b,tit]=rangoPanel();
  const ps=Object.values(S.pedidos).filter(p=>cerrado(p)&&diaDe(p.entregado)>=a&&diaDe(p.entregado)<=b);
  const ent=ps.filter(p=>p.estado==="entregado"), dev=ps.filter(p=>p.estado==="devuelto");
  const dom=ps.reduce((x,p)=>x+servicio(p),0), t=totales(ent);
  const dias=[]; for(let d=new Date(a+"T12:00:00"); diaDe(d.getTime())<=b; d.setDate(d.getDate()+1)) dias.push(diaDe(d.getTime()));
  const javier=dias.reduce((x,d)=>x+sueldosDia(d).javier,0);
  const enRuta=Object.values(S.pedidos).filter(p=>p.estado==="pendiente").length;
  const porM={}, porC={}, porS=[0,0,0,0,0,0,0];
  ps.forEach(p=>{ const m=porM[p.mensajeroId]=porM[p.mensajeroId]||{ent:0,dev:0,dom:0,dias:new Set()}; p.estado==="devuelto"?m.dev++:m.ent++; m.dom+=servicio(p); m.dias.add(diaDe(p.entregado));
    if(p.clienteId){ const c=porC[p.clienteId]=porC[p.clienteId]||{ent:0,dev:0,dom:0}; p.estado==="devuelto"?c.dev++:c.ent++; c.dom+=servicio(p); }
    if(p.estado==="entregado") porS[(new Date(p.entregado).getDay()+6)%7]++; });
  const maxS=Math.max(1,...porS), nomS=["Lun","Mar","Mié","Jue","Vie","Sáb","Dom"];
  const cli=Object.entries(porC).sort((x,y)=>y[1].dom-x[1].dom).slice(0,15);
  const pct=n=>ps.length?Math.round(n*100/ps.length)+"%":"0%";
  v.innerHTML=aviso+`<h1>Resultados</h1><p class="sub">${tit}: ${fechaLarga(a)}${a!==b?" al "+fechaLarga(b):""}</p>
    <div class="filtros">${[["hoy","Hoy"],["7","7 días"],["mes","Este mes"],["mesant","Mes pasado"]].map(([k,t])=>`<button data-rg="${k}" aria-pressed="${panelRango===k}">${t}</button>`).join("")}</div>
    <div class="cifras">
      <div class="cifra fuerte"><span>Entregas</span><b>${ent.length}</b><span>${enRuta} en ruta ahora</span></div>
      <div class="cifra"><span>Devoluciones</span><b>${dev.length}</b><span>${pct(dev.length)} de los pedidos cerrados</span></div>
      <div class="cifra"><span>Domicilios facturados</span><b>${pesos(dom)}</b></div>
      <div class="cifra"><span>Sueldo de Javier (dueño)</span><b class="${javier<0?"neg":""}">${pesos(javier)}</b></div>
      <div class="cifra"><span>Efectivo cobrado</span><b>${pesos(t.efectivo)}</b></div>
      <div class="cifra"><span>Transferencias a JS</span><b>${pesos(t.transfJs)}</b></div>
    </div>
    <h2>Por mensajero</h2>
    ${Object.keys(porM).length?`<div class="tabla-env"><table><thead><tr><th>Mensajero</th><th class="n">Entregas</th><th class="n">Devol.</th><th class="n">Días</th><th class="n">Entregas por día</th><th class="n">Domicilios</th></tr></thead><tbody>
    ${Object.entries(porM).sort((x,y)=>y[1].ent-x[1].ent).map(([id,m])=>`<tr><td><b>${esc(S.mensajeros[id]?.nombre||"(quitado)")}</b></td><td class="n">${m.ent}</td><td class="n">${m.dev||"—"}</td><td class="n">${m.dias.size}</td><td class="n">${(m.ent/Math.max(1,m.dias.size)).toFixed(1)}</td><td class="n">${pesos(m.dom)}</td></tr>`).join("")}</tbody></table></div>`:`<div class="vacio">Sin entregas en este período.</div>`}
    <h2>Clientes que más facturan</h2>
    ${cli.length?`<div class="tabla-env"><table><thead><tr><th>Cliente</th><th class="n">Entregas</th><th class="n">Devol.</th><th class="n">Domicilios</th><th class="n">Saldo hoy</th></tr></thead><tbody>
    ${cli.map(([id,c])=>{ const sd=saldoCliente(id); return `<tr><td><b>${esc(nombreCliente(id)||"(eliminado)")}</b></td><td class="n">${c.ent}</td><td class="n">${c.dev||"—"}</td><td class="n">${pesos(c.dom)}</td><td class="n ${sd<0?"neg":sd>0?"pos":""}">${pesos(sd)}</td></tr>`; }).join("")}</tbody></table></div>`:`<div class="vacio">Sin entregas con remitente en este período.</div>`}
    <h2>Entregas por día de la semana</h2>
    <div class="barras">${porS.map((n,i)=>`<div><span>${nomS[i]}</span><i style="width:${Math.round(n*100/maxS)}%"></i><span>${n}</span></div>`).join("")}</div>`;
  v.querySelectorAll("[data-rg]").forEach(x=>x.onclick=()=>{ panelRango=x.dataset.rg; pintar(); });
}

/* ---- Historial ---- */
let histEstado="", histDatos=[], histDias=7, histBuscar="", perfiles={};
async function cargarHistorial(){
  histEstado="cargando";
  try{
    const desde=diaDe(Date.now()-(histDias-1)*864e5);
    const docs=db?await listar("historial",[["dia",">=",desde]]):[{e:memHist}];
    histDatos=docs.flatMap(d=>d.e||[]).sort((a,b)=>b.t-a.t);
    const ids=[...new Set(histDatos.map(e=>e.u).filter(Boolean))];
    if(usuario&&ids.length){ try{ perfiles=await usuario.profiles(ids)||{}; }catch(e){} }
    histEstado="ok";
  }catch(e){ console.error(e); histEstado="error"; }
  pintar();
}
function quienHizo(e){
  if(e.r==="mensajero"&&S.mensajeros[e.m]) return S.mensajeros[e.m].nombre;
  const v=S.vinculos[e.u]; if(v&&S.mensajeros[v.mensajeroId]) return S.mensajeros[v.mensajeroId].nombre;
  return perfiles[e.u]?.name || (e.u&&e.u===uid?"Tú":"Administración");
}
function pintarHistorial(v,aviso){
  if(!histEstado) setTimeout(cargarHistorial,0);
  const q=histBuscar.toLowerCase();
  const lista=histDatos.filter(e=>!q||(e.a+" "+quienHizo(e)).toLowerCase().includes(q)).slice(0,600);
  v.innerHTML=aviso+`<h1>Historial</h1><p class="sub">Quién hizo qué y cuándo: pedidos, entregas, devoluciones, caja, clientes, sueldos y personal.</p>
    <div class="linea2" style="align-items:end"><div class="campo" style="max-width:200px"><label for="hDias">Período</label><select id="hDias">${[[1,"Hoy"],[7,"Últimos 7 días"],[30,"Últimos 30 días"],[90,"Últimos 90 días"]].map(([k,t])=>`<option value="${k}" ${histDias===k?"selected":""}>${t}</option>`).join("")}</select></div>
    <div class="campo"><label for="hBus">Buscar</label><input id="hBus" type="search" value="${esc(histBuscar)}" placeholder="Guía, persona, cliente…"></div>
    <div class="campo" style="flex:none;min-width:0"><button class="btn sec" id="hRec">Actualizar</button></div></div>
    ${histEstado==="cargando"||!histEstado?`<div class="vacio">Cargando…</div>`:histEstado==="error"?`<div class="vacio">No se pudo cargar el historial.</div>`:
    lista.length?`<div class="tabla-env"><table><thead><tr><th>Fecha</th><th>Quién</th><th>Qué hizo</th></tr></thead><tbody>${lista.map(e=>`<tr><td>${hora(e.t)}</td><td>${esc(quienHizo(e))}</td><td style="white-space:normal;min-width:260px">${esc(e.a)}</td></tr>`).join("")}</tbody></table></div>`:`<div class="vacio">Sin registros en este período.</div>`}`;
  $("#hDias").onchange=e=>{ histDias=Number(e.target.value); cargarHistorial(); };
  $("#hRec").onclick=()=>cargarHistorial();
  const hb=$("#hBus"); hb.oninput=()=>{ histBuscar=hb.value; clearTimeout(hb._t); hb._t=setTimeout(()=>{ pintar(); const n=$("#hBus"); if(n){ n.focus(); n.setSelectionRange(n.value.length,n.value.length); } },300); };
}

/* ---- Papelera ---- */
let papEstado="", papDatos=[];
async function cargarPapelera(){
  papEstado="cargando";
  try{ papDatos=await listar("papelera",[],"fecha",300); papEstado="ok"; }catch(e){ console.error(e); papEstado="error"; }
  pintar();
}
async function restaurar(x){
  await rawSet(x.col,x.docId,x.data);
  const extra=await listar("papelera_fotos",[["grupo","==",x.grupo]]).catch(()=>[]);
  for(const f of extra){ await rawSet(f.col,f.docId,f.data); await rawDel("papelera_fotos",f.id); }
  await rawDel("papelera",x.id);
  registrar("Restauró "+(COL_NOM[x.col]||x.col)+": "+resumenDoc(x.col,x.docId,x.data));
}
async function eliminarDefinitivo(x){
  const extra=await listar("papelera_fotos",[["grupo","==",x.grupo]]).catch(()=>[]);
  for(const f of extra) await rawDel("papelera_fotos",f.id);
  await rawDel("papelera",x.id);
}
function pintarPapelera(v,aviso){
  if(!papEstado) setTimeout(cargarPapelera,0);
  v.innerHTML=aviso+`<h1>Papelera</h1><p class="sub">Lo que se elimina en la app llega aquí. Puedes restaurarlo tal como estaba, con sus fotos.</p>
    <div class="acciones" style="margin-bottom:12px"><button class="btn sec chico" id="papRec">Actualizar</button>${papDatos.length?'<button class="btn peligro chico" id="papVaciar">Vaciar papelera</button>':""}</div>
    ${papEstado!=="ok"?`<div class="vacio">${papEstado==="error"?"No se pudo cargar la papelera.":"Cargando…"}</div>`:
    papDatos.length?`<div class="tabla-env"><table><thead><tr><th>Eliminado</th><th>Tipo</th><th>Qué era</th><th></th></tr></thead><tbody>${papDatos.map(x=>`<tr><td>${hora(x.fecha)}</td><td>${esc(COL_NOM[x.col]||x.col)}</td><td style="white-space:normal;min-width:220px">${esc(resumenDoc(x.col,x.docId,x.data))}</td>
      <td><div class="acciones" style="margin:0;flex-wrap:nowrap"><button class="btn ok chico" data-rest="${esc(x.id)}">Restaurar</button><button class="btn peligro chico" data-defi="${esc(x.id)}">Borrar del todo</button></div></td></tr>`).join("")}</tbody></table></div>`:`<div class="vacio">La papelera está vacía.</div>`}`;
  $("#papRec").onclick=()=>cargarPapelera();
  v.querySelectorAll("[data-rest]").forEach(b=>b.onclick=async()=>{ const x=papDatos.find(y=>y.id===b.dataset.rest); b.disabled=true;
    try{ await restaurar(x); papDatos=papDatos.filter(y=>y.id!==x.id); toast("Restaurado"); pintar(); }catch(e){ b.disabled=false; toast("No se pudo restaurar"); } });
  v.querySelectorAll("[data-defi]").forEach(b=>b.onclick=async()=>{ const x=papDatos.find(y=>y.id===b.dataset.defi);
    if(!await confirmar("Borrar del todo",resumenDoc(x.col,x.docId,x.data)+". Ya no se podrá recuperar.","Borrar")) return;
    try{ await eliminarDefinitivo(x); papDatos=papDatos.filter(y=>y.id!==x.id); toast("Borrado"); pintar(); }catch(e){ toast("No se pudo borrar"); } });
  const pv=$("#papVaciar"); if(pv) pv.onclick=async()=>{ if(!await confirmar("Vaciar la papelera",`Se borran del todo ${papDatos.length} elemento${papDatos.length===1?"":"s"}. Ya no se podrán recuperar.`,"Vaciar")) return;
    try{ for(const x of [...papDatos]){ await eliminarDefinitivo(x); papDatos=papDatos.filter(y=>y.id!==x.id); } toast("Papelera vacía"); }catch(e){ toast("No se pudo vaciar del todo"); } pintar(); };
}

/* ---- Respaldo y espacio ---- */
/* Firebase (plan gratis) guarda hasta 1 GB. El tamaño de las fotos se mide con una muestra de los pedidos recientes. */
const CUPO_MB=1024, MARGEN_INDICES=1.15; // Firestore suma índices y metadatos a cada documento
let diasLiberar=90, liberando=false, tamFotos=null, midiendo=false; // tamFotos: {foto, entrega} en bytes promedio
async function medirFotos(){
  const ps=Object.values(S.pedidos).filter(p=>!p.fotosBorradas).sort((a,b)=>b.creado-a.creado).slice(0,8);
  let f=0,nf=0,e=0,ne=0;
  for(const p of ps){ const a=await leer("fotos",p.guia).catch(()=>null); if(a){ f+=JSON.stringify(a).length; nf++; }
    if(cerrado(p)){ const b=await leer("entregas",p.guia).catch(()=>null); if(b){ e+=JSON.stringify(b).length; ne++; } } }
  tamFotos={foto:nf?f/nf:100e3, entrega:ne?e/ne:110e3}; pintar();
}
function usoEstimado(){
  const ps=Object.values(S.pedidos), t=tamFotos||{foto:100e3,entrega:110e3};
  const datos=Object.values(S).reduce((a,c)=>a+(c&&typeof c==="object"?JSON.stringify(c).length:0),0);
  const conFoto=ps.filter(p=>!p.fotosBorradas), cerrados=conFoto.filter(cerrado);
  const bytes=(datos+conFoto.length*t.foto+cerrados.length*t.entrega)*MARGEN_INDICES;
  const semana=ps.filter(p=>p.creado>Date.now()-7*864e5), dias=Math.max(1,new Set(semana.map(p=>diaDe(p.creado))).size); // días con pedidos
  const porPedido=(datos/Math.max(1,ps.length)+t.foto+t.entrega)*MARGEN_INDICES;
  const mb=bytes/1048576, mbDia=semana.length*porPedido/dias/1048576;
  return {mb, pct:Math.min(100,Math.round(mb*100/CUPO_MB)), mbDia, diasRestantes:mbDia>0?Math.floor((CUPO_MB-mb)/mbDia):Infinity, medido:!!tamFotos,
    fotoKB:Math.round(t.foto/1024), entregaKB:Math.round(t.entrega/1024)};
}
function pintarRespaldo(v,aviso){
  if(!tamFotos&&!midiendo&&db){ midiendo=true; medirFotos().finally(()=>midiendo=false); }
  const u=usoEstimado(), pct=u.pct, lleno=u.diasRestantes<Infinity?new Date(Date.now()+u.diasRestantes*864e5).toLocaleDateString("es-CO",{day:"numeric",month:"long",year:"numeric"}):"";
  const lim=Date.now()-diasLiberar*864e5;
  const viejos=Object.values(S.pedidos).filter(p=>cerrado(p)&&!p.fotosBorradas&&p.entregado<lim);
  v.innerHTML=aviso+`<h1>Respaldo y espacio</h1>
    <h2>Copia de seguridad</h2>
    <p class="sub">Descarga todo en un Excel: pedidos, clientes con su saldo, movimientos, caja, entregas de dinero, liquidaciones, personal y días de sueldo. Guárdalo cada semana en tu computador o en Drive.</p>
    ${descargas?'<button class="btn" id="bkXls">Descargar copia completa</button>':'<div class="aviso">Las descargas no están disponibles en esta vista.</div>'}
    ${window.plataforma?.importar&&esAdmin?`<h2>Importar datos</h2>
    <p class="sub">Carga un archivo .json con datos de la versión anterior (por ejemplo, datos-migracion/datos.json). Los registros con el mismo número se reemplazan; no se borra nada.</p>
    <label class="btn sec">Elegir archivo .json<input type="file" id="impJson" accept=".json,application/json" class="oculto"></label> <span class="sub" id="impEstado"></span>`:""}
    <h2>Espacio de la base de datos</h2>
    <p class="sub">El plan gratis de Firebase guarda hasta 1 GB. Casi todo el espacio lo ocupan las fotos: cada pedido usa unos ${u.fotoKB+u.entregaKB} KB (foto de salida ${u.fotoKB} KB, foto y firma de entrega ${u.entregaKB} KB)${u.medido?"":" (calculando…)"}.</p>
    <div class="medidor" role="img" aria-label="Uso aproximado ${pct}%"><i style="width:${pct}%;${pct>80?"background:var(--rojo)":""}"></i></div>
    <p><b>≈ ${u.mb.toLocaleString("es-CO",{maximumFractionDigits:0})} MB</b> de ${CUPO_MB.toLocaleString("es-CO")} MB usados (aprox. ${pct}%).
      ${u.mbDia>0?`Al ritmo de los últimos días (≈ ${u.mbDia.toLocaleString("es-CO",{maximumFractionDigits:1})} MB por día) se llena en unos <b>${u.diasRestantes.toLocaleString("es-CO")} días</b>, hacia el ${lleno}.`:""}</p>
    ${pct>70||u.diasRestantes<45?`<div class="aviso alerta">Te estás acercando al límite. Descarga la copia de seguridad y libera fotos viejas, o pasa Firebase al plan Blaze (sin límite; a este volumen cuesta centavos de dólar al mes).</div>`:""}
    <h2>Liberar espacio</h2>
    <p class="sub">Borra las fotos y firmas de pedidos ya cerrados hace tiempo. El pedido, sus valores y los saldos se conservan; solo se pierden las imágenes.</p>
    <div class="linea2" style="align-items:end"><div class="campo" style="max-width:240px"><label for="libDias">Pedidos cerrados hace más de</label><select id="libDias">${[60,90,180,365].map(d=>`<option value="${d}" ${diasLiberar===d?"selected":""}>${d} días</option>`).join("")}</select></div>
    <div class="campo"><button class="btn peligro" id="libBtn" ${viejos.length&&!liberando?"":"disabled"}>${liberando?"Liberando…":`Borrar fotos de ${viejos.length} pedido${viejos.length===1?"":"s"}`}</button></div></div>`;
  const bx=$("#bkXls"); if(bx) bx.onclick=()=>descargarRespaldo(bx);
  const ij=$("#impJson"); if(ij) ij.onchange=async()=>{ const f=ij.files[0]; if(!f) return; const est=$("#impEstado");
    let datos; try{ datos=JSON.parse(await f.text()); }catch(e){ return toast("El archivo no es un .json válido"); }
    const total=Object.values(datos).reduce((a,d)=>a+Object.keys(d||{}).length,0);
    if(!await confirmar("Importar "+total+" registros","Se guardan en la base de datos. Si ya existe un registro con el mismo número, se reemplaza.","Importar")) return;
    try{ const n=await window.plataforma.importar(datos,(h,t)=>{ est.textContent=`Importando ${h} de ${t}…`; }); est.textContent=""; registrar("Importó "+n+" registros"); toast("Se importaron "+n+" registros"); }
    catch(e){ console.error(e); est.textContent=""; toast("No se pudo importar. Revisa la conexión."); } };
  $("#libDias").onchange=e=>{ diasLiberar=Number(e.target.value); pintar(); };
  $("#libBtn").onclick=async()=>{
    if(!await confirmar("Borrar fotos de "+viejos.length+" pedidos",`Se borran las fotos de salida, entrega y firmas de los pedidos cerrados hace más de ${diasLiberar} días. Los datos y saldos se conservan. No se puede deshacer.`,"Borrar fotos")) return;
    liberando=true; pintar(); let n=0;
    try{ for(const p of viejos){ await rawDel("fotos",p.guia).catch(()=>{}); await rawDel("entregas",p.guia).catch(()=>{}); await rawUpd("pedidos",p.guia,{mini:"",fotosBorradas:true}); n++; }
      registrar(`Liberó espacio: borró las fotos de ${n} pedidos cerrados hace más de ${diasLiberar} días`); toast("Fotos borradas de "+n+" pedidos"); }
    catch(e){ toast("Se liberaron "+n+" pedidos; el resto falló. Intenta de nuevo."); }
    finally{ liberando=false; pintar(); }
  };
}
async function descargarRespaldo(btn){
  if(!window.ExcelJS) return toast("El generador de Excel no ha cargado. Espera unos segundos e intenta de nuevo.");
  const txt=btn.textContent; btn.disabled=true; btn.textContent="Preparando…";
  try{
    const MON='"$" #,##0;[Red]-"$" #,##0', wb=new ExcelJS.Workbook(); wb.creator="JS Logistics";
    const nm=id=>S.mensajeros[id]?.nombre||"", f=ts=>ts?new Date(ts).toLocaleString("es-CO"):"";
    const hoja=(nombre,cols,filas)=>{ const w=wb.addWorksheet(nombre,{views:[{state:"frozen",ySplit:1}]});
      w.columns=cols.map(([h,ancho,mon])=>({header:h,width:ancho,style:mon?{numFmt:MON}:{}}));
      w.getRow(1).eachCell(c=>{ c.font={bold:true,color:{argb:"FFFFFFFF"}}; c.fill={type:"pattern",pattern:"solid",fgColor:{argb:"FF115072"}}; });
      filas.forEach(r=>w.addRow(r)); };
    hoja("Pedidos",[["Guía",11],["Salió",18],["Estado",12],["Cerrado",18],["Mensajero",16],["Cliente",22],["Destinatario",22],["Servicio",11,1],["A cobrar",11,1],["Cobrado",11,1],["Método",26],["Cuenta JS",12],["Diferencia",11,1],["Domicilio pagado",10],["Motivo devolución",20],["Intentos",9],["Saldo",11,1]],
      Object.values(S.pedidos).sort((a,b)=>a.n-b.n).map(p=>[p.guia,f(p.creado),ESTADOS[p.estado]||p.estado,f(p.entregado),nm(p.mensajeroId),nombreCliente(p.clienteId),p.destinatario||"",servicio(p),Number(p.aCobrar)||0,Number(p.valorCobrado)||0,cerrado(p)?metodoTxt(p):"",CUENTAS_JS[p.cuentaJs]||"",Number(p.difCobro)||0,p.domiPagado?"SÍ":"NO",MOTIVOS[p.motivoDev]||"",(p.intentos||[]).length,saldoPedido(p)]));
    hoja("Clientes",[["Cliente",26],["Celular",14],["Valor domicilio",14,1],["Saldo",14,1],["Cuenta",14]],
      listaOrdenada(S.clientes,"nombre").map(c=>{ const sd=saldoCliente(c.id); return [c.nombre,c.telefono||"",Number(c.tarifa)||0,sd,tipoCuenta(sd)]; }));
    hoja("Movimientos clientes",[["Fecha",18],["Cliente",24],["Tipo",22],["Medio",14],["Nota",30],["Valor",13,1]],
      Object.values(S.movimientos).sort((a,b)=>a.fecha-b.fecha).map(m=>[f(m.fecha),nombreCliente(m.clienteId),MOVS[m.tipo]?.corto||m.tipo,MEDIOS[m.medio]||"",m.nota||"",signoMov(m)]));
    hoja("Caja",[["Fecha",18],["Concepto",44],["Tipo",16],["Medio",22],["Valor",13,1]],
      libroCaja().map(x=>[f(x.fecha),x.concepto,x.cat,MEDIOS_CAJA[x.medio]||x.medio,x.valor]));
    hoja("Entregas de dinero",[["Fecha",18],["Mensajero",16],["Medio",14],["Nota",24],["Valor",13,1]],
      Object.values(S.recaudos).sort((a,b)=>a.fecha-b.fecha).map(r=>[f(r.fecha),nm(r.mensajeroId),MEDIOS[r.medio]||"",r.nota||"",Number(r.valor)||0]));
    hoja("Liquidaciones",[["Fecha",18],["Mensajero",16],["Entregas",10],["Efectivo",13,1],["Entregó",13,1],["Resultado",20],["Sueldo",13,1]],
      Object.values(S.liquidaciones).sort((a,b)=>a.fecha-b.fecha).map(l=>[f(l.fecha),nm(l.mensajeroId),l.entregas||0,Number(l.efectivo)||0,Number(l.recibido)||0,textoLiq(Number(l.debe)||0),Number(l.sueldo)||0]));
    hoja("Personal",[["Nombre",20],["Teléfono",14],["Tipo",16],["Pago por día",13,1]],
      listaOrdenada(S.mensajeros,"nombre").map(m=>[m.nombre,m.telefono||"",TIPOS[tipoDe(m)],Number(m.tarifa)||0]));
    hoja("Días de sueldo",[["Persona",20],["Día",12],["Valor",13,1]],
      Object.values(S.jornadas).sort((a,b)=>String(a.dia).localeCompare(String(b.dia))).map(j=>[nm(j.personaId),j.dia,Number(j.valor)||0]));
    const buf=await wb.xlsx.writeBuffer(); const [y,mo,d]=hoy().split("-");
    await descargas.save({filename:`respaldo-js-logistics-${d}-${mo}-${y}.xlsx`,data:new Blob([buf])});
  }catch(e){ console.error(e); if(e?.code!=="declined") toast("No se pudo generar la copia."); }
  finally{ btn.disabled=false; btn.textContent=txt; }
}

/* ---------- diálogo ---------- */
function confirmar(titulo,msg,boton){ // reemplaza confirm(), que el navegador bloquea dentro de la app publicada
  return new Promise(res=>{ let hecho=false; const fin=v=>{ if(hecho) return; hecho=true; $("#dlg").removeEventListener("close",alCerrar); if(v) cerrarDlg(); res(v); }, alCerrar=()=>fin(false);
    $("#dlgCont").innerHTML=`<header><h2>${esc(titulo)}?</h2><button class="cerrar" data-cerrar aria-label="Cerrar">×</button></header><p>${esc(msg)}</p>
      <div class="acciones"><button class="btn peligro" id="cfSi">${esc(boton)}</button><button class="btn sec" data-cerrar>Cancelar</button></div>`;
    abrirDlg(); $("#dlg").addEventListener("close",alCerrar); $("#cfSi").onclick=()=>fin(true); });
}
function abrirDlg(){ const d=$("#dlg"); if(!d.open) d.showModal(); $("#dlgCont").scrollTop=0; }
function cerrarDlg(){ $("#dlg").close(); }
$("#dlg").addEventListener("click",e=>{ if(e.target.closest("[data-cerrar]")||e.target===$("#dlg")) cerrarDlg(); });

$("#rol").addEventListener("click",e=>{ const b=e.target.closest("button"); if(!b) return; rol=b.dataset.rol; lsSet("js_rol",rol); pintar(); scrollTo(0,0); });

/* ---------- arranque ---------- */
let descargas=null;
pintar();
(async()=>{
  try{
    const P=window.plataforma; if(!P) throw 0;
    [db,usuario,descargas]=[P.db,P.usuario,P.descargas];
  }catch(e){ db=null; }
  if(usuario){ try{ uid=await usuario.id(); esAdmin = await usuario.canEdit(); esAsistente = !esAdmin && usuario.rol()==="asistente"; esCliente = !esAdmin && usuario.rol()==="cliente"; if(esCliente) miCliente=usuario.clienteId()||""; }catch(e){} }
  if(esAsistente || (esAdmin && lsGet("js_rol")==="admin")) rol="admin";
  if(!esAdmin&&!esAsistente) rol="mensajero";
  if(db){ cargarDatos(); procesarCola(); }
  else { cargado=true; }
  pintar();
  quitarSplash();
})();
/* Cada rol descarga solo lo que le corresponde; las reglas de Firebase rechazan el resto. */
function cargarDatos(){
  if(esCliente){ if(!miCliente){ cargado=true; return; } suscribir("pedidos",["clienteId","==",miCliente]); suscribir("clientes",["id","==",miCliente]); suscribir("movimientos",["clienteId","==",miCliente]); return; }
  if(esAdmin){ setTimeout(completarNombres,8000); ["pedidos","clientes","mensajeros","movimientos","recaudos","liquidaciones","jornadas","cajamovs","vinculos","usuarios","cuentas"].forEach(c=>suscribir(c)); return; }
  const mid=usuario.mensajeroId();
  suscribir("vinculos",["uid","==",uid]);
  if(esAsistente){ leerCorte(); ["pedidos","clientes","mensajeros","movimientos","cuentas"].forEach(c=>suscribir(c)); suscribir("cajamovs",["cat","==","interna"]); suscribir("cajamovs",["cat","==","base"]); if(uid) suscribir("cajamovs",["personaUid","==",uid]); ["recaudos","liquidaciones"].forEach(c=>suscribir(c)); setTimeout(completarNombres,8000); }
  else if(mid){ suscribir("pedidos",["mensajeroId","==",mid]); suscribir("mensajeros",["id","==",mid]); }
  if(mid){ suscribir("jornadas",["personaId","==",mid]); suscribir("recaudos",["mensajeroId","==",mid]); suscribir("liquidaciones",["mensajeroId","==",mid]); suscribir("cajamovs",["personaId","==",mid]); }
  if(!mid&&!esAsistente) cargado=true;
}
/* Los mensajeros no leen la lista de clientes: el pedido lleva el nombre del remitente. */
function completarNombres(){
  for(const p of Object.values(S.pedidos)){ const n=S.clientes[p.clienteId]?.nombre;
    if(p.estado==="pendiente"&&n&&p.clienteNombre!==n) rawUpd("pedidos",p.guia,{clienteNombre:n}).catch(()=>{}); }
}
function quitarSplash(){ const sp=$("#splash"); if(sp&&!sp.classList.contains("fuera")){ sp.classList.add("fuera"); setTimeout(()=>sp.remove(),400); } }
setTimeout(quitarSplash,2500);
