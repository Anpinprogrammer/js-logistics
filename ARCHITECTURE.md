# Arquitectura y diagnóstico técnico: JS Logistics

Documento para el equipo técnico. Está escrito sobre el estado de `main` a noviembre de 2026; el esquema completo de datos está en [docs/datos.md](docs/datos.md).

**Resumen:**
- Hoy JS Logistics es un **cliente grueso sin backend**: el navegador habla directo con Firestore por el SDK de Firebase, toda la lógica de negocio corre en `app.js`, y la seguridad la ponen `firestore.rules`.
- Funciona bien en lo operativo, pero tiene un límite estructural. **La oficina descarga todo el historial en cada apertura** y calcula los saldos en el navegador. Eso hace que el costo y las lecturas crezcan con el tiempo; el 5 de noviembre de 2026 ya se agotó el cupo diario del plan gratis.
- Si se migra a un servidor propio, recomiendo **Node.js + TypeScript**: la lógica ya está en JavaScript y se puede portar casi tal cual.

---

## 1. Cómo interactúa hoy la app con la base de datos

### Conexión: SDK de cliente, sin API intermedia
- `app/js/plataforma.js` carga el **Firebase Web SDK 10.12.2** desde el CDN de Google e inicializa app, Auth y Firestore. Usa `initializeFirestore` con `ignoreUndefinedProperties`, **sin caché persistente** (caché en memoria).
- Expone `window.plataforma.db`, un **adaptador** con la forma `db.collection(ruta).where(...).onSnapshot(...)` y `db.collection(ruta).doc(id).set/update/delete/get`. `app.js` solo habla con ese adaptador, nunca con el SDK. **Esto facilita una migración:** basta con reimplementar el adaptador contra una API REST o WebSocket.
- **Lecturas:** `suscribir(col, filtro)` (en `app.js`) abre un `onSnapshot` por colección y rol y guarda todo en el estado global `S[col][id]`. Cada cambio vuelve a pintar la pantalla.
  - **Administración:** 11 colecciones completas, sin filtro: `pedidos, clientes, mensajeros, movimientos, recaudos, liquidaciones, jornadas, cajamovs, vinculos, usuarios, cuentas`.
  - **Asistente:** `pedidos, clientes, mensajeros, movimientos, cuentas` completas, y `cajamovs` filtrado por `cat` y por su `uid`.
  - **Mensajero:** sus documentos, con `where mensajeroId == / personaId ==`.
  - **Cliente:** sus documentos, con `where clienteId ==`.
- **Escrituras:** las hace directamente el cliente con `rawSet / rawUpd / rawDel`. Las versiones con registro (`guardar / actualizar / borrar`) además escriben en `historial`, y los borrados copian el documento a `papelera`.
- **Transacciones:** solo para el consecutivo de guías (`meta/contador`, en `crearPedido`). La foto de salida se guarda fuera de la transacción para que sea corta.
- **Cálculo:** saldos de clientes, períodos y deudas de mensajeros, libro de caja, cajas de oficina, arqueos y sueldos se calculan **en el navegador** recorriendo las colecciones. Nada de esto se guarda en la base.

### Autenticación
- Firebase Authentication con **correo y contraseña**. Las cuentas las crea administración desde la app, con una segunda instancia de Firebase para no cerrar la sesión del admin (`crearAcceso`).
- El rol se resuelve al iniciar sesión leyendo `usuarios/{uid}`, `admins/{uid}` y `vinculos/{uid}`.

### Autorización: reglas de seguridad
- `firestore.rules` (unas 230 líneas) es **la única capa de autorización**. Usa funciones como `esAdmin()`, `esAsistente()`, `esMio(mensajeroId)` y `esClienteDe(clienteId)`, que hacen `get()` a `usuarios`, `admins` y `vinculos`.
- **Lo que imponen en el servidor:** campos permitidos por rol (`diff().affectedKeys().hasOnly(...)`), fechas del asistente dentro de ±10 minutos de la hora del servidor, ventanas de 24 horas para correcciones, que no se modifique lo ya contado en un arqueo (`meta/caja.corte`), y que el consecutivo solo suba de 1 en 1.
- **Riesgo conocido:** como la lógica de negocio vive en el cliente, las reglas validan la **forma** de cada escritura, no su **coherencia contable** (por ejemplo, que un pago no deje un saldo imposible). Un backend propio cerraría ese hueco.

### Persistencia y funcionamiento sin señal
- **Archivos de la app:** los cachea el service worker (`sw.js`): primero la red y, si no hay, la copia guardada.
- **Datos:** no hay caché offline de Firestore. Para las entregas y devoluciones sin señal hay una **cola propia en `localStorage`** (`js_cola`) que se reenvía al volver la conexión. Solo se encolan los errores de conexión; los de permiso se muestran con su causa.
- **Fotos:** JPEG en base64 dentro de documentos de Firestore (`fotos`, `entregas`), no en Cloud Storage. Ocupan unos 20 MB por día, más o menos el 80 % del espacio.

### Costos y cupos
- Cada apertura de la app por parte de la oficina lee **todos** los documentos: unos 1.540 a noviembre de 2026, creciendo unos 250 por día.
- En el plan Spark (50.000 lecturas al día) eso dio para pocas decenas de aperturas diarias. **El 5 de noviembre de 2026 se agotó el cupo** y los mensajeros no pudieron crear guías ni registrar entregas. Antes, el error se mostraba como "sin señal".
- **Mitigación inmediata:** plan **Blaze** (pago por uso, estimado de 1 a 5 USD al mes hoy) con alertas de presupuesto.
- **Mitigación estructural**, en cualquier stack: dejar de descargar el historial completo. Hay que cargar una ventana reciente y guardar **saldos de cierre** (snapshots por cliente, mensajero y caja), o mover los agregados al servidor.

---

## 2. Migrar a servidor propio: Node.js/Express/TypeScript o Python/FastAPI

### Lo que hay que construir, sea cual sea el lenguaje
1. **Base de datos relacional** (PostgreSQL recomendado): unas 15 tablas que salen directo de [docs/datos.md](docs/datos.md), con `pedidos.intentos[]` y `entregas.previas[]` como tablas hijas o `jsonb`.
2. **Fotos fuera de la base:** almacenamiento de objetos (S3, Cloudflare R2, Backblaze), con URL firmadas. El disco de Render gratis es efímero y meter base64 en Postgres infla la base y los respaldos.
3. **Autenticación propia:** sesiones o JWT con hash de contraseñas (argon2 o bcrypt). Las contraseñas de Firebase **no** se pueden migrar fácilmente: o se reinician las contraseñas, o se exportan los hashes con `firebase auth:export` y se valida con su variante de scrypt.
4. **Autorización:** reimplementar `firestore.rules` como middleware o guardas por rol y por recurso, más **validación contable en el servidor**.
5. **API:** unos 35–45 endpoints de pedidos, entregas, clientes, movimientos, caja, arqueo, oficina, liquidaciones, sueldos, accesos, respaldo e historial.
6. **Tiempo real:** hoy todo es `onSnapshot`. Se reemplaza con **SSE o WebSocket** (eventos por rol) o con consultas periódicas en las pantallas que no lo necesitan al instante.
7. **Lógica de negocio en el servidor:** `saldoPedido`, `saldoCliente`, `periodoMensajero`, `libroCaja`, `cajaOficina`, `esperadoArqueo`, `resumenSemana`, consecutivo de guías e historial y papelera. Así se resuelve el problema de lecturas y costo de raíz: endpoints que devuelven resúmenes paginados.
8. **Migración de datos:** script Firestore → Postgres, con verificación de saldos (que los totales den igual antes y después) y un periodo en paralelo o un corte con respaldo.
9. **Frontend:** reimplementar `window.plataforma` contra la API (`app.js` casi no cambia al principio) y luego quitar los cálculos que pasen al servidor.

### Comparación

| Criterio | Node.js + Express (o Fastify) + TypeScript | Python + FastAPI |
|---|---|---|
| Reuso de la lógica actual | **Alto.** Las funciones de cálculo (`saldoPedido`, `periodoMensajero`, `libroCaja`, `resumenSemana`…) son JavaScript puro: se copian a módulos TS y se tipan. | **Nulo.** Hay que reescribir y volver a probar cada regla contable en Python; es el principal riesgo de descuadres. |
| Tipos | Hoy no hay tipos explícitos (JS sin TypeScript ni JSDoc), pero las formas de los objetos están claras ([docs/datos.md](docs/datos.md)). Pasan **casi 1:1 a `interface`** de TS y a esquemas Zod para validar. | Pydantic es excelente para validar, pero los modelos se escriben desde cero. |
| Un solo lenguaje | Frontend y backend en JS/TS: se pueden **compartir** funciones de cálculo y tipos (por ejemplo, un paquete `shared/`). | Dos lenguajes. |
| ORM / SQL | Prisma o Drizzle, con migraciones tipadas. | SQLAlchemy 2 con Alembic. |
| Tiempo real | WebSocket o SSE nativos (`ws`, Socket.IO). | WebSocket o SSE con Starlette: bien, algo menos ecosistema. |
| Rendimiento con este volumen | De sobra (cientos de pedidos al día). | De sobra. |
| Documentación de la API | Manual o con `zod-to-openapi`. | **OpenAPI automática:** el punto más fuerte de FastAPI. |
| Reportes y análisis futuros | Bien. | **Mejor** si después vienen análisis de datos o reportes pesados (pandas). |
| **Esfuerzo estimado** (1 dev senior, alcance completo de arriba) | **≈ 4–6 semanas** hasta dejar todo en paralelo, más 1 semana de corte y verificación. | **≈ 6–8 semanas**, por la reescritura y validación de la lógica, más 1 semana de corte. |

### Recomendación
- **Node.js + TypeScript**, con Express o Fastify, Prisma o Drizzle, PostgreSQL y Zod. Es lo que mejor se alinea con el repositorio: la lógica y las formas de datos ya existen en JS y se migran por partes, empezando por un `shared/` con los cálculos tipados y probados contra los datos reales.
- **Ruta incremental, menos riesgosa que reescribir todo:**
  1. Saldos de cierre y ventana reciente en Firestore. Arregla el costo ya, sin migrar.
  2. Extraer los cálculos a `shared/` con TypeScript y pruebas que comparen contra los resultados actuales.
  3. API y Postgres en paralelo, con escrituras dobles o sincronización.
  4. Cambiar `window.plataforma` a la API.
  5. Apagar Firestore.
- **Sobre el costo**, para decidir con números: hoy Firebase Blaze costaría unos 1–5 USD al mes. Un backend propio *confiable* (servidor siempre encendido, Postgres administrado con respaldos y almacenamiento de fotos) cuesta en la práctica **7–25 USD al mes** en Render u otro proveedor, más mantenimiento. **La migración se justifica por control, reportes y lógica en el servidor, no por ahorro inmediato.**

---

## 3. Despliegue en Render (gratis) + UptimeRobot y el endpoint `/ready`

### Consideraciones de la plataforma
Son condiciones de la capa gratuita de Render a la fecha de este documento; **verificar las vigentes** antes de decidir:
- **El servicio web gratis se duerme** tras unos 15 minutos sin tráfico, y el arranque en frío tarda decenas de segundos. Un ping cada 5 minutos lo mantiene despierto, pero:
  - Las **horas gratis por mes** son limitadas y un servicio encendido 24/7 se come prácticamente todo el cupo. No alcanza para un segundo servicio.
  - Mantener un servicio gratis despierto a propósito puede contradecir las condiciones de uso del proveedor. Para producción, lo sano es un plan pago básico.
- **Postgres gratis de Render:** históricamente **expira a los 30 días** y no tiene respaldos. **No sirve para datos de producción** de un negocio con dinero: usar un Postgres pago o un proveedor con capa gratis permanente (Neon, Supabase), asumiendo sus límites.
- **El disco es efímero:** nada de fotos ni archivos en el sistema de archivos del servidor.

### Diseño del endpoint
Separar **dos** endpoints:

| Endpoint | Qué hace | Quién lo llama |
|---|---|---|
| `GET /health` (liveness) | Responde `200 {"ok":true}` **sin tocar la base**. | UptimeRobot cada 5 minutos, para mantener despierto el servicio. |
| `GET /ready` (readiness) | Comprueba la base con `SELECT 1` y responde `200`, o `503` con el detalle del fallo. | Render (health check de despliegue) y un monitor de UptimeRobot aparte, menos frecuente (15–30 minutos). |

Reglas para `/ready`:
1. **Reusar el pool de conexiones** de la app (`pg.Pool`, Prisma o Drizzle). Nunca abrir una conexión nueva por cada ping. Pool pequeño (5–10), acorde con el límite de conexiones del plan.
2. **Timeouts cortos:** límite para tomar una conexión del pool (unos 1–2 s) y `statement_timeout` de unos 2 s solo para esa consulta. Si la base tarda, se responde `503` rápido en vez de colgar el worker.
3. **Cachear el resultado** 10–30 s en memoria: varios pings seguidos no generan varias consultas.
4. **Consulta trivial:** `SELECT 1`. Sin tocar tablas, sin transacciones y sin ORM pesado (`$queryRaw` o `pool.query`).
5. **Sin autenticación, sin sesión y fuera del rate limiting y del logging normal,** para no llenar los logs con pings. Registrar solo los fallos.
6. **Responder también a `HEAD`:** algunos planes de UptimeRobot usan HEAD.
7. **Con bases que se suspenden solas** (Neon, Supabase gratis): un `SELECT 1` frecuente **impide que se suspendan** y consume horas de cómputo. Por eso el keep-alive va a `/health`, y `/ready` se consulta con menos frecuencia.
8. **Cierre ordenado:** al recibir `SIGTERM` (Render despliega así), cerrar el pool y responder `503` en `/ready` para que no lleguen solicitudes nuevas.

Ejemplo en Express + `pg`:
```ts
import { Pool } from "pg";
// Pool compartido por toda la app: pocas conexiones y timeouts cortos.
export const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 5, connectionTimeoutMillis: 2000, statement_timeout: 2000 });

app.get("/health", (_req, res) => res.json({ ok: true }));        // keep-alive: no toca la base

let ultimo = { ok: false, t: 0 };
app.all("/ready", async (_req, res) => {                           // GET y HEAD
  if (Date.now() - ultimo.t < 15_000) return res.status(ultimo.ok ? 200 : 503).json({ ok: ultimo.ok, cache: true });
  try { await pool.query("SELECT 1"); ultimo = { ok: true, t: Date.now() }; }
  catch { ultimo = { ok: false, t: Date.now() }; }
  res.status(ultimo.ok ? 200 : 503).json({ ok: ultimo.ok });
});

process.on("SIGTERM", async () => { ultimo = { ok: false, t: Date.now() + 1e9 }; await pool.end(); process.exit(0); });
```

---

## CI/CD

**Hoy no hay.** Se publica a mano con `firebase deploy --only hosting,firestore:rules` desde el Mac del dueño (o con el skill `/publicar`).

Propuesta para automatizar el despliegue después del merge a `main`:
- **GitHub Action** con `FirebaseExtended/action-hosting-deploy`, o `firebase-tools` y una **cuenta de servicio** guardada en el secreto `FIREBASE_SERVICE_ACCOUNT`.
- **Pasos:** `node --check` de los JS, compilar las reglas (`--dry-run`), desplegar hosting y reglas, y comparar el hash publicado.
- **Vista previa por PR:** canal de Firebase Hosting (`hosting:channel:deploy pr-123`) para revisar cada cambio con una URL temporal antes del merge. Ojo: esa vista previa usa la **base real**.
- **Requisito:** el dueño (o un admin del proyecto de Google Cloud) crea la cuenta de servicio y guarda el secreto en GitHub.
- **Recomendado además:** un proyecto de Firebase de pruebas (`js-logistics-dev`), para no probar contra producción.
