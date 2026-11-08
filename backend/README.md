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
├── controllers/          Reglas de cada caso de uso (quién puede qué, qué se calcula)
├── models/               Consultas SQL por tabla (sin lógica de permisos)
├── validators/           Esquemas de Zod de cada petición
├── helpers/              Utilidades: errores HTTP, JWT, cookies, contraseñas, IDs, SQL y reglas de negocio puras
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

## Pruebas

Usan una base **aparte**, que se vacía en cada corrida. Nunca apuntes `TEST_DATABASE_URL` a la base real.

```bash
createdb jsl_test
TEST_DATABASE_URL=postgresql://postgres@127.0.0.1:5432/jsl_test npm test
```

## Supabase

1. Crea el proyecto y copia la cadena de conexión: *Project Settings → Database → Connection string*. Desde Render conviene el **pooler** (Supavisor).
2. `DATABASE_SSL=true`. Para verificar el certificado, descarga el de *Database Settings → SSL* y ponlo en `DATABASE_CA`.
3. `npm run db:migrar`. El esquema activa **RLS sin políticas** en todas las tablas: así la Data API pública de Supabase (la anon key) no puede leer nada, y todo pasa por esta API.
4. **Storage:** crea un bucket **privado** llamado `pedidos` y pon `SUPABASE_URL` y `SUPABASE_SERVICE_ROLE_KEY` (*Project Settings → API*). La service role key es secreta: solo va en el backend, nunca en el frontend.
5. Usa un proyecto de Supabase para pruebas y otro para producción.

## Render

- Tipo **Web Service**, raíz `backend`, comando de build `npm ci`, comando de inicio `npm start`.
- Health check: `/api/ready`. Para un monitor externo que lo mantenga despierto, usa `/api/health`, que no toca la base.
- Variables: las de `.env.example`, con `NODE_ENV=production` y un `JWT_SECRET` nuevo y largo.
- El plan gratis se duerme a los 15 minutos sin tráfico y tarda en despertar; para los mensajeros en la calle conviene un plan pago.

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
| `GET/POST /usuarios`, `PATCH/DELETE /usuarios/:id`, `PUT /usuarios/:id/clave` | admin | Accesos a la app |
| `GET /clientes?buscar=` | oficina | Lista y busca |
| `GET /clientes/:id` | oficina, o el propio cliente | Ficha |
| `POST /clientes`, `PATCH /clientes/:id` | oficina | Crea (avisa de repetidos con 409 `POSIBLE_REPETIDO`) y edita |
| `GET /clientes/:id/movimientos?desde=&hasta=` | oficina, o el propio cliente | `{ movimientos: [{ id, clienteId, tipo, valor, medio, nota, fecha, … }] }` |
| `DELETE /clientes/:id` | admin | Borra (a la papelera) si no tiene pedidos ni movimientos |
| `GET /mensajeros`, `GET /mensajeros/:id` | oficina; el mensajero solo su ficha | Personal |
| `POST/PATCH/DELETE /mensajeros…` | admin | Cambia el personal |
| `GET /pedidos?estado=&cerrados=&desde=&hasta=&entregadoDesde=&entregadoHasta=&buscar=&conDiferencia=&cursor=` | cada rol ve lo suyo | Lista paginada (`siguiente` es el cursor) |
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

## Pendiente

- Movimientos de clientes, recaudos, caja, arqueos, cajas de oficina, liquidaciones, sueldos y cuentas internas, con los cálculos de `app/js/app.js` en `helpers/negocio.js` y pruebas que comparen contra la app actual.
- Bloquear cambios a lo ya contado en un arqueo (`ajustes.caja.corte`).
- `Idempotency-Key` en las escrituras que reenvía la cola sin señal del mensajero.
- Tiempo real con SSE (`GET /api/events`).


