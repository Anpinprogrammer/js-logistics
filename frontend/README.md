# Frontend de JS Logistics (oficina y mensajeros)

App de operación y administración en **React 19 + TypeScript + Tailwind CSS 4**, con **axios** contra el backend (`../backend`) y **SweetAlert2** para los avisos y confirmaciones. El portal de los clientes es otro proyecto (`jslogistics-cliente-frontend`): si una cuenta de cliente intenta entrar aquí, se le indica que use el portal.

## Qué hay

Con sesión, la app muestra **lo mismo que el prototipo** (`app/` del sistema viejo), con sus estilos, sus KPIs y sus pestañas, reescrito en React y TypeScript. El ingreso (`pages/Ingreso.tsx`) es el rediseño nuevo: siempre oscuro, con el logo en un badge claro (ver [`../docs/ESTADO.md`](../docs/ESTADO.md)). Desde el ingreso se puede pedir un enlace de recuperación (`/recuperar`), y los correos abren las pantallas públicas `/restablecer` y `/activar` (crear o cambiar la contraseña). En el header de escritorio, junto al avatar, hay un botón para cambiar entre modo claro y oscuro; en el celular, la misma opción está en el menú. La elección se guarda en el navegador.

| Rol | Pantallas |
|---|---|
| Mensajero (celular) | **Inicio** (KPIs, recomendaciones, efectividad, entregas por día, motivos, tus números), **Recepción** (Nuevo pedido con la foto; Recibir dinero de un cliente en la calle, que abona a su cuenta y suma a lo que el mensajero entrega), **Por entregar** (entregar con foto y firma, no entregado), **Mi caja**, **Mi sueldo**, **Entregados**. |
| Asistente | **Inicio** (panel de control), **Pedidos**, **Clientes** (saldos, WhatsApp, paginados de 8 en celular y 20 en computador), **Caja** (recibir dinero de mensajeros, su caja de oficina), **Cuentas** (pagos, compras y ganancias de clientes). |
| Administración | Todo lo anterior, más cierre del día, caja general y arqueos, liquidaciones, **Sueldos** y **Más** (Resultados, Personal y accesos, Historial, Papelera y Respaldo). En el escritorio, Resultados, Personal, Historial, Papelera y Respaldo son accesos directos del menú lateral; en el celular se abren desde el botón **Más** de la barra de abajo. Puede pasar a modo Mensajero. |

Los saldos, la caja y los sueldos se calculan en el navegador con las mismas reglas de `app/js/app.js` (en `src/interna/motor.ts`) mientras el backend no los calcule. Lo que todavía no está: tiquetes para imprimir, descargas de Excel y respaldo (llegan después).

### Lo que la app interna espera del backend

Si un endpoint todavía no existe (404 `RUTA_NO_ENCONTRADA`), la lectura se trata como vacía y las escrituras muestran "Esta función todavía no está lista en el servidor".

- `GET/POST/PATCH/DELETE /movimientos`, `/recaudos`, `/liquidaciones`, `/caja/movimientos`, `/cuentas`
- `PUT/DELETE /jornadas/:id` (pago por día y sueldo anterior, id `persona_dia` o `persona_previo_semana`)
- `POST /caja/arqueos` `{ contado, nota }` (lo esperado lo calcula el servidor), `DELETE /caja/arqueos/:id`, `GET /caja/corte` (fecha del último arqueo, para el asistente)
- `POST /caja/oficinas/:uid/cierre` `{ efectivo, nequi, bancolombia, nota }`, `POST /caja/adelantos/:id/devolucion` `{ valor, medio }`; `DELETE /caja/movimientos/:id` ya resta lo devuelto y devuelve la deuda a la liquidación
- `POST /liquidaciones` con `entregaFinal`, `medio`, `adelanto` y `semanaAdelanto`: registra también el dinero recibido y el adelanto de sueldo
- `POST /clientes/:id/unir` `{ otros }`, `POST /pedidos/:guia/reabrir`
- `GET /historial?desde=`, `GET /papelera`, `POST /papelera/:id/restaurar`, `DELETE /papelera/:id`
- Campos: `domiPagoFecha` y `domiPagoUid` en pedidos; `porUid` y `medioAntes` en movimientos y recaudos

## Estructura

```
src/
├── main.tsx            React Query, router y sesión
├── App.tsx             Ingreso o app interna
├── api/                cliente.ts (axios), servicios.ts (llamadas por recurso), tipos.ts
├── auth/Sesion.tsx     Sesión (/auth/yo, ingresar, salir; cuentas de prueba en modo demo)
├── pages/              Ingreso, Recuperar, Restablecer y AccesoComun (marco compartido del acceso); intro/ es la animación de entrada del ingreso
├── lib/                imagen.ts (comprimir fotos y firma), pantalla.ts (tamaños de página y corte de escritorio), perezoso.ts (carga diferida),
│                       alertasAdmin.ts y alertas.css (avisos y confirmaciones con SweetAlert2)
└── interna/            La app igual al prototipo
    ├── estilos.css     Copia de app/css/estilos.css dentro de .jsl (generada, no editar)
    ├── ajustes.css     Ajustes propios
    ├── motor.ts        Datos en memoria y reglas de negocio copiadas de app.js
    ├── datos.tsx       Carga desde la API (cada 45 s y al volver a la pestaña)
    ├── acciones.ts     Escrituras (con su versión en memoria para el modo demo)
    ├── demo.ts         Datos inventados para VITE_DEMO=true
    ├── ui.tsx          Ventana (`avisar` y `confirmar` con SweetAlert2), íconos, KPIs, dona, columnas, fotos, FiltroDia
    ├── Calendario.tsx  SelectorFecha (un día) y RangoFechas (un rango): el calendario de todos los filtros de fecha
    ├── Solicitudes.tsx Tarjeta, filtros y aviso automático de solicitudes de envío (campanita y pestaña)
    ├── estado.ts       Estado de la interfaz (`E`): pestañas, filtros y días elegidos
    ├── tema.ts         Tema claro/oscuro (`data-theme` en `.jsl`)
    ├── Marco.tsx       Menú lateral, barra y pestañas
    ├── mensajero/      Modo mensajero
    └── oficina/        Panel, Pedidos, Clientes, Caja, Cuentas, Sueldos, Más
```

Para volver a copiar los estilos si cambia el prototipo:

```bash
npx -p postcss -p postcss-prefix-selector node scripts/estilos-prototipo.mjs ../app/css/estilos.css src/interna/estilos.css
```

## Sesión y seguridad

- El backend pone la sesión en una cookie **HttpOnly**: el frontend nunca ve ni guarda el token.
- axios va con `withCredentials: true` y la cabecera `X-JSL: 1`, que el backend exige como protección CSRF.
- Si una petición responde 401 (sesión vencida, cerrada o con el rol cambiado), la app vuelve al ingreso.
- La API se llama en el **mismo sitio** (`/api`) para que la cookie funcione con `SameSite=Lax`, también en Safari de iPhone.

## Correr en local

```bash
# 1. Backend (otra terminal): ver ../backend/README.md
cd ../backend && npm run dev            # http://localhost:4000

# 2. Frontend
cd frontend
npm install
npm run dev                              # http://localhost:5173 (el proxy manda /api al backend)
```

Si `/api` da 403 o 404 raros, mira que el puerto 4000 sea de este backend (ver [`../backend/README.md`](../backend/README.md#si-el-frontend-recibe-403-o-404-raros)). Para usar otro puerto: `VITE_API_PROXY=http://localhost:4001 npm run dev`. Más trampas del entorno local en [`../docs/ESTADO.md`](../docs/ESTADO.md).

Para tener datos de prueba inventados, carga el demo en una base **vacía** de pruebas: `cd ../backend && npm run db:demo -- --si`. Las cuentas son `admin@demo.co`, `oficina@demo.co`, `carlos@demo.co` y `diana@demo.co`, todas con la contraseña `demo-js-2026`.

## Publicar (Vercel)

- **Root Directory:** `frontend`. Vercel detecta Vite: build `npm run build`, carpeta `dist`.
- **Variables de entorno** (están todas en [`.env.example`](.env.example)):
  - `VITE_API_URL` (**obligatoria**): la URL del backend, sin `/api` (se agrega solo). En producción: `https://api.jslogistics.pro`. Cada proyecto de Vercel (producción, demo) pone la de su backend: así el mismo código sirve para todos y `vercel.json` no cambia entre despliegues.
  - `VITE_DEMO`: `true` solo para una vista previa con datos inventados.
  - Las variables `VITE_*` se leen al construir: si cambias una en Vercel, vuelve a publicar (Deployments → ⋯ → Redeploy).
- **La API tiene que estar en un subdominio del mismo dominio de la app** (`app.jslogistics.pro` → `api.jslogistics.pro`). Son del mismo *sitio*, así que la cookie de sesión funciona con `SameSite=Lax`, también en Safari de iPhone. No uses la URL de `onrender.com` aquí: es otro sitio, Safari no guarda la cookie y todo da 401.
- `vercel.json` ya no reenvía `/api`: solo manda las rutas de React a `index.html` (para que no den 404 al recargar). Si falta `VITE_API_URL`, la app pide `/api/…` a su propio dominio y recibe 404; el build en Vercel avisa con `⚠️ Falta VITE_API_URL`.
- En el backend (Render):
  - `CORS_ORIGENES` debe incluir el origen exacto de la app (`https://app.jslogistics.pro`), separado por comas de los demás.
  - `COOKIE_DOMINIO` vacío y `COOKIE_SAMESITE=lax`.
  - `TRUST_PROXY=1` (solo Render delante del backend; `2` si además pasa por Cloudflare con proxy).
- El portal de clientes y la oficina usan la misma API, así que en un **mismo navegador** comparten la sesión: entrar al portal como cliente cierra la sesión de oficina en ese navegador, y al revés. En celulares y computadores de trabajo no pasa, porque cada persona usa una sola de las dos.

## Publicar (Render)

- **Static Site**: raíz `frontend`, build `npm ci && npm run build`, carpeta `dist`.
- **Reglas** (Redirects/Rewrites), en este orden:
  1. `/api/*` → `https://TU-BACKEND.onrender.com/api/*` (Rewrite). Así la API queda en el mismo sitio que la app.
  2. `/*` → `/index.html` (Rewrite), para que las rutas de React funcionen al recargar.
- En el backend: `CORS_ORIGENES=https://TU-FRONTEND.onrender.com` y `COOKIE_SAMESITE=lax`.

## Revisar antes de subir

```bash
npm run typecheck
npm run build
```
