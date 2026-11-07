# JS Logistics

> **Migración en curso.** El sistema nuevo está en [`backend/`](backend/) (Node.js + Express + PostgreSQL) y en [`frontend/`](frontend/) (React + TypeScript + Tailwind). Lo que describe este README (`app/` + Firebase) sigue en producción hasta el cambio. Convenciones para agentes de IA y para quien programe: [CLAUDE.md](CLAUDE.md).

App web (PWA) de JS Logistics, empresa de mensajería en Cali. Maneja pedidos y entregas con fotos y firma, clientes y sus saldos, la caja de la empresa (arqueos y cajas de oficina por asistente), liquidaciones de mensajeros, sueldos, recibos imprimibles y el historial de cambios.

- **En producción:** https://js-logistics-299ce.web.app (Firebase Hosting, proyecto `js-logistics-299ce`).
- **Arquitectura y decisiones técnicas:** [ARCHITECTURE.md](ARCHITECTURE.md).
- **Esquema de datos (colecciones y campos):** [docs/datos.md](docs/datos.md).

## 1. Visión general

```
Navegador / PWA (Chrome, Safari)                     Google Firebase (proyecto js-logistics-299ce)
┌──────────────────────────────────────┐           ┌───────────────────────────────────────────┐
│ index.html + estilos.css             │  HTTPS    │ Hosting: sirve app/ (estático, sin build) │
│ plataforma.js  (módulo ES)           │◀─────────▶│ Authentication: correo y contraseña       │
│   · Firebase SDK web 10.12.2 (CDN)   │  WebSocket│ Cloud Firestore (us-east1, nativo):       │
│   · adaptador db.collection()/doc()  │  /gRPC-web│   datos + fotos en base64                 │
│ app.js (script clásico, ~2.800 líneas)│           │   firestore.rules = autorización por rol  │
│   · estado global S, pantallas y      │           └───────────────────────────────────────────┘
│     toda la lógica de negocio         │
│ sw.js: caché de la app (sin señal)    │
└──────────────────────────────────────┘
```

- **No hay backend propio.** El navegador habla directo con Firestore mediante el SDK web de Firebase. La seguridad la imponen las reglas de `firestore.rules` en el servidor de Google.
- **No hay compilación.** Los archivos de `app/` se publican tal cual: no hay `package.json` ni bundler, y las librerías se cargan desde CDN.
- **La lógica de negocio corre en el cliente.** Saldos de clientes, períodos de mensajeros, libro de caja, arqueos y sueldos se calculan en el navegador sobre las colecciones descargadas.
- **Tiempo real:** cada rol se suscribe con `onSnapshot` a lo que le corresponde. Administración y asistentes descargan las colecciones completas; mensajeros y clientes, solo lo suyo.

### Roles

| Rol | Qué hace |
|---|---|
| **Administración** | Todo: panel de inicio, pedidos, clientes, caja general, arqueos, cierre del día, cuentas internas, sueldos, personal, accesos, historial, respaldo. |
| **Asistente (oficina)** | Pedidos (asignar remitente y valores), clientes, pagos de clientes en Cuentas, recibir dinero de mensajeros, dar bases desde su caja de oficina y corregir el medio de pago de lo suyo en 24 h. No ve la caja general, sueldos, personal ni historial, y no borra. |
| **Mensajero** | Crear guías con foto, entregar (foto y firma) o devolver, ver sus entregados (solo lectura), su caja y su sueldo. |
| **Cliente** | Solo lectura: sus pedidos con las pruebas de entrega, su saldo, sus movimientos y el recibo del día. |

Los permisos de cada rol se describen en `firestore.rules` y en [docs/datos.md](docs/datos.md#reglas-de-seguridad).

## 2. Stack tecnológico

| Capa | Tecnología | Versión / detalle |
|---|---|---|
| Frontend | HTML + CSS + JavaScript sin framework | `app.js` como script clásico y `plataforma.js` como módulo ES. Sin TypeScript. |
| SDK | Firebase Web SDK modular (app, auth, firestore) | **10.12.2**, cargado desde `https://www.gstatic.com/firebasejs/10.12.2/…` (`plataforma.js`, constante `V`). |
| Excel | ExcelJS | **4.4.0**, por CDN jsDelivr (`index.html`), para descargar planillas y respaldos. |
| Tipografía | Google Fonts, Poppins | 400–800 |
| PWA | `manifest.webmanifest` y `sw.js` | Caché `js-logistics-v5`: primero la red y, si no hay, la copia guardada. Los datos no se cachean. |
| Autenticación | Firebase Authentication | Correo y contraseña. Las cuentas las crea administración desde la app. |
| Base de datos | **Cloud Firestore**, modo nativo, edición estándar | Base `(default)` en **`us-east1`**. Sin índices compuestos (`firestore.indexes.json` vacío). |
| Archivos (fotos) | Dentro de Firestore, en base64 | JPEG de 800 px y calidad 0,5 (unos 70–80 KB). No se usa Cloud Storage. |
| Hosting | Firebase Hosting | `firebase.json`: carpeta pública `app/` y `Cache-Control: no-cache` en html/js/css. |
| Herramientas | Node.js y firebase-tools | Node **24.22.1** y firebase-tools **15.34.1**. Solo sirven para publicar: la app no usa Node en ejecución. |
| Servidor local | `python3 -m http.server` | Puerto 5173 (`iniciar-local.command` y `.claude/launch.json`). |

## 3. Base de datos

**Servicio:** Google Cloud Firestore, base de documentos NoSQL. No se usan Realtime Database, SQL ni Cloud Storage.

Colecciones principales (el detalle de los campos está en [docs/datos.md](docs/datos.md)):

| Colección | Contenido |
|---|---|
| `pedidos/{guia}` | Guía `JS-00001`: estado, mensajero, remitente, valores, datos de la entrega y miniatura. |
| `fotos/{guia}`, `entregas/{guia}` | Foto de salida; foto de entrega y firma (base64). |
| `clientes`, `movimientos` | Remitentes y sus pagos y ajustes. El saldo se calcula; no se guarda. |
| `mensajeros`, `vinculos`, `usuarios`, `admins` | Personal, vínculo de cada cuenta con su nombre en Personal, cuentas y roles. |
| `recaudos`, `liquidaciones` | Dinero entregado por los mensajeros y cierres de período. |
| `cajamovs`, `cuentas` | Movimientos de caja (gastos, bases, adelantos, sueldos, cajas de oficina, arqueos) y cuentas internas. |
| `jornadas` | Días trabajados con pago fijo y sueldos anteriores al empalme. |
| `meta` | `contador` (consecutivo de guías), `config` (configuración inicial), `caja` (hora del último arqueo). |
| `historial`, `papelera`, `papelera_fotos` | Registro de cambios y elementos borrados que se pueden recuperar. |

## 4. Configuración local

### Requisitos
- Python 3, solo para servir la carpeta en local.
- Para publicar: Node.js LTS (en el Mac del dueño está en `~/.local/node/bin`) y `npm install -g firebase-tools`.

### Variables de entorno
**No hay `.env`.** La configuración del cliente de Firebase está en `app/js/firebase-config.js`. Esos valores (apiKey, projectId…) **no son secretos**: Firebase los incluye en toda app web, y la seguridad la dan `firestore.rules` y Authentication. Si `apiKey` queda vacío, la app abre en **modo de prueba**: funciona completa, pero en memoria, y los datos se borran al cerrar.

### Correr en local
```bash
python3 -m http.server 5173 --bind 127.0.0.1 --directory app
```
Abre http://localhost:5173. En el Mac del dueño también funciona con doble clic en `iniciar-local.command`.

> **Ojo:** en local la app usa la **base de datos real** de producción, con la cuenta con la que inicies sesión. No hay entorno de pruebas aparte. Para probar sin tocar datos, vacía temporalmente `apiKey` (modo de prueba) o usa la consola sin guardar.
>
> Cada vez que alguien de oficina abre o recarga la app, se leen **todas** las colecciones (unos 1.500 documentos a noviembre de 2026). En el plan gratis (50.000 lecturas al día) eso se agota rápido. Ver [ARCHITECTURE.md](ARCHITECTURE.md#costos-y-cupos).

### Revisar antes de publicar
```bash
node --check app/js/app.js
t=$(mktemp -d) && cp app/js/plataforma.js "$t/p.mjs" && node --check "$t/p.mjs"
firebase deploy --only firestore:rules --dry-run     # compila las reglas sin publicarlas
```

### Publicar
```bash
firebase login                                   # una vez
firebase deploy --only hosting,firestore:rules   # proyecto por defecto: js-logistics-299ce (.firebaserc)
```
Después, comprueba que lo publicado sea igual a lo local:
```bash
shasum -a 256 app/js/app.js; curl -s "https://js-logistics-299ce.web.app/js/app.js?v=$(date +%s)" | shasum -a 256
```
Para publicar en el Mac del dueño con Claude Code está el skill `/publicar`; para revisar los datos, `/auditar` (los dos en `.claude/skills/`).

## 5. Flujo de trabajo

- Rama por cambio (`feat/…`, `fix/…`, `docs/…`) → Pull Request contra `main` → revisión → merge.
- **Hoy no hay CI/CD.** La publicación es manual con `firebase deploy` después del merge. La propuesta para automatizarla está en [ARCHITECTURE.md](ARCHITECTURE.md#cicd).
- Los datos del negocio nunca van al repositorio: `datos-migracion/`, `respaldo-*.zip` y `*.xlsx` están en `.gitignore`.

## 6. Estructura del repositorio

| Ruta | Qué es |
|---|---|
| `app/index.html` | Estructura de la página, splash y carga de librerías. |
| `app/js/plataforma.js` | Inicializa Firebase, maneja la sesión y las pantallas de ingreso, expone `window.plataforma` (adaptador de base de datos, cuentas, descargas e importación) y luego carga `app.js`. |
| `app/js/app.js` | Toda la aplicación: estado `S`, suscripciones, cálculos (saldos, caja, arqueo, sueldos) y pantallas de cada rol. |
| `app/js/firebase-config.js` | Configuración pública del proyecto de Firebase. |
| `app/css/estilos.css` | Estilos, con menú lateral en computador y barra inferior en el celular. |
| `app/sw.js`, `app/manifest.webmanifest`, `app/img/` | PWA e íconos. |
| `firestore.rules` | Autorización por rol en el servidor. |
| `firebase.json`, `.firebaserc`, `firestore.indexes.json` | Configuración de Firebase. |
| `original/index-claude.html` | Versión original de un solo archivo (histórico). |
| `.claude/` | Configuración del servidor local y skills de Claude Code (`publicar`, `auditar`). |
| `docs/datos.md` | Esquema de datos y reglas. |
| `ARCHITECTURE.md` | Diagnóstico técnico y evaluación de la migración. |

## 7. Operación (para el dueño)

- **Respaldo:** Más → Respaldo y espacio → descargar la copia completa cada semana.
- **Espacio:** las fotos se guardan dentro de Firestore. En Respaldo y espacio se pueden liberar las fotos de pedidos viejos ya cerrados.
- **Accesos:** Más → Personal → Accesos a la app (crear, cambiar rol, vincular con Personal, cambiar contraseña).
- **Rutina diaria:** Caja → Cierre del día (pasos 1 a 6) y arqueo por la mañana, antes de mover plata.
