// Revisión de solo lectura de los datos de JS Logistics.
// Se pega en el navegador integrado (javascript_tool) con la app abierta en http://localhost:5173 y la sesión de administrador.
// No escribe nada: solo lee el estado S y las funciones de cálculo de la app.
await (async()=>{
  await new Promise(r=>setTimeout(r,8000)); // la app termina de cargar los datos
  const f=x=>new Date(x).toLocaleString("es-CO",{day:"2-digit",month:"2-digit",hour:"2-digit",minute:"2-digit"});
  const P=Object.values(S.pedidos), h=hoy(), R=resumenCaja();
  const dias=[...new Set(P.map(p=>diaDe(p.creado)))].sort().slice(-7);
  const out={};
  out.pedidos={
    total:P.length,
    ultimosDias:dias.map(d=>{ const ps=P.filter(p=>diaDe(p.creado)===d); return {d,creados:ps.length,entregados:ps.filter(p=>p.estado==="entregado").length,devueltos:ps.filter(p=>p.estado==="devuelto").length,enRuta:ps.filter(p=>p.estado==="pendiente").length}; }),
    enRutaDeDiasAnteriores:P.filter(p=>p.estado==="pendiente"&&diaDe(p.creado)<h).map(p=>[p.guia,diaDe(p.creado),S.mensajeros[p.mensajeroId]?.nombre||"?"]),
    sinRemitente:P.filter(p=>!p.clienteId).length,
    entregadosSinDomicilio:P.filter(sinServicio).length,
    conDiferenciaSinRevisar:P.filter(p=>Number(p.difCobro)&&!p.difRevisada).map(p=>[p.guia,p.difCobro]),
    transferenciaSinCuenta:P.filter(p=>cerrado(p)&&p.metodo==="transf_js"&&!p.cuentaJs).map(p=>p.guia),
    remitenteBorrado:P.filter(p=>p.clienteId&&!S.clientes[p.clienteId]).map(p=>p.guia),
  };
  out.caja={
    total:R.total, porMedio:R.porMedio, disponible:R.disponible, porPagarClientes:R.porPagar, porCobrarClientes:R.porCobrar, sueldosPorPagar:R.sueldosPend, enManosDeMensajeros:R.enMens,
    arqueos:arqueosCaja().slice(0,5).map(a=>[f(a.fecha),resultadoArqueo(a)]),
    cajasDeOficina:asistentes().map(u=>[u.nombre,cajaOficina(u.uid).saldo]),
    sobrantesDeOficina:Object.values(S.cajamovs).filter(c=>c.cat==="sobrante").map(c=>[f(c.fecha),c.medio,c.valor,c.concepto]),
    cuentasInternas:listaOrdenada(S.cuentas,"nombre").map(cu=>[cu.nombre,saldoCuenta(cu.id)]),
  };
  out.mensajeros=Object.values(S.mensajeros).filter(esRepartidor).map(m=>{ const pm=periodoMensajero(m.id); return {nombre:m.nombre,debe:Math.round(pm.debe),ultimaLiquidacion:pm.ul?f(pm.ul.fecha):"nunca",entregasDelPeriodo:pm.ps.length}; }).filter(x=>x.debe||x.entregasDelPeriodo);
  // Patinadores: su caja (lo que anotan de los clientes) vive en la API del sistema nuevo (GET /patinador/resumen), no en `S`.
  // En la app vieja (Firebase) esa ruta no existe y la sección queda como no disponible. Solo lee.
  out.patinadores=await (async()=>{
    try {
      const r=await fetch("/api/patinador/resumen",{credentials:"include"}); if(!r.ok) return {disponible:false};
      const j=await r.json(); if(!Array.isArray(j.patinadores)) return {disponible:false};
      const pend=j.patinadores.filter(x=>x.debe||x.recibido||x.entregado).map(x=>({nombre:x.nombre,recibidoDeClientes:x.recibido,yaEntrego:x.entregado,debe:x.debe,debeDeDiasAnteriores:x.debe-(x.recibidoHoy-x.entregadoHoy),anotoHoy:x.recibidoHoy,entregoHoy:x.entregadoHoy,pagosAnotados:x.registros}));
      return {disponible:true,debenEnTotal:pend.reduce((a,x)=>a+Math.max(0,x.debe),0),lista:pend};
    } catch { return {disponible:false}; }
  })();
  const liqs=Object.values(S.liquidaciones).sort((a,b)=>b.fecha-a.fecha);
  out.liquidaciones={
    ultimas:liqs.slice(0,10).map(l=>[S.mensajeros[l.mensajeroId]?.nombre,f(l.fecha),l.debe,l.adelanto||0]),
    dobles:liqs.filter((l,i)=>liqs.some((o,j)=>j!==i&&o.mensajeroId===l.mensajeroId&&Math.abs(o.fecha-l.fecha)<120000)).map(l=>[S.mensajeros[l.mensajeroId]?.nombre,f(l.fecha)]),
  };
  const sem=resumenSemana(semanaDe(h));
  out.sueldos={semana:sem.sem,netoPorPagar:Math.round(sem.filas.reduce((a,x)=>a+Math.max(0,x.neto),0)),negativos:sem.filas.filter(x=>Math.round(x.neto)<0).map(x=>[x.m.nombre,Math.round(x.neto)])};
  const cs=Object.values(S.clientes);
  out.clientes={
    total:cs.length, repetidos:gruposRepetidos().map(g=>g.map(c=>c.nombre)),
    sinCelular:cs.filter(c=>normTel(c.telefono).length<7).map(c=>c.nombre),
    conPedidosSinDomicilioGuardado:cs.filter(c=>!Number(c.tarifa)&&P.some(p=>p.clienteId===c.id)).map(c=>c.nombre),
    pagosSinMedio:Object.values(S.movimientos).filter(m=>esPago(m)&&!MEDIOS[m.medio]).length,
    cuentasDeClienteSueltas:Object.values(S.usuarios||{}).filter(u=>u.rol==="cliente"&&!S.clientes[u.clienteId]).map(u=>u.nombre),
  };
  try{ if(typeof medirFotos==="function"&&!tamFotos) await medirFotos(); }catch(e){} // tamaño real de las fotos; sin esto el espacio se calcula por lo alto
  const u=usoEstimado(), docs=Object.entries(S).filter(([,v])=>v&&typeof v==="object"&&!Array.isArray(v)).reduce((a,[,v])=>a+Object.keys(v).length,0);
  out.capacidad={espacioMB:+u.mb.toFixed(1),porcentaje:u.pct,MBporDia:+u.mbDia.toFixed(1),diasParaLlenarse:u.diasRestantes,medidoConFotosReales:u.medido,documentosQueLeeLaOficinaAlAbrir:docs,aperturasDiariasQueCabenEnLoGratis:Math.floor(50000/Math.max(1,docs))};
  return JSON.stringify(out);
})()
