/* Datos de prueba variados (todos los tipos de pedido, movimiento y caja que maneja la app), siempre iguales para una semilla. */
export function generarDatos(semilla = 7, ahora = Date.now()) {
  let x = semilla >>> 0;
  const rnd = () => ((x = (x * 1664525 + 1013904223) >>> 0) / 2 ** 32);
  const ent = (a, b) => a + Math.floor(rnd() * (b - a + 1));
  const uno = arr => arr[Math.floor(rnd() * arr.length)];
  const prob = p => rnd() < p;
  const DIA = 864e5, desde = ahora - 40 * DIA;
  const fecha = () => ent(desde, ahora - 60000);
  const S = { pedidos: {}, clientes: {}, mensajeros: {}, movimientos: {}, recaudos: {}, liquidaciones: {}, jornadas: {}, cajamovs: {}, vinculos: {}, usuarios: {}, cuentas: {} };
  let n = 0; const id = p => p + (++n);

  const personas = [["m1", "Andrés", "mensajero"], ["m2", "Brayan", "mensajero"], ["m3", "Camilo", "mensajero"], ["m4", "Javier", "dueno"], ["m5", "Oficina JS", "oficina", 60000], ["m6", "Patinador", "patinador", 50000], ["m7", "Empresa JS", "empresa", 40000], ["m8", "Sin tipo"]];
  for (const [mid, nombre, tipo, tarifa] of personas) S.mensajeros[mid] = { id: mid, nombre, telefono: "300" + ent(1000000, 9999999), ...(tipo ? { tipo } : {}), ...(tarifa ? { tarifa } : {}) };
  S.usuarios.a1 = { uid: "a1", nombre: "Asistente Uno", rol: "asistente", email: "a1@x.co" };
  S.usuarios.a2 = { uid: "a2", nombre: "Asistente Dos", rol: "asistente", email: "a2@x.co" };
  S.usuarios.ad = { uid: "ad", nombre: "Admin", rol: "admin", email: "ad@x.co" };
  S.usuarios.cl = { uid: "cl", nombre: "Cliente", rol: "cliente", clienteId: "c1" };
  const repartidores = ["m1", "m2", "m3", "m4", "m5", "m8"], asist = ["a1", "a2", "ad"];

  const nombres = ["Tienda Luna", "Moda Sol", "Ana Ruiz", "Calzado Pie", "Ropa Mía", "Tecno Cali", "Doña Rosa", "Flores Ya"];
  for (let i = 1; i <= 30; i++) {
    const nom = uno(nombres) + (prob(0.7) ? " " + i : ""), tel = prob(0.15) ? "" : (prob(0.1) ? "+57 " : "") + "31" + ent(10000000, 99999999);
    S.clientes["c" + i] = { id: "c" + i, nombre: prob(0.1) ? nom.toUpperCase() : nom, telefono: tel, tarifa: prob(0.6) ? uno([6000, 7000, 8000, 10000]) : 0 };
  }
  S.clientes.c30.telefono = S.clientes.c29.telefono || "3110000000"; // repetido por número
  S.clientes.c28.nombre = "Tiénda   Lúna"; S.clientes.c27.nombre = "tienda luna";

  for (let i = 1; i <= 420; i++) {
    const guia = "JS-" + String(i).padStart(5, "0"), creado = fecha(), estado = prob(0.12) ? "pendiente" : prob(0.12) ? "devuelto" : "entregado";
    const p = { guia, n: i, estado, creado, mensajeroId: uno(repartidores), clienteId: prob(0.08) ? "" : "c" + ent(1, 30), valorServicio: prob(0.07) ? 0 : uno([5000, 6000, 7000, 8000, 12000]), aCobrar: prob(0.5) ? uno([20000, 35000, 50000, 80000]) : 0 };
    if (p.clienteId && prob(0.5)) p.clienteNombre = "Nombre guardado " + p.clienteId;
    if (estado !== "pendiente") {
      p.entregado = Math.min(ahora - 1000, creado + ent(10 * 60000, 2 * DIA));
      if (estado === "entregado") {
        p.metodo = uno(["efectivo", "efectivo", "efectivo", "transf_js", "transf_cliente"]);
        p.valorCobrado = p.metodo === "transf_cliente" ? 0 : (prob(0.85) ? p.aCobrar : p.aCobrar + uno([-5000, 3000]));
        if (p.metodo === "transf_js" && prob(0.85)) p.cuentaJs = uno(["nequi", "bancolombia"]);
        p.destinatario = "Persona " + i; p.difCobro = p.aCobrar ? p.valorCobrado - (p.metodo === "transf_cliente" ? 0 : p.aCobrar) : 0;
      } else { p.metodo = "devuelto"; p.valorCobrado = 0; p.motivoDev = uno(["no_contesta", "direccion", "rechazo", "otro"]); p.cobrarDev = prob(0.7); }
      if (prob(0.1)) { p.gasto = uno([3000, 15000]); p.gastoNota = "bus"; }
      if (prob(0.12)) { p.domiPagado = true; if (prob(0.8)) { p.domiPagoMedio = uno(["efectivo", "nequi", "bancolombia"]); p.domiPagoFecha = p.entregado + 3600000; p.domiPagoUid = uno(asist); } if (prob(0.7)) p.domiPagoValor = uno([p.valorServicio, 5000, ""]); }
    }
    if (prob(0.05)) { p.cambio = true; if (prob(0.5)) p.cambioRecibido = ahora - DIA; }
    if (prob(0.1)) p.intentos = [{ fecha: creado + 3600000, motivo: "reprogramar", nota: "" }];
    S.pedidos[guia] = p;
  }

  const tiposMov = ["cargo", "abono", "pago_a_cliente", "pago_de_cliente", "compra_cliente", "ganancia"];
  for (let i = 0; i < 120; i++) { const k = id("mv"), tipo = uno(tiposMov); S.movimientos[k] = { id: k, clienteId: "c" + ent(1, 30), tipo, valor: uno([5000, 12000, 40000, 100000]), medio: prob(0.9) ? uno(["efectivo", "nequi", "bancolombia"]) : "", nota: prob(0.5) ? "nota " + i : "", fecha: fecha(), porUid: uno(asist), ...(prob(0.1) ? { medioAntes: "efectivo" } : {}) }; }

  for (let i = 0; i < 90; i++) { const k = id("rc"); S.recaudos[k] = { id: k, mensajeroId: uno(repartidores), valor: uno([20000, 50000, 120000]), medio: uno(["efectivo", "efectivo", "nequi", "bancolombia", undefined]), nota: prob(0.3) ? "Liquidación" : "", fecha: fecha(), porUid: prob(0.6) ? uno(["a1", "a2"]) : "" }; }

  // liquidaciones con lista de guías y algunas viejas sin lista (se cuentan por hora)
  for (const mid of ["m1", "m2", "m3", "m8"]) {
    const cerrados = Object.values(S.pedidos).filter(p => p.mensajeroId === mid && p.estado !== "pendiente").sort((a, b) => a.entregado - b.entregado);
    let ant = 0;
    for (let j = 0; j < 3; j++) {
      const corte = desde + (j + 1) * 10 * DIA, gs = cerrados.filter(p => p.entregado <= corte && p.entregado > ant);
      const lid = mid + "_" + corte;
      S.liquidaciones[lid] = { id: lid, mensajeroId: mid, desde: ant, fecha: corte, dia: "x", entregas: gs.length, ...(j === 0 && mid === "m3" ? {} : { guias: gs.map(p => p.guia) }), efectivo: ent(0, 300000), base: uno([0, 20000]), gastos: uno([0, 3000]), recibido: ent(0, 300000), debe: uno([0, 15000, -5000, 40000]), adelanto: uno([0, 10000]), ajuste: uno([0, 2000]) };
      ant = corte;
    }
  }

  const cajas = [
    () => ({ cat: "base", tipo: "sale", personaId: uno(repartidores), porUid: prob(0.5) ? uno(["a1", "a2"]) : "" }),
    () => ({ cat: "oficina", tipo: uno(["base", "entrega"]), personaUid: uno(["a1", "a2"]), ...(prob(0.2) ? { nivel: true } : {}) }),
    () => ({ cat: "sobrante", tipo: "entra", personaUid: uno(["a1", "a2"]) }),
    () => ({ cat: "interna", tipo: uno(["entra", "sale"]), cuentaId: uno(["cu1", "cu2", "cu3"]), porUid: uno(asist), ...(prob(0.1) ? { inicial: true } : {}) }),
    () => ({ cat: "adelanto", tipo: "sale", personaId: uno(["m1", "m2", "m6", "m4"]), ...(prob(0.5) ? { semana: "" } : {}), ...(prob(0.3) ? { devuelto: 5000 } : {}), ...(prob(0.2) ? { deLiquidacion: "x" } : {}) }),
    () => ({ cat: "sueldo", tipo: "sale", personaId: uno(["m1", "m2", "m6"]) }),
    () => ({ cat: "devolucion", tipo: "entra", personaId: "m1" }),
    () => ({ cat: uno(["gasto", "arriendo", "otro", "otro_entra"]), tipo: prob(0.5) ? "sale" : "entra" })
  ];
  for (let i = 0; i < 110; i++) { const k = id("cj"), base = uno(cajas)(); S.cajamovs[k] = { id: k, valor: uno([10000, 25000, 70000]), medio: uno(["efectivo", "nequi", "bancolombia"]), concepto: prob(0.5) ? "detalle" : "", fecha: fecha(), ...base }; }
  // semanas de sueldo para adelantos y pagos (sábado a viernes)
  const sabado = t => { const d = new Date(new Date(t).toLocaleDateString("en-CA", { timeZone: "America/Bogota" }) + "T12:00:00-05:00"); const dow = d.getUTCDay(); return new Date(d.getTime() - ((dow + 1) % 7) * DIA).toISOString().slice(0, 10); };
  for (const c of Object.values(S.cajamovs)) if ((c.cat === "adelanto" && c.semana !== "") || c.cat === "sueldo") c.semana = sabado(c.fecha);
  // dos arqueos: uno que cuadra entre medios y otro con faltante
  const a1 = ahora - 9 * DIA, a2 = ahora - 2 * DIA;
  Object.assign(S.cajamovs, {
    q1: { id: "q1", cat: "arqueo", tipo: "entra", valor: 5000, medio: "efectivo", arqueoId: "A1", fecha: a1 },
    q2: { id: "q2", cat: "arqueo", tipo: "sale", valor: 5000, medio: "nequi", arqueoId: "A1", fecha: a1 },
    A1: { id: "A1", cat: "arqueo", tipo: "marca", valor: 0, medio: "", arqueoId: "A1", fecha: a1, esperado: { efectivo: 1 }, contado: { efectivo: 1 } },
    q3: { id: "q3", cat: "arqueo", tipo: "sale", valor: 12000, medio: "efectivo", arqueoId: "A2", fecha: a2 },
    A2: { id: "A2", cat: "arqueo", tipo: "marca", valor: 0, medio: "", arqueoId: "A2", fecha: a2, esperado: {}, contado: {} },
    ini: { id: "ini", cat: "inicial", tipo: "entra", valor: 300000, medio: "efectivo", fecha: desde - DIA }
  });

  S.cuentas = { cu1: { id: "cu1", nombre: "JS Envíos", tipo: "socio" }, cu2: { id: "cu2", nombre: "MT", tipo: "socio" }, cu3: { id: "cu3", nombre: "Base de JS", tipo: "base" } };
  for (let i = 0; i < 25; i++) { const pid = uno(["m5", "m6", "m7"]), dia = new Date(fecha()).toLocaleDateString("en-CA", { timeZone: "America/Bogota" }); S.jornadas[pid + "_" + dia] = { id: pid + "_" + dia, personaId: pid, dia, valor: S.mensajeros[pid].tarifa }; }
  const semPrev = sabado(ahora - 14 * DIA);
  S.jornadas["m1_previo_" + semPrev] = { id: "m1_previo_" + semPrev, personaId: "m1", dia: semPrev, valor: 90000, previo: true };
  S.vinculos = { u1: { uid: "u1", mensajeroId: "m1" } };
  return S;
}
