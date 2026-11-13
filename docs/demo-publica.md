# Demo pública (portafolio): guía y recomendaciones

Cómo publicar una **demostración real** de JS Logistics para que cualquiera pueda probar el flujo completo (por ejemplo, desde un portafolio en `ingenieroandrespineda.dev`): un visitante pide un envío en el portal de clientes, la solicitud aparece en la campanita de la oficina, se acepta con un valor, se manda el WhatsApp, se confirma y se asigna a un mensajero.

Esta guía es del lado de la **oficina y el backend** (este repo). La del portal está en `jslogistics-cliente-frontend/docs/demo-publica.md`. Es una guía: no cambia código.

> **Regla de oro:** la demo tiene su **propia base, su propio backend y sus propios dominios**. Nunca se apunta a la base de producción ni se cargan datos reales (ver `CLAUDE.md`).

## Por qué un entorno real y no un demo en el navegador

El flujo cruza dos aplicaciones en dominios distintos (portal → campanita de la oficina). Los modos `VITE_DEMO=true` de cada frontend guardan sus datos en memoria, dentro de su propia pestaña, así que no pueden compartirlos: quien pruebe el portal nunca vería su solicitud llegar a la oficina. Con un backend real y una base de pruebas sí. Los modos demo en memoria siguen sirviendo para las vistas previas de Vercel de cada PR; no se usan para el portafolio.

## Piezas y dominios

| Pieza | Dónde | Dominio sugerido |
|---|---|---|
| Base de datos | Proyecto de Supabase **nuevo** (solo demo) | no es público |
| API | Servicio de Render **nuevo**, raíz `backend/` | el de Render (`algo.onrender.com`); nadie lo abre, solo pasa por las reescrituras |
| Portal de clientes y landing | Proyecto de Vercel con el repo `jslogistics-cliente-frontend` | `portal.ingenieroandrespineda.dev` |
| Oficina y mensajeros | Proyecto de Vercel con este repo, carpeta `frontend/` | `oficina.ingenieroandrespineda.dev` |

Cada frontend llama a `/api` en su propio dominio y una reescritura de Vercel lo manda al Render de la demo. Así la cookie de sesión es de cada subdominio (no se mezclan la del portal y la de la oficina) y funciona en Safari de iPhone.

## Paso a paso

### 1. Base de datos (Supabase)

1. Crea un proyecto de Supabase aparte. Anota la cadena del **Transaction pooler (6543)** para la app y la del **Session pooler (5432)** para migrar y cargar datos (ver "Conexiones y pooler" en `backend/README.md`).
2. Desde `backend/`, con un `.env` **solo para la demo** (o variables exportadas en la terminal):
   ```bash
   npm run db:migrar        # crea las tablas (incluida solicitudes)
   npm run db:demo -- --si  # carga datos inventados en una base VACÍA
   ```
3. `db:demo` se niega a correr si ya hay pedidos o cuentas. Eso protege la producción, pero también significa que **para reiniciar la demo hay que vaciar primero** (ver "Reinicio nocturno").

Cuentas que crea `db:demo` (todas con la contraseña **`demo-js-2026`**; no es la `demo1234` de los modos demo en memoria):

| Correo | Rol |
|---|---|
| `admin@demo.co` | administración |
| `oficina@demo.co` | asistente |
| `carlos@demo.co`, `diana@demo.co` | mensajeros |
| `cliente@demo.co` | cliente (Moda Bella) |

### 2. Backend (Render)

Servicio Web Service con raíz `backend`, build `npm ci`, inicio `npm start`, health check `/api/ready` (ver "Render" en `backend/README.md`). Variables:

| Variable | Valor en la demo |
|---|---|
| `NODE_ENV` | `production` |
| `DATABASE_URL` | Transaction pooler (6543) del Supabase **de la demo** |
| `DATABASE_URL_MIGRACIONES` | Session pooler (5432) del mismo proyecto |
| `JWT_SECRET` | uno nuevo y largo, distinto al de producción |
| `CORS_ORIGENES` | `https://portal.ingenieroandrespineda.dev,https://oficina.ingenieroandrespineda.dev` (separados por coma, con `https://`, **sin barra final**) |
| `TRUST_PROXY` | `2` (Vercel y Render son dos proxies; sin esto el límite por IP cuenta mal) |
| `COOKIE_DOMINIO` | vacío |
| `COOKIE_SAMESITE` | `lax` |
| `URL_CLIENTES` / `URL_EQUIPO` | los dos dominios de arriba (solo se usan en correos) |
| `SOLICITUDES_MAX_PENDIENTES` | `30` (en producción es 200: en una demo pública no hace falta tanto) |
| `SOLICITUDES_POR_HORA` / `SOLICITUDES_POR_DIA` | `3` / `8` |
| `SOLICITUDES_DIA_TOTAL` | `100` |
| `CHATBOT_PUBLICO_ACTIVO` | `false`, o deja `ANTHROPIC_API_KEY` vacío: cada mensaje del chat cuesta dinero y cualquiera puede escribirlo |
| `RESEND_API_KEY` | vacío: no se mandan correos reales |
| `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` | vacíos, salvo que quieras demostrar las fotos de los mensajeros (necesita un bucket propio de la demo) |

Si el origen de un frontend no está en `CORS_ORIGENES`, el servidor responde **403 "Origen no permitido"** a todo lo que no sea GET. Es el primer síntoma de un dominio mal puesto.

### 3. Frontend de la oficina (Vercel)

1. Proyecto nuevo de Vercel con este repo y **Root Directory = `frontend`**.
2. `frontend/vercel.json` reescribe `/api/*` hacia `https://api.jslogistics.pro` (el dominio propio del servicio de Render). Para la demo, la reescritura tiene que apuntar al Render **de la demo**. Opciones, de más a menos limpia: una rama `demo` donde cambias ese destino; o editarlo en la rama que despliega el proyecto de la demo. No lo cambies en `main`, porque es la configuración de producción.
3. Variables: no pongas `VITE_DEMO` (o ponla en `false`): debe hablar con el backend real. Deja `VITE_API_URL` vacía para usar `/api` en el mismo dominio.
4. Agrega el dominio `oficina.ingenieroandrespineda.dev` al proyecto y crea el CNAME que Vercel indique en tu DNS.

### 4. Frontend del portal (Vercel)

Ver `jslogistics-cliente-frontend/docs/demo-publica.md`. Resumen: proyecto aparte, su `vercel.json` apunta al Render de la demo, dominio `portal.ingenieroandrespineda.dev`, y el sitio **debe construirse en modo real** (en el portal, las vistas previas de Vercel se construyen en modo demo en memoria por el `buildCommand`).

### 5. Reinicio nocturno

Como `db:demo` solo corre en una base vacía, el reinicio tiene dos pasos: vaciar y volver a cargar. El vaciado es el mismo `TRUNCATE` que usan las pruebas (`backend/test/ayuda.js`), aplicado **solo a la base de la demo**:

```sql
TRUNCATE historial, papelera, pedido_intentos, pedido_archivos, pedidos, movimientos, recaudos,
  liquidaciones, cajamovs, jornadas, enlaces, solicitudes, usuarios, clientes, mensajeros, cuentas, ajustes
  RESTART IDENTITY CASCADE;
UPDATE contadores SET n = 0;
```

Después, `npm run db:demo -- --si`. Dónde correrlo:

- **GitHub Action programada** (`schedule`) en un repo o rama de la demo, con la cadena de la base como secreto del repositorio: clona, `npm ci` en `backend/`, corre el `TRUNCATE` con `psql "$DATABASE_URL_MIGRACIONES"` y luego `npm run db:demo -- --si`. Es lo más simple y no cuesta.
- **Cron job de Render**, con el mismo comando, si prefieres tenerlo junto al servicio.

Antes de automatizarlo, **verifica dos veces que la cadena apunta a la base de la demo**: un `TRUNCATE` contra producción borraría todo. Una forma de protegerse es que el secreto del repositorio de la demo solo tenga la cadena de la demo y que el repositorio de producción no tenga acceso a ella.

Aunque se reinicie cada noche, las pruebas de varios visitantes simultáneos se mezclan durante el día. Es lo esperado en una demo compartida.

## Experiencia del visitante

Conviene una página de portafolio (o un recuadro) que explique el flujo con datos falsos:

1. En el portal (`/register`, "Solicitar envío"), llena la solicitud con **datos ficticios** (teléfonos como `300 000 0000`, direcciones inventadas).
2. En la oficina, ingresa con `admin@demo.co` / `demo-js-2026`.
3. Abre la campanita (arriba, junto al avatar): aparece la solicitud nueva. Ponle un valor y **Aceptar**.
4. **Enviar valor por WhatsApp** abre `wa.me` con el mensaje armado; no se manda nada por su cuenta.
5. **El cliente está de acuerdo** → elige un mensajero → **Asignar y crear guía**.
6. En Pedidos aparece la guía nueva. Con `carlos@demo.co` (modo mensajero) se ve en su lista.

Avisos útiles en esa página: que la demo se reinicia cada noche, que no se guardan datos reales y que la contraseña de las cuentas demo es pública.

## Seguridad y costos

- Las cuentas demo y su clave son públicas a propósito; por eso la base, el `JWT_SECRET` y el backend **no se comparten con producción** bajo ninguna circunstancia.
- Los límites de solicitudes por IP y los topes globales (ver `backend/README.md`, `POST /solicitudes/publico`) frenan que alguien llene la campanita; en la demo se bajan a propósito.
- El plan gratis de Render se duerme a los 15 minutos y el primer visitante espera unos segundos. Para una demo de portafolio sirve; si molesta, un monitor externo que llame `/api/health` cada 10 minutos lo mantiene despierto.
- Sin `RESEND_API_KEY`, `ANTHROPIC_API_KEY` y Storage, la demo no tiene costos variables.
- No pongas en el `.env` de la demo nada que sirva en producción, y no subas ese archivo al repositorio.

## Revisión rápida cuando algo no llega

1. En el navegador (DevTools → Network), el `POST /api/solicitudes/publico`: **201** = guardada (si no la ves en la base, el backend apunta a otra base); **403** = el origen no está en `CORS_ORIGENES`; **404** = el servicio de Render no tiene el código nuevo; **429** = límite por IP.
2. Que el sitio **no** esté en modo demo en memoria: en el portal, la página `/register` dice "Sin crear cuenta" (en modo demo dice "Vista de demostración").
3. En la oficina, la campanita se actualiza cada 30 segundos y solo la ven administración y asistente (no el modo Mensajero).
4. En la base: `select estado, nombre, creado from solicitudes order by creado desc;`
