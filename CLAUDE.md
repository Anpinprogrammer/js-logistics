# JS Logistics: guía para agentes de IA

Lee este archivo completo antes de cambiar algo. Después lee el `CLAUDE.md` de la carpeta en la que vayas a trabajar (`backend/` o `frontend/`). Si algo de aquí choca con lo que pide la persona, pregúntale antes de seguir.

## Qué es

App de JS Logistics, una empresa de mensajería en Cali. Maneja guías (pedidos) y entregas, clientes y sus saldos, la caja, las liquidaciones de los mensajeros, los sueldos y el historial de cambios. Los usuarios son administración, asistentes de oficina, mensajeros (casi siempre desde el celular, en la calle) y clientes.

## Dos sistemas en el mismo repositorio

| | Sistema **nuevo** (aquí se trabaja) | Sistema **viejo** (en producción hasta el cambio) |
|---|---|---|
| Carpetas | `backend/`, `frontend/` | `app/`, `original/`, `firestore.rules`, `firebase.json`, `.firebaserc`, `firestore.indexes.json`, `iniciar-local.command` |
| Stack | Node.js + Express 5 (MVC) + PostgreSQL (Supabase) · React 19 + TypeScript + Tailwind 4 + axios | HTML/JS sin framework + Firebase (Firestore, Auth, Hosting) |
| Despliegue | Render (API) y Render o Vercel (frontends) | Firebase Hosting `js-logistics-299ce` |

Reglas sobre el sistema viejo:
- **No lo borres ni lo muevas.** Sigue en producción hasta que el nuevo lo reemplace y los saldos cuadren. Se quitará en un PR aparte, ese día.
- **No le agregues funciones.** Todo lo nuevo va en `backend/` y `frontend/`. Solo se toca para corregir algo urgente en producción, y siempre por pedido explícito.
- `app/js/app.js` es **la referencia de las reglas de negocio** (saldos, caja, arqueos, liquidaciones, sueldos). Al pasar un cálculo al backend, cópialo con el mismo comportamiento y pruébalo.
- Los skills `/publicar` y `/auditar` de `.claude/skills/` son del sistema viejo: publican en Firebase y hacen push directo a `main`. **No los uses para el sistema nuevo.**

El portal de **clientes** es otro repositorio: `jslogistics-cliente-frontend`. Sigue las mismas convenciones y usa la misma API. `frontend/` de este repo es solo para la oficina y los mensajeros.

## Arquitectura nueva

```
 jslogistics.pro ───────────┐                       ┌──────────────────────────────┐
 (portal de clientes)        │  /api/* (reescritura   │ backend/ (Render)            │
                             ├─ en el mismo sitio) ──▶│ Express 5, MVC, JWT en cookie│──▶ PostgreSQL (Supabase)
 admin|app.jslogistics.pro ──┘                       │ toda la autorización y los   │──▶ Supabase Storage (fotos)
 (frontend/: oficina y mensajeros)                   │ cálculos de dinero           │
                                                     └──────────────────────────────┘
```

- **El servidor decide.** Permisos por rol, validación, consecutivos y cálculos de dinero van en el backend. El frontend solo muestra y pide; nunca le mandes al servidor un valor que él puede calcular (por ejemplo, `difCobro`).
- **Sesión:** JWT en una cookie `HttpOnly` que pone el backend. Ningún frontend guarda tokens en `localStorage` ni en JavaScript.
- **Mismo sitio:** cada frontend llama a `/api` en su propio dominio, y una regla de reescritura lo manda al backend. Así la cookie funciona con `SameSite=Lax`, también en Safari de iPhone.
- **CSRF:** toda petición que no sea GET lleva la cabecera `X-JSL: 1`.
- **Contrato de la API:** está en [`backend/README.md`](backend/README.md). Si un frontend necesita algo nuevo, primero se agrega en el backend (con prueba) y se documenta ahí; después se usa.

## Convenciones de todo el proyecto

- **Idioma:** español en el código del dominio (nombres de archivos, funciones, variables, rutas y campos: `pedidos`, `crearPedido`, `valorCobrado`), en los comentarios, en los textos para el usuario, en los commits y en los PR. Los términos técnicos estándar (`router`, `middleware`, `query`) se dejan como son.
- **Textos para el usuario:** español de Colombia, sencillo y concreto, de tú. Los errores dicen qué pasó y qué hacer ("Ya pasaron 24 horas: pídele a administración que lo corrija"), nunca un código técnico.
- **Dinero:** pesos colombianos (COP) como **enteros**, sin decimales, en la base, en la API y en el frontend. Se muestran con `Intl.NumberFormat("es-CO", { currency: "COP" })`.
- **Fechas:** `TIMESTAMPTZ` en la base e ISO 8601 en la API. Los "días" del negocio son de **Colombia** (`America/Bogota`, UTC−5, sin horario de verano).
- **Medios de pago:** `efectivo | nequi | bancolombia`. **Roles:** `admin | asistente | mensajero | cliente`. Los dos valores los define el backend (`helpers/negocio.js`); no inventes otros.
- **JSON** en camelCase y **base de datos** en snake_case. La conversión la hacen los modelos.
- **Errores de la API:** `{ "error": { "code", "message", "campos"? } }`.
- **Datos reales del negocio** (clientes, teléfonos, fotos, respaldos) **nunca van al repositorio**. Para probar se usa `npm run db:demo` en una base vacía.
- **Secretos** solo en variables de entorno (`.env`, que no se sube). `.env.example` lista todas las variables, sin valores reales.

## Flujo de trabajo

1. Una rama por cambio, a partir de `main`: `feat/…`, `fix/…`, `docs/…`, `refactor/…`.
2. Commits pequeños, en español, que digan qué cambió para el negocio. Por ejemplo: `Backend: entregas con foto y firma en Supabase Storage`.
3. Antes de abrir el PR, corre las revisiones de lo que tocaste (abajo) y di en el PR cómo lo probaste.
4. PR contra `main`. **Nunca hagas push directo a `main`**, ni force-push sobre una rama ajena.
5. Si cambias la API, actualiza en el mismo PR `backend/README.md` y los tipos de `frontend/src/api/tipos.ts`, y avisa en el PR que el portal de clientes podría necesitar el mismo cambio.

## Revisiones antes de un PR

```bash
# Backend (necesita un Postgres de pruebas; las pruebas VACÍAN esa base)
cd backend && TEST_DATABASE_URL=postgresql://…/jsl_test npm test

# Frontend
cd frontend && npm run typecheck && npm run build
```

Nunca apuntes `TEST_DATABASE_URL` ni `db:demo` a la base de producción.

## Dónde está cada cosa

- [`backend/CLAUDE.md`](backend/CLAUDE.md): cómo se escribe el backend y cómo agregar un endpoint.
- [`frontend/CLAUDE.md`](frontend/CLAUDE.md): cómo se escribe el frontend y cómo agregar una pantalla.
- [`backend/README.md`](backend/README.md): instalación, Supabase, Render y la tabla de endpoints.
- [`frontend/README.md`](frontend/README.md): instalación y despliegue del frontend.
- [`backend/db/schema.sql`](backend/db/schema.sql): el esquema de datos real.
- [`docs/datos.md`](docs/datos.md) y [`ARCHITECTURE.md`](ARCHITECTURE.md): el sistema viejo (Firestore) y el diagnóstico que llevó a la migración.

## Qué falta (para no duplicar trabajo)

- Backend: subir fotos y firmas a Storage; movimientos de clientes (crear), recaudos, caja, arqueos, cajas de oficina, liquidaciones, sueldos y cuentas internas, con sus saldos calculados en el servidor; bloqueo de lo ya contado en un arqueo; `Idempotency-Key` para la cola sin señal; tiempo real con SSE; script de migración de Firestore a Postgres.
- Frontend: pantalla de Caja; fotos y firma en la entrega; funcionamiento sin señal para el mensajero (PWA y cola).
