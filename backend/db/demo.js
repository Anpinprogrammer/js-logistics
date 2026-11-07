/* Llena una base VACÍA con datos inventados para demostraciones y pruebas manuales.
   Uso: npm run db:demo -- --si
   No corre si ya hay pedidos o cuentas (para no mezclar con datos reales).
   Todas las cuentas quedan con la contraseña "demo-js-2026". */
import { parseArgs } from "node:util";
import { pool, transaccion } from "../config/db.js";
import { hashClave } from "../helpers/claves.js";
import { nuevoId, formatoGuia } from "../helpers/ids.js";
import { diferenciaCobro } from "../helpers/negocio.js";

const { values: a } = parseArgs({ options: { si: { type: "boolean" } } });
const CLAVE = "demo-js-2026";

try {
  if (!a.si) throw new Error("Agrega --si para confirmar que esta es una base de pruebas");
  const { rows: [c] } = await pool.query(`SELECT (SELECT count(*) FROM pedidos) + (SELECT count(*) FROM usuarios) AS n`);
  if (Number(c.n) > 0) throw new Error("La base ya tiene pedidos o cuentas: el demo solo se carga en una base vacía");

  const hash = await hashClave(CLAVE);
  await transaccion(async db => {
    const ins = (sql, v) => db.query(sql, v);
    const persona = async (nombre, tipo = "mensajero", tarifa = 0) => {
      const id = nuevoId();
      await ins(`INSERT INTO mensajeros (id, nombre, telefono, tipo, tarifa) VALUES ($1,$2,$3,$4,$5)`, [id, nombre, "300" + String(Math.random()).slice(2, 9), tipo, tarifa]);
      return id;
    };
    const cuenta = (email, nombre, rol, extra = {}) =>
      ins(`INSERT INTO usuarios (id, email, nombre, rol, clave_hash, mensajero_id, cliente_id) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
        [nuevoId(20), email, nombre, rol, hash, extra.mensajeroId ?? null, extra.clienteId ?? null]).then(r => r.rows[0].id);

    const mCarlos = await persona("Carlos Ruiz"), mDiana = await persona("Diana López"), mPedro = await persona("Pedro Gómez", "patinador", 45000);
    await persona("Laura Méndez", "oficina", 50000);
    const admin = await cuenta("admin@demo.co", "Administración Demo", "admin");
    const asis = await cuenta("oficina@demo.co", "Laura Méndez", "asistente");
    const uCarlos = await cuenta("carlos@demo.co", "Carlos Ruiz", "mensajero", { mensajeroId: mCarlos });
    const uDiana = await cuenta("diana@demo.co", "Diana López", "mensajero", { mensajeroId: mDiana });

    const clientes = [];
    for (const [nombre, tel, tarifa] of [["Moda Bella", "3104567890", 8000], ["Tienda La 14 Express", "3201112233", 7000],
      ["Calzado Andino", "3157778899", 9000], ["Accesorios Valentina", "3009988776", 8000], ["Natural Shop Cali", "3112223344", 7500]]) {
      const id = nuevoId();
      await ins(`INSERT INTO clientes (id, nombre, telefono, tarifa) VALUES ($1,$2,$3,$4)`, [id, nombre, tel, tarifa]);
      clientes.push({ id, tarifa });
    }
    await cuenta("cliente@demo.co", "Moda Bella", "cliente", { clienteId: clientes[0].id });

    const nombres = ["Ana", "Luis", "Marta", "Jorge", "Sofía", "Andrés", "Camila", "Felipe", "Paola", "Julián"];
    const mens = [[mCarlos, uCarlos], [mDiana, uDiana], [mPedro, admin]];
    let n = 0;
    const ahora = Date.now(), H = 3_600_000;
    for (let dia = 3; dia >= 0; dia--) {
      for (let k = 0; k < 9; k++) {
        n++;
        const [mid, uid] = mens[k % 3], cli = clientes[(n * 7) % clientes.length];
        const creado = new Date(ahora - dia * 24 * H - (9 - k) * H);
        const aCobrar = [0, 35000, 52000, 80000, 120000][n % 5];
        const sinAsignar = dia === 0 && k > 6;
        const estado = dia === 0 && k > 3 ? "pendiente" : n % 11 === 0 ? "devuelto" : "entregado";
        await ins(`UPDATE contadores SET n = $1 WHERE nombre = 'guia'`, [n]);
        const p = {
          guia: formatoGuia(n), n, creado, mid, cli: sinAsignar ? null : cli.id,
          serv: sinAsignar ? 0 : cli.tarifa, aCobrar: sinAsignar ? 0 : aCobrar, por: uid
        };
        await ins(`INSERT INTO pedidos (guia, n, creado, mensajero_id, cliente_id, valor_servicio, a_cobrar, creado_por) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
          [p.guia, p.n, p.creado, p.mid, p.cli, p.serv, p.aCobrar, p.por]);
        if (estado === "entregado") {
          const metodo = n % 4 === 0 ? "transf_js" : n % 9 === 0 ? "transf_cliente" : "efectivo";
          const cobrado = metodo === "transf_cliente" ? 0 : n % 13 === 0 ? aCobrar - 5000 : aCobrar;
          await ins(`UPDATE pedidos SET estado='entregado', entregado=$2, destinatario=$3, valor_cobrado=$4, metodo=$5, cuenta_js=$6, dif_cobro=$7, entrego_uid=$8 WHERE guia=$1`,
            [p.guia, new Date(creado.getTime() + 3 * H), nombres[n % nombres.length], Math.max(0, cobrado), metodo, metodo === "transf_js" ? "nequi" : "",
              diferenciaCobro({ aCobrar, valorCobrado: Math.max(0, cobrado), metodo }), uid]);
        } else if (estado === "devuelto") {
          await ins(`INSERT INTO pedido_intentos (guia, fecha, motivo, nota, por) VALUES ($1,$2,'no_contesta','Llamé 3 veces',$3)`, [p.guia, new Date(creado.getTime() + 2 * H), uid]);
          await ins(`UPDATE pedidos SET estado='devuelto', entregado=$2, metodo='devuelto', motivo_dev='no_contesta', nota_dev='Llamé 3 veces', cobrar_dev=true, entrego_uid=$3 WHERE guia=$1`,
            [p.guia, new Date(creado.getTime() + 2 * H), uid]);
        }
      }
    }
    await ins(`INSERT INTO movimientos (id, cliente_id, tipo, valor, medio, nota, fecha, por_uid, por_nombre) VALUES
      ($1,$2,'pago_de_cliente',150000,'nequi','Pago de la semana',now() - interval '1 day',$3,'Laura Méndez'),
      ($4,$2,'cargo',20000,null,'Empaques',now() - interval '2 days',$5,'Administración Demo')`,
      [nuevoId(), clientes[0].id, asis, nuevoId(), admin]);
  });

  console.log(`Demo cargado. Cuentas (contraseña "${CLAVE}"):
  admin@demo.co (administración) · oficina@demo.co (asistente)
  carlos@demo.co, diana@demo.co (mensajeros) · cliente@demo.co (cliente, para el portal de clientes)`);
} catch (e) {
  console.error("No se cargó el demo:", e.message);
  process.exitCode = 1;
} finally {
  await pool.end();
}
