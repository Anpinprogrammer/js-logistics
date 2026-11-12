/*
 * Modo demo (VITE_DEMO=true): datos inventados, sin backend, para las vistas previas y para probar pantallas.
 * Ningún nombre ni número es real. Cuentas: admin@demo.co, asistente@demo.co y mensajero@demo.co, clave demo1234.
 */
import type { Usuario } from "../api/tipos";
import { diaDe, hoy, moverDia, semanaDe, type Almacen, type Pedido, type Metodo, type Motivo } from "./motor";

// Las cuentas demo van aparte (cuentasDemo.ts) para que la sesión no cargue el motor al abrir la página.
import { USUARIOS_DEMO } from "./cuentasDemo";
export { DEMO, USUARIOS_DEMO } from "./cuentasDemo";

/** Generador pseudoaleatorio con semilla: los mismos datos en cada carga. */
function azar(semilla: number) { let s = semilla; return () => ((s = (s * 16807) % 2147483647) - 1) / 2147483646; }

const PERSONAS: [string, string, Almacen["mensajeros"][string]["tipo"], number][] = [
  ["m1", "Andrés Mora", "mensajero", 0], ["m2", "Felipe Castro", "mensajero", 0], ["m3", "Julián Ortiz", "mensajero", 0],
  ["m4", "Sebastián Pardo", "mensajero", 0], ["m-dueno", "Dueño (demo)", "dueno", 0], ["m-ofi", "Oficina JS", "oficina", 0],
  ["m-pat", "Tomás Vélez", "patinador", 70000], ["m-emp", "Empresa (JS)", "empresa", 0],
];
/** Remitentes que puede buscar el mensajero en el demo (el almacén del mensajero no trae clientes). */
export let remitentesDemo: { id: string; nombre: string; tarifa: number }[] = [];

const CLIENTES = ["Tienda Aurora", "Moda Sol", "Calzado Andino", "Bella Piel", "Mundo Bebé", "Accesorios Luna", "Deportes Río", "Casa Verde",
  "Dulce Hogar", "Tecno Plus", "Perfumes Brisa", "Joyas Nácar", "Ropa Urbana", "Mascotas Felices", "Papelería Arcoíris", "Natural Vida",
  "Café del Valle", "Juguetes Kiwi", "Óptica Clara", "Ferretería Roble"];
const NOMBRES = ["María", "José", "Ana", "Luis", "Paola", "Carlos", "Diana", "Jorge", "Sofía", "David", "Valentina", "Daniel", "Natalia", "Mateo"];
const APELLIDOS = ["Pérez", "López", "Martínez", "García", "Rodríguez", "Hernández", "Muñoz", "Rojas", "Díaz", "Torres"];

export function datosDemo(u: Usuario): Almacen {
  const r = azar(7), elegir = <X,>(xs: X[]) => xs[Math.floor(r() * xs.length)];
  const S: Almacen = { pedidos: {}, clientes: {}, mensajeros: {}, movimientos: {}, recaudos: {}, liquidaciones: {}, jornadas: {}, cajamovs: {}, vinculos: {}, usuarios: {}, cuentas: {} };
  PERSONAS.forEach(([id, nombre, tipo, tarifa]) => (S.mensajeros[id] = { id, nombre, telefono: "300 000 00" + id.length, tipo, tarifa }));
  CLIENTES.forEach((nombre, i) => { const id = "c" + (i + 1); S.clientes[id] = { id, nombre, telefono: "310 555 " + String(1000 + i * 37).slice(0, 4), tarifa: [8000, 9000, 10000, 12000][i % 4] }; });
  const reps = ["m1", "m2", "m3", "m4", "m-dueno", "m-ofi"], ahora = Date.now(), H = 36e5, h = hoy();
  let n = 1;
  for (let d = 34; d >= 0; d--) {
    const dia = moverDia(h, -d), base = new Date(dia + "T08:00:00-05:00").getTime();
    if (new Date(dia + "T12:00:00-05:00").getUTCDay() === 0 && d) continue; // domingos sin envíos
    const cuantos = d === 0 ? 26 : 18 + Math.floor(r() * 16);
    for (let k = 0; k < cuantos; k++) {
      const creado = base + Math.floor(r() * 7 * H), mid = elegir(reps.slice(0, r() < .85 ? 4 : 6));
      if (creado > ahora) continue;
      const cid = d === 0 && k > 21 ? "" : "c" + (1 + Math.floor(Math.pow(r(), 1.6) * CLIENTES.length));
      const guia = "JS-" + String(n).padStart(5, "0");
      const serv = cid ? S.clientes[cid].tarifa : 0, aCobrar = r() < .7 ? Math.round((40 + r() * 160)) * 1000 : 0;
      const p: Pedido = { guia, n: n++, estado: "pendiente", creado, entregado: null, mensajeroId: mid, clienteId: cid, clienteNombre: cid ? S.clientes[cid].nombre : "",
        valorServicio: serv, aCobrar, destinatario: "", valorCobrado: 0, metodo: "", cuentaJs: "", difCobro: 0, difRevisada: false, motivoDev: "", notaDev: "", cobrarDev: false,
        cambio: false, cambioRecibido: null, gasto: 0, gastoNota: "", domiPagado: false, domiPagoMedio: "", domiPagoValor: null, domiPagoFecha: 0, domiPagoUid: "", intentos: [], mini: "" };
      const fin = creado + (1 + r() * 6) * H, x = r();
      if (fin < ahora && (d > 0 || x < .7)) {
        if (x < .92 || d === 0 && x < .95) {
          const metodo: Metodo = aCobrar ? (r() < .65 ? "efectivo" : r() < .8 ? "transf_js" : "transf_cliente") : "efectivo";
          const v = metodo === "transf_cliente" ? 0 : aCobrar + (r() < .03 ? -5000 : 0);
          Object.assign(p, { estado: "entregado", entregado: fin, destinatario: elegir(NOMBRES) + " " + elegir(APELLIDOS), metodo, valorCobrado: v,
            cuentaJs: metodo === "transf_js" ? (r() < .5 ? "nequi" : "bancolombia") : "", difCobro: aCobrar && metodo !== "transf_cliente" ? v - aCobrar : 0, cambio: r() < .04 });
          if (r() < .03) Object.assign(p, { gasto: 12000, gastoNota: "Bus intermunicipal" });
          if (r() < .02 && d < 3) p.valorServicio = 0;
        } else {
          const motivo = elegir<Motivo>(["no_contesta", "no_contesta", "direccion", "rechazo", "otro"]);
          Object.assign(p, { estado: "devuelto", entregado: fin, metodo: "devuelto", motivoDev: motivo, notaDev: motivo === "otro" ? "Cerrado el local" : "", cobrarDev: true });
        }
      } else if (r() < .15) p.intentos = [{ fecha: creado + 3 * H, motivo: "reprogramar", nota: "Pidió que pase mañana" }];
      S.pedidos[guia] = p;
    }
  }
  // Guías de solicitudes del portal, asignadas y sin recoger ("Por recoger" del mensajero).
  ([["m1", "c1", "Cra 10 # 5-20, Barrio Granada", "Pedro Ruiz", "Calle 70 # 1-10, Floralia"], ["m1", "c3", "Av 6N # 20-15, Versalles", "Marta Díaz", "Cra 100 # 14-30, Ciudad Jardín"],
    ["m2", "c2", "Calle 5 # 38-10, San Fernando", "Julián Mora", "Cra 1 # 62-20, Alcázares"]] as const).forEach(([mid, cid, rec, dest, ent], i) => {
    const guia = "JS-" + String(n).padStart(5, "0");
    S.pedidos[guia] = { guia, n: n++, estado: "aceptado", creado: ahora - (i + 1) * 40 * 6e4, entregado: null, mensajeroId: mid, clienteId: cid, clienteNombre: S.clientes[cid].nombre,
      valorServicio: S.clientes[cid].tarifa, aCobrar: i === 1 ? 65000 : 0, destinatario: "", valorCobrado: 0, metodo: "", cuentaJs: "", difCobro: 0, difRevisada: false, motivoDev: "", notaDev: "",
      cobrarDev: false, cambio: false, cambioRecibido: null, gasto: 0, gastoNota: "", domiPagado: false, domiPagoMedio: "", domiPagoValor: null, domiPagoFecha: 0, domiPagoUid: "", intentos: [], mini: "",
      solicitud: { direccionRecogida: rec, direccionEntrega: ent, destinatarioNombre: dest, destinatarioTelefono: "311 000 00" + (10 + i), paquetes: 1 } };
  });
  // Devueltos recientes del primer mensajero: uno por confirmar y uno que ya está en la oficina (esperando reintento).
  Object.values(S.pedidos).filter(p => p.estado === "devuelto" && p.mensajeroId === "m1").sort((a, b) => (b.entregado || 0) - (a.entregado || 0)).slice(0, 2)
    .forEach((p, i) => { p.destinoDev = i === 0 ? "por_definir" : "oficina"; });
  // Movimientos de clientes: pagos que hicieron y pagos que les hizo JS
  let m = 1; const nuevo = (pre: string) => pre + (m++);
  for (let d = 30; d >= 0; d -= 1) {
    const dia = moverDia(h, -d), f = new Date(dia + "T17:30:00-05:00").getTime(); if (f > ahora) continue;
    for (let k = 0; k < 2; k++) {
      const cid = "c" + (1 + Math.floor(r() * CLIENTES.length)), id = nuevo("mv"), tipo = r() < .6 ? "pago_a_cliente" : "pago_de_cliente";
      S.movimientos[id] = { id, clienteId: cid, tipo, valor: Math.round(50 + r() * 300) * 1000, medio: elegir(["efectivo", "nequi", "bancolombia"] as const), nota: "", fecha: f + k * 6e5, porUid: k ? "u-asis" : "u-admin", porNombre: k ? "Camila Ríos" : "Laura Gómez" };
    }
    if (r() < .25) { const id = nuevo("mv"); S.movimientos[id] = { id, clienteId: "c2", tipo: "ganancia", valor: 4000, medio: "", nota: "Punto extra", fecha: f, porUid: "u-admin", porNombre: "Laura Gómez" }; }
  }
  // Liquidaciones semanales y entregas de plata de los mensajeros
  for (const mid of ["m1", "m2", "m3", "m4"]) {
    let desde = 0;
    for (let d = 28; d >= 3; d -= 7) {
      const f = new Date(moverDia(h, -d) + "T19:00:00-05:00").getTime();
      const guias = Object.values(S.pedidos).filter(p => p.mensajeroId === mid && p.estado !== "pendiente" && (p.entregado || 0) > desde && (p.entregado || 0) <= f).map(p => p.guia);
      const ef = guias.map(g => S.pedidos[g]).filter(p => p.metodo === "efectivo").reduce((a, p) => a + p.valorCobrado, 0), gastos = guias.reduce((a, g) => a + S.pedidos[g].gasto, 0);
      const rid = nuevo("rc"); S.recaudos[rid] = { id: rid, mensajeroId: mid, valor: ef - gastos, medio: "efectivo", nota: "", fecha: f - 6e5, porUid: "u-asis", porNombre: "Camila Ríos" };
      const id = nuevo("lq"); S.liquidaciones[id] = { id, mensajeroId: mid, fecha: f, desde, guias, entregas: guias.length, efectivo: ef, transfJs: 0, transfCli: 0, gastos, base: 0, recibido: ef - gastos, anterior: 0, ajuste: 0, debe: 0, sueldo: 0 };
      desde = f;
    }
    for (let d = 2; d >= 0; d--) {
      const f = new Date(moverDia(h, -d) + "T18:00:00-05:00").getTime(); if (f > ahora || r() < .3) continue;
      const rid = nuevo("rc"); S.recaudos[rid] = { id: rid, mensajeroId: mid, valor: Math.round(100 + r() * 400) * 1000, medio: r() < .8 ? "efectivo" : "nequi", nota: "", fecha: f, porUid: "u-asis", porNombre: "Camila Ríos" };
    }
    const bid = nuevo("cj"); S.cajamovs[bid] = { id: bid, tipo: "sale", cat: "base", valor: 50000, medio: "efectivo", concepto: "", fecha: new Date(h + "T07:30:00-05:00").getTime(), personaId: mid, porUid: "u-asis", porNombre: "Camila Ríos" };
  }
  // Caja de la empresa: caja inicial, gastos, un adelanto, un arqueo y cuentas internas
  const fecha = (d: number, hh: string) => new Date(moverDia(h, -d) + "T" + hh + ":00-05:00").getTime();
  const caja = (c: Omit<Almacen["cajamovs"][string], "id">) => { const id = nuevo("cj"); S.cajamovs[id] = { id, ...c }; return id; };
  caja({ tipo: "entra", cat: "inicial", valor: 1500000, medio: "efectivo", concepto: "Caja con la que arrancó la app", fecha: fecha(34, "07:00"), personaId: "" });
  caja({ tipo: "sale", cat: "arriendo", valor: 900000, medio: "bancolombia", concepto: "Arriendo de la oficina", fecha: fecha(20, "10:00"), personaId: "" });
  [12, 6, 1].forEach(d => caja({ tipo: "sale", cat: "gasto", valor: 85000, medio: "efectivo", concepto: "Gasolina y aceite", fecha: fecha(d, "11:00"), personaId: "" }));
  caja({ tipo: "sale", cat: "adelanto", valor: 60000, medio: "efectivo", concepto: "", fecha: fecha(1, "12:00"), personaId: "m2", semana: semanaDe(h) });
  const aq = "aq1";
  caja({ tipo: "marca", cat: "arqueo", arqueoId: aq, valor: 0, medio: "", concepto: "Conteo del sábado", fecha: fecha(8, "20:00"), personaId: "", esperado: {}, contado: {}, porNombre: "Laura Gómez" });
  caja({ tipo: "sale", cat: "arqueo", arqueoId: aq, valor: 3000, medio: "efectivo", concepto: "", fecha: fecha(8, "20:00"), personaId: "" });
  S.cuentas = { cu1: { id: "cu1", nombre: "JS Envíos", tipo: "socio" }, cu2: { id: "cu2", nombre: "MT (tienda de ropa)", tipo: "socio" }, cu3: { id: "cu3", nombre: "Base de JS", tipo: "base" } };
  caja({ tipo: "sale", cat: "interna", cuentaId: "cu1", valor: 400000, medio: "nequi", concepto: "Préstamo para nómina", fecha: fecha(9, "15:00"), personaId: "" });
  caja({ tipo: "entra", cat: "interna", cuentaId: "cu1", valor: 150000, medio: "nequi", concepto: "Abono del préstamo", fecha: fecha(3, "15:00"), personaId: "" });
  caja({ tipo: "sale", cat: "interna", cuentaId: "cu3", valor: 300000, medio: "efectivo", concepto: "Base de la semana", fecha: fecha(5, "08:00"), personaId: "" });
  // Patinador: días marcados de esta semana y la anterior
  for (let d = 0; d < 12; d++) { const dia = moverDia(h, -d); if (diaDe(new Date(dia + "T12:00:00-05:00").getTime()) && d % 7 !== 1) S.jornadas["m-pat_" + dia] = { id: "m-pat_" + dia, personaId: "m-pat", dia, valor: 70000 }; }
  USUARIOS_DEMO.forEach(x => (S.usuarios[x.id] = { uid: x.id, email: x.email, nombre: x.nombre, rol: x.rol, clienteId: "", mensajeroId: x.mensajeroId || "", activo: true }));
  Object.values(S.usuarios).filter(x => x.mensajeroId).forEach(x => (S.vinculos[x.uid] = { uid: x.uid, mensajeroId: x.mensajeroId }));
  // Cada rol ve lo suyo, como en el servidor
  if (u.rol === "mensajero") {
    const mid = u.mensajeroId || "";
    for (const g of Object.keys(S.pedidos)) if (S.pedidos[g].mensajeroId !== mid) delete S.pedidos[g];
    S.mensajeros = { [mid]: S.mensajeros[mid] };
    for (const k of ["recaudos", "liquidaciones"] as const) for (const id of Object.keys(S[k])) if (S[k][id].mensajeroId !== mid) delete S[k][id];
    for (const id of Object.keys(S.cajamovs)) if (S.cajamovs[id].personaId !== mid) delete S.cajamovs[id];
    // Como GET /clientes/buscar: el mensajero solo busca nombre e id para el remitente.
    remitentesDemo = Object.values(S.clientes).map(c => ({ id: c.id, nombre: c.nombre, tarifa: c.tarifa }));
    S.clientes = {}; S.movimientos = {}; S.cuentas = {}; S.usuarios = { [u.id]: S.usuarios[u.id] };
  } else if (u.rol === "asistente") S.usuarios = { [u.id]: S.usuarios[u.id] };
  return S;
}
