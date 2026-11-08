/* Exporta TODA la base de Firestore y las cuentas de Firebase Auth a una carpeta de archivos JSONL
   (un documento por línea), para importarla después en Postgres con `npm run db:importar` del backend.

   Solo LEE: no cambia nada en Firebase. Lo corre quien tenga acceso al proyecto de Firebase.

   Uso:
     cd backend/migracion && npm install
     node exportar-firestore.js --credenciales ./llave.json
     node exportar-firestore.js --credenciales ./llave.json --sin-fotos        # rápido: sin fotos ni firmas
     node exportar-firestore.js --credenciales ./llave.json --solo pedidos,clientes

   Resultado: exportacion-AAAA-MM-DD-HHMM/
     manifiesto.json          proyecto, fecha y cuántos documentos tiene cada colección
     <coleccion>.jsonl        {"id": "...", "datos": {...}} por línea
     auth.jsonl               cuentas de Firebase Auth: uid, correo, nombre, desactivada (sin contraseñas)

   La carpeta tiene datos reales de clientes: no la subas al repositorio ni la mandes por chat público. */
import { parseArgs } from "node:util";
import { createWriteStream } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { once } from "node:events";
import { initializeApp, cert } from "firebase-admin/app";
import { getFirestore, FieldPath, Timestamp, GeoPoint, DocumentReference } from "firebase-admin/firestore";
import { getAuth } from "firebase-admin/auth";

const { values: a } = parseArgs({
  options: {
    credenciales: { type: "string" },
    salida: { type: "string" },
    "sin-fotos": { type: "boolean", default: false },
    solo: { type: "string" }
  }
});

// Colecciones con imágenes (dataURL dentro del documento): se leen de a pocas para no llenar la memoria.
const CON_FOTOS = new Set(["fotos", "entregas", "papelera_fotos"]);

/** Pasa lo propio de Firestore a JSON simple. Las fechas quedan en milisegundos, como las guarda la app. */
export function aJson(v) {
  if (v === null || v === undefined) return null;
  if (v instanceof Timestamp) return v.toMillis();
  if (v instanceof Date) return v.getTime();
  if (v instanceof GeoPoint) return { lat: v.latitude, lng: v.longitude };
  if (v instanceof DocumentReference) return v.path;
  if (Buffer.isBuffer(v) || v instanceof Uint8Array) return Buffer.from(v).toString("base64");
  if (Array.isArray(v)) return v.map(aJson);
  if (typeof v === "object") return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, aJson(x)]));
  return v;
}

const hora = () => new Date().toLocaleTimeString("es-CO", { timeZone: "America/Bogota" });

async function escribirLineas(ruta, generador) {
  const f = createWriteStream(ruta, { encoding: "utf8" });
  let n = 0;
  for await (const linea of generador) {
    if (!f.write(JSON.stringify(linea) + "\n")) await once(f, "drain");
    n++;
  }
  f.end();
  await once(f, "finish");
  return n;
}

async function* documentos(db, nombre) {
  const tam = CON_FOTOS.has(nombre) ? 100 : 1000;
  let ultimo = null;
  for (;;) {
    let q = db.collection(nombre).orderBy(FieldPath.documentId()).limit(tam);
    if (ultimo) q = q.startAfter(ultimo);
    const s = await q.get();
    for (const d of s.docs) yield { id: d.id, datos: aJson(d.data()) };
    if (s.size < tam) return;
    ultimo = s.docs[s.docs.length - 1];
  }
}

async function* cuentas(auth) {
  let token;
  do {
    const r = await auth.listUsers(1000, token);
    for (const u of r.users) {
      yield {
        id: u.uid,
        datos: {
          uid: u.uid, email: u.email ?? "", nombre: u.displayName ?? "", desactivada: u.disabled,
          creado: Date.parse(u.metadata.creationTime) || null, ultimoIngreso: Date.parse(u.metadata.lastSignInTime) || null
        }
      };
    }
    token = r.pageToken;
  } while (token);
}

async function main() {
  const rutaLlave = a.credenciales || process.env.GOOGLE_APPLICATION_CREDENTIALS;
  if (!rutaLlave) throw new Error("Falta --credenciales con la ruta de la llave (.json) de la cuenta de servicio");
  const llave = JSON.parse(await readFile(resolve(rutaLlave), "utf8"));
  initializeApp({ credential: cert(llave), projectId: llave.project_id });
  const db = getFirestore();

  const ahora = new Date(), p = n => String(n).padStart(2, "0");
  const carpeta = resolve(a.salida || `exportacion-${ahora.getFullYear()}-${p(ahora.getMonth() + 1)}-${p(ahora.getDate())}-${p(ahora.getHours())}${p(ahora.getMinutes())}`);
  await mkdir(carpeta, { recursive: true });

  const solo = a.solo ? new Set(a.solo.split(",").map(s => s.trim()).filter(Boolean)) : null;
  let nombres = (await db.listCollections()).map(c => c.id).sort();
  if (solo) nombres = nombres.filter(n => solo.has(n));
  if (a["sin-fotos"]) nombres = nombres.filter(n => !CON_FOTOS.has(n));

  console.log(`Proyecto ${llave.project_id} → ${carpeta}`);
  const conteo = {};
  for (const nombre of nombres) {
    process.stdout.write(`[${hora()}] ${nombre}… `);
    conteo[nombre] = await escribirLineas(join(carpeta, `${nombre}.jsonl`), documentos(db, nombre));
    console.log(`${conteo[nombre]} documentos`);
  }

  let cuentasAuth = null;
  if (!solo || solo.has("auth")) {
    process.stdout.write(`[${hora()}] cuentas de Firebase Auth… `);
    cuentasAuth = await escribirLineas(join(carpeta, "auth.jsonl"), cuentas(getAuth()));
    console.log(`${cuentasAuth} cuentas`);
  }

  const manifiesto = {
    proyecto: llave.project_id, fecha: ahora.toISOString(), sinFotos: a["sin-fotos"], parcial: !!solo,
    colecciones: conteo, cuentasAuth
  };
  await writeFile(join(carpeta, "manifiesto.json"), JSON.stringify(manifiesto, null, 2));
  const total = Object.values(conteo).reduce((s, n) => s + n, 0);
  console.log(`\nListo: ${total} documentos en ${nombres.length} colecciones. Carpeta: ${carpeta}`);
  console.log("Comprímela y compártela en privado (por ejemplo, Drive con acceso solo para una persona). Después borra la llave.");
}

// Solo corre si se llama desde la terminal (las pruebas importan aJson sin conectarse a Firebase).
if (process.argv[1] && resolve(process.argv[1]) === new URL(import.meta.url).pathname) {
  main().catch(e => {
    const cuota = /RESOURCE_EXHAUSTED|Quota exceeded/i.test(String(e?.message));
    console.error("\nNo se pudo exportar:", cuota
      ? "se acabó la cuota diaria de lecturas del plan gratis de Firebase (50.000 por día). Vuelve a correrlo mañana con --solo y las colecciones que faltaron."
      : e.message);
    process.exitCode = 1;
  });
}
