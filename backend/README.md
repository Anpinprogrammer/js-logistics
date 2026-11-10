# Backend de JS Logistics

API en **Node.js + Express 5**, con arquitectura **MVC**, sobre **PostgreSQL** (pensado para Supabase) y para desplegar en **Render**.
Reemplaza el acceso directo del navegador a Firestore: la autorización por rol y los cálculos pasan al servidor.

## Estructura

```
backend/
├── index.js              Inicia el servidor (puerto, cierre ordenado con SIGTERM)
├── app.js                Arma la app de Express: seguridad, JSON, cookies, rutas y errores
├── config/
│   ├── env.js            Variables de entorno validadas con Zod (si falta algo, no arranca)
│   └── db.js             Pool de Postgres y helper de transacciones
├── middleware/
│   ├── autenticar.js     Lee el JWT de la cookie, lo verifica y carga la cuenta (req.usuario)
│   ├── autorizar.js      permitir("admin", "asistente"…) por rol
│   ├── validar.js        Valida body, query y params con Zod (req.valido)
│   ├── seguridad.js      Helmet, CORS, protección CSRF y límite de intentos
│   └── errores.js        404 y manejo central de errores
├── routes/               Una por recurso, montadas en /api (routes/index.js)
├── controllers/          Reciben la petición y responden. accion.js conecta Express con los servicios (fechas a ISO)
├── servicios/            Reglas del negocio copiadas de app/js/app.js: pedidos, caja, clientes, mensajeros, movimientos,
│                         sueldos, historial, papelera. Corren en una transacción y avisan por SSE qué cambió.
│                         enlaces.js crea y consume los enlaces de correo (activación y contraseña).
├── models/               Consultas SQL por tabla (sin lógica de permisos). documentos.js ve las tablas con la forma
│                         de documento de la app (fechas en ms), para que los cálculos den lo mismo
├── validators/           Esquemas de Zod de cada petición
├── helpers/              Utilidades: errores HTTP, JWT, cookies, contraseñas, IDs y SQL. calculos.js, constantes.js,
│                         fechas.js y texto.js son copia fiel de app/js/app.js (saldos, caja, arqueos, sueldos…).
│                         correo.js habla con Resend y arma las plantillas de los correos.
├── db/
│   ├── schema.sql        Tablas, índices y restricciones (se puede correr varias veces)
│   ├── migrar.js         npm run db:migrar
│   ├── crear-admin.js    npm run db:admin -- --email … --clave … [--restablecer]
│   ├── demo.js           npm run db:demo -- --si (datos inventados, solo en una base vacía)
│   └── importar-firestore.js  npm run db:importar -- --carpeta … [--simular] (ver ../docs/migracion-firestore.md)
├── migracion/            Exportador de Firestore (paquete aparte, con firebase-admin): lo corre el dueño de Firebase
└── test/                 Pruebas de integración contra un Postgres de pruebas
```

## Sesión: JWT en una cookie

- `POST /api/auth/ingresar` valida correo y contraseña (bcrypt) y responde con la cookie `jsl_sesion`: **HttpOnly** (el JavaScript del navegador no la puede leer), `Secure` en producción y `SameSite=Lax` por defecto.
- El JWT solo lleva el id de la cuenta y una **versión de sesión**. En cada petición, `autenticar` carga la cuenta de la base: si administración cambia el rol, desactiva la cuenta o cambia la contraseña, las sesiones abiertas dejan de servir al instante.
- **CSRF:** toda petición que no sea GET debe traer la cabecera `X-JSL: 1` y, si trae `Origin`, debe ser uno de `CORS_ORIGENES`.
- El frontend debe llamar con `credentials: "include"`.
- **Recomendado:** servir el frontend y la API en el mismo sitio, por ejemplo con el static site de Render reescribiendo `/api/*` hacia este servicio, o con `app.midominio.com` y `api.midominio.com`. Si quedan en dos dominios `onrender.com` distintos, hay que usar `COOKIE_SAMESITE=none`, y Safari en iOS suele bloquear esas cookies.

## Correr en local

Necesitas Node 20 o más y un Postgres: el de Supabase o uno local.

```bash
cd backend
npm install
cp .env.example .env        # llena DATABASE_URL y JWT_SECRET
npm run db:migrar           # crea las tablas
npm run db:admin -- --email tu@correo.com --nombre "Tu nombre" --clave "una-clave-larga"
npm run dev                 # http://localhost:4000/api
```

Probar a mano:

```bash
curl -i -c c.txt -H 'X-JSL: 1' -H 'Content-Type: application/json' \
  -d '{"email":"tu@correo.com","clave":"una-clave-larga"}' http://localhost:4000/api/auth/ingresar
curl -b c.txt http://localhost:4000/api/auth/yo
```

### Si el frontend recibe 403 o 404 raros

Casi siempre es que **otro proceso ocupa el puerto 4000** y las llamadas llegan a otro backend. Este API responde los errores como `{ "error": { "code", "message" } }`; un 404 en HTML ("Cannot GET /api/…") o un `{"error":"Origen no permitido"}` sin `code` viene de otro servidor. Mira quién escucha con `lsof -iTCP:4000 -sTCP:LISTEN -n -P`. Cierra ese proceso, o cambia `PORT` en `.env` y arranca el frontend con `VITE_API_PROXY=http://localhost:<puerto> npm run dev`.

Los 403 de este API: `Falta la cabecera X-JSL` (se llamó sin `X-JSL: 1`) y `Origen no permitido` (el navegador entró por un origen que no está en `CORS_ORIGENES`, por ejemplo `127.0.0.1:5173` en vez de `localhost:5173`).

## Pruebas

Usan una base **aparte**, que se vacía en cada corrida. Nunca apuntes `TEST_DATABASE_URL` a la base real.

```bash
createdb jsl_test
TEST_DATABASE_URL=postgresql://postgres@127.0.0.1:5432/jsl_test npm test
```

## Actualizar la base de una instalación que ya existe

El esquema está en un solo archivo, `db/schema.sql`, y **se puede correr cuantas veces quieras**: crea lo que falta y no borra datos.
No hay archivos de migración sueltos; cada cambio se escribe ahí con `CREATE … IF NOT EXISTS`, `ALTER … ADD COLUMN IF NOT EXISTS` o un bloque `DO` que revisa antes de cambiar.

```bash
cd backend
# 1. Respaldo antes de tocar producción (Supabase: Database → Backups, o pg_dump con la cadena de conexión)
pg_dump "$DATABASE_URL" -Fc -f respaldo-$(date +%F).dump
# 2. Aplicar el esquema (usa DATABASE_URL del .env)
npm run db:migrar
# 3. Si los datos vienen de Firebase, vuelve a importar para completar lo que el importador viejo no guardaba
npm run db:importar -- --carpeta ../exportacion-… --simular
npm run db:importar -- --carpeta ../exportacion-…
```

Qué cambia esta versión del esquema (todo lo hace `npm run db:migrar`):

| Tabla | Cambio | Por qué |
|---|---|---|
| `liquidaciones.guias` | Puede ser `NULL` y ya no tiene `'{}'` por defecto. Las que tienen entregas pero lista vacía pasan a `NULL` | En la app, una liquidación vieja sin lista de guías se cuenta distinto que una con lista vacía |
| `cajamovs.de_liquidacion` | Pasa de sí/no (`BOOLEAN`) a `TEXT` con el ID de la liquidación (sale de `extra.liquidacionId`; si no estaba, queda `'importado'`). Nuevo índice `cajamovs_liquidacion_idx` | Reabrir una liquidación quita el adelanto que salió de ella: hay que saber de cuál salió |
| `jornadas.nota` | Columna nueva (`TEXT`, `''` por defecto) | La app guarda "Sueldo anterior" en los días previos |

Después de `db:migrar`, la importación (paso 3) deja `de_liquidacion` con el ID real en los adelantos que quedaron como `'importado'`, y la nota de las jornadas.
Si no vienes de Firebase, no hace falta.

Para revisar que quedó bien:

```sql
SELECT count(*) FROM cajamovs WHERE de_liquidacion = 'importado';      -- 0 después de reimportar
SELECT column_name, data_type FROM information_schema.columns
 WHERE table_name IN ('cajamovs', 'jornadas', 'liquidaciones') AND column_name IN ('de_liquidacion', 'nota', 'guias');
```

## Supabase

1. Crea el proyecto y copia la cadena de conexión: *Project Settings → Database → Connection string*. Desde Render conviene el **pooler** (Supavisor).
2. `DATABASE_SSL=true`. Para verificar el certificado, descarga el de *Database Settings → SSL* y ponlo en `DATABASE_CA`.
   El esquema incluye `usuarios.clave_hash NULL` para las cuentas pendientes y una columna generada `usuarios.status` (`pending_activation`, `active`, `disabled`). Los tokens de activación/contraseña se guardan hasheados en `enlaces`, no en `usuarios`. Después de actualizar el código, corre `npm run db:migrar` para agregar esa columna antes de desplegar.
3. `npm run db:migrar`. El esquema activa **RLS sin políticas** en todas las tablas: así la Data API pública de Supabase (la anon key) no puede leer nada, y todo pasa por esta API.
4. **Storage:** crea un bucket **privado** llamado `pedidos` y pon `SUPABASE_URL` y `SUPABASE_SERVICE_ROLE_KEY` (*Project Settings → API*). La service role key es secreta: solo va en el backend, nunca en el frontend.
5. Usa un proyecto de Supabase para pruebas y otro para producción.

### Conexiones y pooler

- El backend usa un pool con `DATABASE_POOL_MAX=5`, `DATABASE_POOL_IDLE_MS=10000` y `DATABASE_CONNECT_TIMEOUT_MS=5000`.
- El **Session pooler** (puerto 5432) tiene **15 cupos por proyecto**. Cada proceso (local, Render, pruebas) abre hasta `DATABASE_POOL_MAX`; con local y Render a 10 cada uno se agota y aparece `EMAXCONNSESSION`.
- Para la app con varias instancias, usa el **Transaction pooler** (puerto 6543): multiplexa conexiones y permite más clientes. Para `db:migrar` y `db:importar`, usa el Session pooler (5432) o la conexión directa.
- Si aparece `read ETIMEDOUT` en una conexión inactiva, el pool la recicla; `keepAlive` y un `idleTimeout` corto reducen el problema. No subas `DATABASE_POOL_MAX` sin cambiar antes a Transaction mode.

## Render

- Tipo **Web Service**, raíz `backend`, comando de build `npm ci`, comando de inicio `npm start`.
- Health check: `/api/ready`. Para un monitor externo que lo mantenga despierto, usa `/api/health`, que no toca la base.
- Variables: las de `.env.example`, con `NODE_ENV=production` y un `JWT_SECRET` nuevo y largo.
- El plan gratis se duerme a los 15 minutos sin tráfico y tarda en despertar; para los mensajeros en la calle conviene un plan pago.

## Correo (Resend)

Los enlaces de **activación** y de **reinicio de contraseña** se mandan con [Resend](https://resend.com).
La API funciona sin correo configurado: si falta `RESEND_API_KEY`, no se envía nada y en desarrollo el enlace sale en la consola.

| Variable | Para qué |
|---|---|
| `RESEND_API_KEY` | Llave de Resend (Dashboard → API Keys). Sin ella no se envían correos. |
| `REDIS_URL` | Redis para la cola de correos masivos (BullMQ), por ejemplo `redis://default:clave@host:6379`. Opcional: sin ella el envío masivo se procesa en segundo plano en el mismo proceso. |
| `CORREO_REMITENTE` | Correo que aparece como remitente. **Su dominio debe estar verificado en Resend** (Domains). Por defecto `no-responder@jslogistics.pro`. |
| `CORREO_NOMBRE` | Nombre visible del remitente. Por defecto `JS Logistics`. |
| `CORREO_LOGO_URL` | URL absoluta del logo del encabezado. Por defecto `https://app.jslogistics.pro/logo.png`. Usa PNG: Outlook 2016 no muestra WebP. |
| `CORREO_RESPUESTA` | Correo de respuesta (opcional). |
| `URL_CLIENTES` | Portal de clientes, para armar los enlaces. En producción: `https://jslogistics.pro`. |
| `URL_EQUIPO` | App de oficina y mensajeros. En producción: `https://app.jslogistics.pro`. |
| `ENLACE_CLAVE_MINUTOS` | Vigencia del enlace de contraseña (60 por defecto). |
| `ENLACE_ACTIVACION_DIAS` | Vigencia del enlace de activación (7 por defecto). |

Cómo funciona:

- La plantilla está en `helpers/correo.js`: tablas con estilos inline, logo desde `CORREO_LOGO_URL` (PNG por Outlook) y enlace alternativo con `word-break: break-all`.
- El token es aleatorio (32 bytes) y **solo se guarda su hash SHA-256** en la tabla `enlaces`; el token en claro viaja únicamente en el correo.
- El **envío masivo** de restablecimientos entra a `resetEmailQueue` (BullMQ) y lo procesa un worker con concurrencia 5 y 3 intentos con espera exponencial. El mismo worker usa los enlaces de un solo uso de arriba; si Redis no está configurado o no responde, el lote se procesa en segundo plano en el proceso de la API para que la petición nunca se bloquee.
- Al arrancar, `index.js` llama a `validarRedis()` (PING a `REDIS_URL`): si responde, deja la cola activa; si no está configurado o no contesta, avisa en el log y el envío masivo usa el respaldo en memoria. La API siempre arranca.
- Cada enlace sirve una sola vez y, al usarlo, se cierran las sesiones abiertas de la cuenta.
- Los enlaces de clientes apuntan a `URL_CLIENTES`; los de trabajadores, a `URL_EQUIPO`. Los dos portales deben tener las pantallas `/activar` y `/restablecer` (se implementan en cada frontend).
- `POST /auth/recuperar` responde siempre `204`, exista o no el correo, para no revelar qué cuentas existen.
- Al crear una cuenta desde Accesos, la contraseña es opcional: sin ella la cuenta queda pendiente y se manda la activación. Si el correo falla, la cuenta igual se crea y administración puede reenviarlo.
- En producción, agregar estas variables en Render y volver a desplegar. La tabla se crea con `npm run db:migrar`.

**Para desarrollo sin verificar el dominio:** usa `CORREO_REMITENTE=onboarding@resend.dev`. Resend acepta ese remitente de pruebas, pero **solo envía al correo con el que creaste la cuenta de Resend**. Si el envío falla, el backend igual responde `204` y, en `development`, deja el enlace en la consola con `[correo] Enlace de …`; también sirve dejar `RESEND_API_KEY` vacío.

## Chatbot de clientes (Claude)

Asistente para el portal de clientes. Usa la API de Anthropic con llamadas a herramientas directas (`servicios/chatbot.js`), sin frameworks de agentes.

- **Llave y modelo:** `ANTHROPIC_API_KEY` (se crea en [console.anthropic.com](https://console.anthropic.com), nunca va al repositorio) y `CHATBOT_MODELO` (por defecto `claude-haiku-5-5`). Cambiar de modelo es cambiar esa variable. Todas las variables `CHATBOT_*` están en `.env.example`.
- **Información de la empresa:** `chatbot/informacion-empresa.md` (horarios, proceso de envío, políticas). Lo edita administración y se carga en el prompt con caché (`cache_control`), así que cuesta poco por mensaje. Los textos entre corchetes son ejemplos: **hay que reemplazarlos por los datos reales antes de activar el chat**. Si algo no está en el archivo, el asistente no lo inventa y deriva a WhatsApp.
- **Herramientas:** `consultar_pedido` (por guía), `listar_mis_pedidos` y `derivar_a_persona`. Ninguna recibe un cliente: la identidad sale siempre de la sesión (`req.usuario.clienteId`), así que un cliente solo puede ver sus pedidos aunque el modelo (o una instrucción metida en el chat) pida otra guía. Solo se devuelven los campos que el cliente ya ve en su portal.
- **Derivación a una persona:** `CHATBOT_WHATSAPP` arma el enlace `wa.me`. Se deriva cuando el modelo no sabe, cuando el cliente pide un cambio o reclamo, y cuando algo falla (sin llave, Anthropic caído, rechazo del modelo): el error llega con `detalle.derivar` y nunca con el mensaje técnico.
- **Límites:** por cuenta de cliente (no por IP): `CHATBOT_LIMITE_MINUTO` (8) y `CHATBOT_LIMITE_DIA` (100). Responden 429 con `CHAT_DEMASIADO_RAPIDO` o `CHAT_LIMITE_DIARIO`.
- **Sin estado:** el navegador guarda la conversación y la manda completa (máximo 20 mensajes de 2000 caracteres); el servidor no guarda nada.

## Endpoints (todos bajo `/api`)

Errores: `{ "error": { "code", "message", "campos"? } }`. JSON en camelCase, dinero en pesos enteros, fechas ISO.

| Método y ruta | Quién | Qué hace |
|---|---|---|
| `GET /health`, `GET /ready` | público | Vivo / listo (revisa la base) |
| `POST /auth/ingresar` | público | Inicia sesión (cookie) |
| `POST /auth/salir` | público | Borra la cookie |
| `POST /auth/salir-de-todo` | con sesión | Cierra la sesión en todos los dispositivos |
| `GET /auth/yo` | con sesión | `{ usuario: { id, email, nombre, rol, clienteId, mensajeroId } }` |
| `POST /auth/clave` | con sesión | Cambia la propia contraseña |
| `POST /auth/recuperar` | público | `{ email }`: manda un enlace de activación o de contraseña. Responde siempre `204` |
| `POST /auth/send-reset-email` | admin | `{ usuarioId }` o `{ email }`: manda a esa cuenta el enlace de restablecimiento con Resend. Responde `{ enviado, email }`; 404 si la cuenta no existe, 409 si está inactiva y 502/503 si el correo falla |
| `POST /auth/send-bulk-reset-emails` | admin | `{ emails: string[] }` (1 a 100, sin repetidos): encola los enlaces en `resetEmailQueue` (BullMQ/Redis) y responde **202** `{ mensaje, total, modo }`. Sin `REDIS_URL` o si Redis no responde, el lote se procesa en segundo plano en el mismo proceso |
| `GET /auth/enlace/:token` | público | Revisa el enlace: `{ enlace: { tipo, nombre, email (tapado), expira } }` |
| `POST /auth/restablecer` | público | `{ token, clave }`: cambia la contraseña con el enlace del correo |
| `POST /auth/activar` | público | `{ token, clave }`: crea la contraseña de una cuenta nueva |
| `POST /auth/activate-account` | público | `{ token, newPassword }`: alias de la activación con los nombres de la API nueva; consume el mismo enlace |
| `GET/POST /usuarios`, `PATCH/DELETE /usuarios/:id`, `PUT /usuarios/:id/clave` | admin | Accesos a la app. `POST /usuarios` acepta `{ role, entityId, email }` (el nombre sale de la ficha de Personal o del cliente) o la forma antigua con `nombre` y vínculos; `clave` es opcional y sin ella manda la activación. Responde `201 { message, usuario, user: { id, nombre, email, telefono, activationUrl, status }, correo }` |
| `POST /usuarios/:id/activacion`, `POST /usuarios/:id/recuperacion` | admin | Reenvía la activación o manda el enlace de contraseña |
| `GET /usuarios/pagina?buscar=&rol=&pagina=&porPagina=` | admin | Página de la sub-pestaña Acceso de Personal: `buscar` filtra por nombre o correo (sin tildes) y `rol` por `mensajero`, `asistente`, `cliente` o `admin`. Ordenada por nombre y correo. Devuelve `{ usuarios, pagina, porPagina, total, paginas }`. La app usa 5 en celular y 10 en computador; si la página ya no existe, responde la última |
| `GET /clientes?buscar=` | oficina | Lista y busca |
| `GET /clientes/:id` | oficina, o el propio cliente | Ficha |
| `POST /clientes`, `PATCH /clientes/:id` | oficina | Crea (avisa de repetidos con 409 `POSIBLE_REPETIDO`) y edita |
| `GET /clientes/:id/movimientos?desde=&hasta=` | oficina, o el propio cliente | `{ movimientos: [{ id, clienteId, tipo, valor, medio, nota, fecha, … }] }` |
| `DELETE /clientes/:id` | admin | Borra (a la papelera) si no tiene pedidos ni movimientos |
| `GET /mensajeros`, `GET /mensajeros/:id` | oficina; el mensajero solo su ficha | Personal |
| `GET /mensajeros/pagina?buscar=&tipo=&pagina=&porPagina=` | oficina | Personal JS paginado (7 en escritorio, 4 en celular). Devuelve `{ mensajeros, pagina, porPagina, total, paginas }` |
| `POST/PATCH/DELETE /mensajeros…` | admin | Cambia el personal. `PATCH /mensajeros/:id` acepta `nombre`, `telefono`, `tipo` (`mensajero`, `dueno`, `oficina`, `patinador`, `empresa`), `tarifa` (pago por día, entero ≥ 0) y `activo`; responde `{ mensajero }` o 404 si el id no existe |
| `POST /chatbot/mensajes` | cliente | `{ mensajes: [{ rol: "user"\|"assistant", contenido }] }` (termina en `user`). Con `Accept: text/event-stream` responde en streaming (SSE): `event: texto` `{ texto }` por fragmento, `event: derivar` `{ canal: "whatsapp", numero, url }` si hay que pasar a una persona, `event: fin`, o `event: error` `{ code, message, derivar }`. Sin ese `Accept` responde `{ respuesta, derivar }`. Errores: 400, 403 (no es cliente), 429 (`CHAT_DEMASIADO_RAPIDO`, `CHAT_LIMITE_DIARIO`), 503 (`CHATBOT_NO_CONFIGURADO`, `CHATBOT_NO_DISPONIBLE`, con `detalle.derivar`) |
| `GET /pedidos?estado=&cerrados=&desde=&hasta=&entregadoDesde=&entregadoHasta=&buscar=&conDiferencia=&diferencia=&sinRemitente=&cambioPendiente=&sinServicio=&dia=&cursor=` | cada rol ve lo suyo | Lista por cursor: `{ pedidos, siguiente }` (`siguiente` es el cursor, o `null`). `buscar` mira guía, quien recibió, remitente y mensajero. `diferencia`: `todas` o `sinRevisar` (igual a `conDiferencia=true`). `dia=AAAA-MM-DD`: salió, se entregó o se devolvió ese día en hora de Colombia |
| `GET /pedidos?pagina=&porPagina=&…` | cada rol ve lo suyo | **Paginador**, con los mismos filtros: `{ pedidos, pagina, porPagina, total, paginas }`. `porPagina` de 1 a 100 (20 por defecto; las pantallas usan 8 en el celular y 20 en el computador). Si la página ya no existe, responde la última y lo dice en `pagina`. No se mezcla con `cursor` (400) |
| `GET /pedidos/:guia` | quien la puede ver | Detalle con intentos. Lista y detalle traen `mini`: URL firmada de la miniatura, o `null` |
| `GET /pedidos/:guia/archivos` | quien la puede ver | `{ archivos: [{ tipo, url, creado }] }` con URL firmadas de Storage que vencen en 1 hora (las `previa` solo para oficina) |
| `POST /pedidos/:guia/archivos/:tipo` | oficina (cualquiera); mensajero (las suyas, en ruta o dentro de 24 horas) | Cuerpo **binario** de la imagen con `Content-Type: image/jpeg`, `image/png` o `image/webp`, máximo 1 MB. `tipo`: `salida`, `mini`, `entrega` o `firma`. El servidor revisa los bytes (`415 NO_ES_IMAGEN`), pone el nombre en el bucket y registra el historial. Responde `201 { archivo: { tipo, url, creado } }`. Sin Storage configurado: `503 FOTOS_NO_CONFIGURADAS`. La vigente de cada tipo es la más reciente |
| `POST /pedidos` | equipo | Crea la guía con el siguiente consecutivo. El mensajero la crea a su nombre y en cero |
| `PATCH /pedidos/:guia` | oficina | Remitente, valores, domicilio pagado. Lo cobrado solo lo corrige admin |
| `POST /pedidos/:guia/entrega` | su mensajero u oficina | Entrega. El servidor calcula `difCobro` |
| `POST /pedidos/:guia/no-entregado` | su mensajero u oficina | `reprogramar` anota el intento; otro motivo la devuelve |
| `PATCH /pedidos/:guia/correccion` | su mensajero | Corrige durante 24 horas |
| `POST /pedidos/:guia/cambio-recibido` | el cliente u oficina | Confirma la prenda de cambio |
| `DELETE /pedidos/:guia` | admin | Borra (a la papelera) |

## Endpoints de dinero, sueldos e historial

Las reglas son las de `app/js/app.js` (están en `servicios/`), y los cálculos se prueban contra la app en `test/equivalencia.test.js`.
Lo que el servidor puede calcular **no se recibe**: totales de una liquidación, lo esperado en un arqueo, la diferencia de cobro, la hora.
Lo ya contado en un arqueo no se cambia: responde `409 YA_CONTADO` con el texto para mostrar.

| Método y ruta | Quién | Qué hace |
|---|---|---|
| `POST /pedidos/:guia/reabrir` | admin | Vuelve a "por entregar". La foto y la firma pasan a `previa` |
| `POST /pedidos/en-bloque` | oficina | `{ modo: "sin", guias, clienteId, valorServicio? }` pone remitente; `{ modo: "serv", guias, valorServicio?, usarTarifaCliente }` pone el domicilio |
| `POST/DELETE /pedidos/:guia/pago-domicilio` | oficina | `{ medio, valor }`: el cliente pagó el domicilio aparte |
| `POST /pedidos/:guia/diferencia-revisada` | oficina | Marca revisada la diferencia de cobro |
| `GET /movimientos` | oficina | `{ movimientos }` de todos los clientes |
| `GET /movimientos/pagina?buscar=&tipo=&desde=&hasta=&pagina=&porPagina=` | oficina | Página de la pestaña Movimientos de Cuentas: solo los tipos de oficina. `tipo`: `todos`, `pagos` (recibidos y pagados), `compras` o `ganancias`; fechas `AAAA-MM-DD`. Devuelve `{ movimientos, pagina, porPagina, total, paginas, totales: { recibido, pagado, compras, ganancia } }`. La app usa 6 en celular y 15 en computador |
| `GET /movimientos/ganancias?buscar=&desde=&hasta=&pagina=&porPagina=` | oficina | Pestaña Ganancias de Cuentas: por cliente `{ clienteId, nombre, recibido, compras, ganancia }` ordenado por ganancia. Devuelve `{ clientes, pagina, porPagina, total, paginas, totalGanancia }` |
| `POST /movimientos` | oficina (el asistente: pagos, compras y ganancias) | `{ clienteId, tipo, valor, medio, nota, dia? \| fecha? }`. El pago del asistente queda con la hora del momento |
| `PATCH /movimientos/:id` | `{ medio }`: el asistente, lo suyo en 24 h; lo demás: admin | Cambia el medio (queda `medioAntes`) o edita |
| `DELETE /movimientos/:id` | oficina | Quita un pago (si ya se contó, registra el reverso) |
| `POST /movimientos/reversar` | oficina | `{ ids }` reversa varios pagos |
| `GET /clientes/saldos?dia=&buscar=&filtro=&pagina=&porPagina=` | oficina | Clientes con su saldo. `filtro`: `todos`, `cobrar` o `pagar`. Con `pagina`/`porPagina` devuelve una página (`{ clientes, pagina, porPagina, total, paginas, totalClientes, porCobrar, porPagar, repetidos? }`); sin ellos, la lista completa. La app usa 8 en celular y 20 en computador |
| `GET /clientes/:id/cuenta` | oficina, o el propio cliente | `{ cliente, saldo, filas, enRuta }` |
| `GET /clientes/cuadre?dia=&clienteId=` | oficina | Recibos de cuadre del día |
| `GET /clientes/repetidos` | admin | Grupos de clientes parecidos |
| `POST /clientes/:id/unir` | admin | `{ otros }`: pasa pedidos, movimientos y cuentas a `:id` y borra los otros |
| `POST /clientes/pagar-saldos` | oficina | `{ clienteIds, medio }`: paga el saldo a favor de cada uno (sin pagar dos veces) |
| `GET /recaudos` | equipo (el mensajero, lo suyo) | `{ recaudos }` |
| `POST /recaudos` | oficina | `{ mensajeroId, valor, medio, nota }` → `{ recaudo, debe }` |
| `PATCH /recaudos/:id` | `{ medio }`: el asistente, lo suyo; lo demás: admin | Cambia el medio o corrige |
| `DELETE /recaudos/:id` | admin | Quita |
| `GET /mensajeros/resumen` | oficina | Período abierto de cada repartidor |
| `GET /mensajeros/:id/periodo` | oficina; el mensajero, el suyo | `{ periodo: { debe, efectivo, base, gastos, recibido, entregas, … } }` |
| `GET /liquidaciones` | equipo (el mensajero, las suyas) | `{ liquidaciones }` |
| `GET /liquidaciones/pagina?dia=&estado=&buscar=&pagina=&porPagina=` | admin | Cierres recientes filtrados por día (`AAAA-MM-DD`), estado (`todos`, `cobrar`, `favor`, `paz`) y nombre del mensajero. Devuelve `{ liquidaciones, pagina, porPagina, total, paginas }`; la app usa 9 en computador y 5 en celular |
| `POST /liquidaciones` | admin | `{ mensajeroId, entregaFinal, medio, pasarAdelanto?, semana? }` (también acepta `adelanto` y `semanaAdelanto` de la app interna). El servidor calcula todo. → `{ liquidacion, adelanto, queda }` |
| `DELETE /liquidaciones/:id` | admin | Reabre la última: borra la liquidación y su adelanto; el dinero recibido queda |
| `PATCH /liquidaciones/:id` | admin | Solo compatibilidad: `{ debe, adelanto: 0 }` antes de quitar su adelanto. No cambia nada |
| `GET /caja/resumen`, `/caja/libro?dia=`, `/caja/cierre-del-dia` | admin | Caja general, libro y lo que falta para cerrar el día |
| `GET /caja/corte` | oficina | `{ corte }`: hora del último arqueo (lo de antes ya está contado) |
| `GET /caja/movimientos` | equipo (cada rol, lo suyo) | `{ movimientos }` de caja |
| `GET /caja/movimientos/pagina?dia=&medio=&pagina=&porPagina=` | oficina | Movimientos de las cuentas internas (`cat: "interna"`), filtrados por día (`AAAA-MM-DD`) y medio (`efectivo`, `nequi`, `bancolombia`). Devuelve `{ movimientos, pagina, porPagina, total, paginas }`. La app usa 5 en celular y 10 en computador |
| `POST /caja/movimientos` | oficina | Según `cat`: `interna` (cuenta interna), `devolucion` con `adelantoId`, `oficina`/`sobrante` (piezas del cierre de una caja de oficina), `base` del asistente, o una entrada o salida de admin (`gasto`, `base`, `arriendo`, `adelanto`, `sueldo`, `otro`, `otro_entra`) |
| `PATCH /caja/movimientos/:id` | admin | Solo `{ devuelto }` de un adelanto, cuando coincide con lo que calcula el servidor (compatibilidad) |
| `DELETE /caja/movimientos/:id` | admin | Quita (un adelanto de liquidación devuelve la deuda; una devolución resta de `devuelto`) |
| `POST /caja/bases` | oficina | `{ mensajeroId, valor, concepto }`: base para vueltos desde la caja de oficina |
| `GET /caja/oficinas?dia=`, `GET /caja/oficinas/:uid?dia=` | admin; el asistente, la suya | Cajas de oficina |
| `POST /caja/oficinas/:uid/base`, `POST /caja/oficinas/:uid/cierre` | admin | Base para un asistente y cierre (`{ efectivo, nequi, bancolombia, nota }`, con sobrante y ajuste) |
| `GET /caja/arqueo/esperado`, `GET /caja/arqueos` | admin | Lo esperado por medio y los arqueos hechos |
| `POST /caja/arqueos` | admin | `{ contado: { efectivo, nequi, bancolombia }, nota }`. Lo esperado lo calcula el servidor (si llega, se ignora) |
| `DELETE /caja/arqueos/:id` | admin | Deshace el último arqueo |
| `POST /caja/adelantos/:id/devolucion`, `DELETE /caja/adelantos/:id` | admin | Devolución (todo o parte) y quitar un adelanto |
| `GET /cuentas`, `POST /cuentas`, `POST /cuentas/iniciales`, `POST /cuentas/:id/movimientos` | oficina (crear: admin) | Cuentas internas con su saldo |
| `GET /jornadas` | equipo (cada quien, lo suyo) | Días de pago fijo |
| `PUT /jornadas/:id`, `DELETE /jornadas/:id` | admin | `{ personaId, dia, valor, previo? }`. El ID lo arma el servidor |
| `GET /sueldos/semana?semana=` | admin | Planilla de la semana |
| `GET /sueldos/mensajeros/:id?semana=` | admin; el mensajero, el suyo | "Mi sueldo" |
| `GET /historial?desde=&buscar=&pagina=&porPagina=` | equipo (admin todo; los demás, lo suyo) | Página del historial. Devuelve `{ cambios: [{ id, fecha, quien, op, col, docId, resumen }], pagina, porPagina, total, paginas }`; la app usa 5 en celular y 13 en computador. Sin `pagina`/`porPagina` mantiene el tope antiguo (`limite`, 600) |
| `POST /historial` | equipo | `{ texto }`: anota algo (por ejemplo, "Envió saldo por WhatsApp") |
| `GET /papelera`, `POST /papelera/:id/restaurar`, `DELETE /papelera/:id`, `DELETE /papelera` | admin | Papelera. Un pedido vuelve con sus intentos y sus fotos |
| `GET /respaldo/exportar`, `GET /respaldo/espacio` | admin | Copia en JSON y espacio usado |
| `GET /sincronizar` | con sesión | `{ datos: { coleccion: { id: documento } }, corte }` con lo que ese rol puede ver |
| `GET /eventos` | con sesión | Server-Sent Events: `event: cambio` con `{ cols }` cuando algo cambia |

## Pendiente

- `Idempotency-Key` en las escrituras que reenvía la cola sin señal del mensajero.
- Que la app interna use las rutas de una sola acción (cierre de caja de oficina, devolución y quitar adelanto) en vez de las piezas de compatibilidad.
- En los dos frontends: pantallas `/activar` y `/restablecer`, y en Accesos el botón para enviar el enlace en vez de escribir una contraseña.
