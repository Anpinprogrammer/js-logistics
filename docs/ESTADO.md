# Estado del proyecto y memoria para agentes de IA

Este archivo es la **memoria compartida** entre sesiones y agentes. Léelo después de `CLAUDE.md` y antes de tocar nada. Si cambias algo que otro agente necesitaría saber (una decisión, una trampa, algo pendiente), **actualiza este archivo en el mismo PR**. Última revisión: 2026-11-09.

Los repositorios hermanos tienen el suyo: `jslogistics-cliente-frontend/docs/ESTADO.md`.

## Mapa rápido

| Pieza | Dónde | Puerto en local | Guía |
|---|---|---|---|
| API (Express 5 + Postgres/Supabase) | `backend/` | **4000** | [`backend/CLAUDE.md`](../backend/CLAUDE.md), [`backend/README.md`](../backend/README.md) (contrato de la API) |
| App de oficina y mensajeros | `frontend/` | **5173** | [`frontend/CLAUDE.md`](../frontend/CLAUDE.md), [`frontend/README.md`](../frontend/README.md) |
| Landing y portal de clientes | repo `jslogistics-cliente-frontend` | **3000** | su `AGENTS.md` |
| Sistema viejo (Firebase), sigue en producción | `app/`, `original/`, archivos de Firebase | — | `ARCHITECTURE.md`, `docs/datos.md` |

El orden de trabajo de siempre: backend primero (con prueba y documentado en `backend/README.md`), después los tipos y servicios del frontend, después la pantalla.

## Qué está hecho

- **Backend:** completo para lo que usan las apps: auth, usuarios, clientes, mensajeros, pedidos (con paginador), movimientos, recaudos, liquidaciones, caja (arqueos, oficinas, adelantos), cuentas, jornadas, sueldos, historial, papelera, tiempo real por SSE y correo con Resend (enlaces de activación y de contraseña). Todas las rutas registradas están en la tabla de `backend/README.md` (se comprobó que ninguna falta).
- **App de oficina y mensajeros (`frontend/`):** igual al prototipo viejo, reescrita en React (`src/interna/`), con carga diferida por pestaña. El ingreso (`pages/Ingreso.tsx`) es un rediseño aparte, en Tailwind.
- **Landing y portal de clientes:** rediseño oscuro de la portada (carrusel de fotos), del menú móvil y del login; dos portales (propuesta y clásico) con los mismos datos.

## Qué falta

Está en la sección "Qué falta" de [`CLAUDE.md`](../CLAUDE.md) (la fuente única; no la copies aquí). Resumen: `Idempotency-Key` para la cola sin señal, pasar los cálculos del navegador (`interna/motor.ts`) a los endpoints del backend, tiquetes, descargas de Excel, respaldo y PWA para el mensajero.

## Decisiones de diseño que no son obvias (no las deshagas sin preguntar)

1. **El logo `icono-96.webp` solo se ve sobre fondo claro.** Es un PNG/WebP transparente con el isotipo "JS" en azul oscuro y las letras "LOGISTICS CALI" en **blanco**. Sobre fondo oscuro el isotipo se pierde, y sobre un badge blanco las letras desaparecen. Solución usada en el ingreso de la oficina y, en el repo de clientes, en el login y el menú móvil: un **badge claro** (degradado blanco → `sky-100`, halo cian) y la imagen **recortada y agrandada** (`absolute left-[-10%] top-[3%] w-[120%] max-w-none` dentro de un contenedor `overflow-hidden`) para mostrar solo el isotipo. El texto "LOGISTICS · CALI" se escribe aparte como texto real. Copia ese patrón si necesitas el logo en otra pantalla.
2. **`pages/Ingreso.tsx` es siempre oscura y usa colores propios** (`#070B19`/`#0b0f19`, `#38bdf8`, `#0284c7`), a propósito: la regla de "usar solo tokens" de `frontend/CLAUDE.md` aplica a la app interna, no a esta pantalla. Fondo: malla animada, rutas SVG con nodos que pulsan y esferas de luz; las animaciones (`jsl-*`) están en `src/index.css` y se apagan con `prefers-reduced-motion`.
3. **"Recordar mi sesión" no existe.** La sesión es una cookie `HttpOnly` que decide el backend; el frontend no puede alargarla. No pongas una casilla que prometa eso. Tampoco hay flujo de "olvidé mi contraseña": administración asigna una nueva (así lo dice el texto de la pantalla).
4. **Sin desbordes laterales en móvil.** Dos causas reales ya corregidas: (a) un `grid` sin columna base se ensancha al contenido más largo: usa `grid grid-cols-1 md:grid-cols-N`; (b) correos y nombres largos en flex: `min-w-0` y `[overflow-wrap:anywhere]`. `html { overflow-x: clip }` es solo red de seguridad, no sustituye arreglar la causa.
5. **Los enlaces de correo son de un solo uso y se guardan hasheados.** En la tabla `enlaces` queda el SHA-256 del token, nunca el token en claro. La contraseña vence en 60 minutos y la activación en 7 días; al usarlos se cierran las sesiones abiertas. Los clientes reciben enlaces a `URL_CLIENTES` y los trabajadores a `URL_EQUIPO`. Sin `RESEND_API_KEY` la API funciona, pero no manda correos (en desarrollo el enlace sale en la consola). Para probar sin verificar el dominio, `CORREO_REMITENTE=onboarding@resend.dev`: Resend solo deja enviar así al correo de la cuenta de Resend. Si el envío falla en desarrollo, el enlace también queda en la consola.
6. **Las pantallas de acceso comparten el marco del ingreso.** `frontend/src/pages/AccesoComun.tsx` tiene el fondo, la tarjeta, los íconos y los campos con las mismas clases del ingreso; `Recuperar.tsx` y `Restablecer.tsx` lo reutilizan. No se cambió el diseño: si hay que ajustar algo visual, se hace en `AccesoComun.tsx` para las tres pantallas.
7. **La plantilla de correo es de tablas y estilos inline.** Está en `backend/helpers/correo.js` para que se vea igual en Gmail, Outlook 2016+, Apple Mail y Yahoo. El logo va por `CORREO_LOGO_URL` en PNG (Outlook no muestra WebP) y el enlace alternativo usa `word-break: break-all`. Si se cambia el diseño, mantener esa estructura: Outlook no soporta flexbox ni grid.
8. **El tema de la app interna se controla con `data-theme` en `.jsl`.** `interna/tema.ts` guarda la elección en `localStorage` (`js_tema`) y pone `data-theme="light"` o `"dark"` en el contenedor `.jsl`; sin atributo sigue la preferencia del sistema. El botón está en el header de escritorio, junto al avatar, y en el menú del celular. No lo pongas en `<html>`: `estilos.css` está encapsulado en `.jsl`.
9. **En pantallas XL (≥ 1280 px) el contenido ocupa todo el ancho a la derecha del menú lateral.** El `main` del prototipo tiene `max-width: 1240px`; en `ajustes.css` se anula desde 1280 px para que no quede un hueco a la derecha en monitores grandes. No lo devuelvas a 1240 px sin revisar cómo se ven Panel y Pedidos en un monitor ancho.
10. **En el escritorio no existe la pestaña "Más".** Sus sub-pestañas (Resultados, Personal, Historial, Papelera y Respaldo) son accesos directos del menú lateral en el grupo Administración, y la vista ya no muestra sus chips; en el celular todo sigue dentro de **Más** con los chips. La clave del acceso es la misma de `E.subMas` y `E.tabA` sigue siendo `"mas"`, así el estado activo no se pierde al cambiar de tamaño. El corte es 960 px (`useEscritorio()`); no dupliques la lógica en cada pantalla.
11. **Clientes separa acciones de filtros.** Debajo de los KPIs va una barra de acciones alineada a la derecha (secundaria "Enviar saldos por WhatsApp" y primaria "Registrar cliente"), y justo encima de la tabla una sola toolbar con la búsqueda a la izquierda y, a la derecha, el control segmentado de estado (`.seg`) y el filtro de día compacto (`<FiltroDia compacto>`). En el celular la toolbar se apila: búsqueda, filtros y acciones. No vuelvas a los chips sueltos de `.filtros` en esta pantalla.
12. **La retícula de Caja cuenta con el menú lateral de 248 px.** Las fichas del paso 1 del cierre (`.fichas`) necesitan ~230 px para que el nombre y el monto no se corten, así que pasan a 3 columnas desde 900 px y a 4 desde 1280 px, no desde `md`/`lg` como el resto. Las tarjetas de mensajeros (`.mgrid-mens`) y los KPIs (`.cifras-caja`) sí usan los cortes de Tailwind (1/2/3/4/5 y 1/2/3/4/8). En `.mcard-mens` el pie va con `margin-top:auto` para que todos los "Liquidar" queden en la misma línea.

## Trampas conocidas del entorno local

- **Pooler de Supabase en session mode: 15 cupos.** Cada proceso abre hasta `DATABASE_POOL_MAX` (5 por defecto). Local + Render + herramientas pueden agotarlo y sale `EMAXCONNSESSION max clients reached in session mode`. Baja `DATABASE_POOL_MAX` o usa el Transaction pooler (puerto 6543) para la app. `read ETIMEDOUT` en conexiones inactivas se reduce con `keepAlive` e `idleTimeout` corto.
- **Puerto 4000 ocupado por otro proyecto.** En la máquina del desarrollador corren otros backends. Si `localhost:4000` responde un 404 HTML ("Cannot GET /api/…") o un 403 `{"error":"Origen no permitido"}` **sin** `code`, no es este backend: el nuestro responde `{ "error": { "code", "message" } }`. Comprueba quién escucha con `lsof -iTCP:4000 -sTCP:LISTEN -n -P`. Solución: cerrar el otro proceso, o poner `PORT=4001` en `backend/.env` y arrancar el frontend con `VITE_API_PROXY=http://localhost:4001 npm run dev`.
- **Los 403 propios de este backend** salen de `middleware/seguridad.js` (`verificarOrigen`): "Falta la cabecera X-JSL" (se llamó a la API sin axios/`api()`) u "Origen no permitido" (se entró por `127.0.0.1:5173` en vez de `localhost:5173`; `CORS_ORIGENES` solo trae `http://localhost:5173`). Los 403 de rol vienen de `permitir(...)`.
- **El puerto 5173 también lo usa `.claude/launch.json`** (sirve el prototipo viejo `app/` con `python3 -m http.server 5173`). Si Vite dice que 5173 está ocupado, puede ser eso.
- **Nombres de variable distintos para el proxy de Vite:** `VITE_API_PROXY` en `frontend/`, `VITE_PROXY_API` en el repo de clientes. No es un error de tipeo: son dos proyectos.
- **Las pruebas del backend vacían la base** apuntada por `TEST_DATABASE_URL`. Nunca la apuntes a producción. `.env` tiene secretos (`DATABASE_URL`, `DATABASE_CA`, `JWT_SECRET`, claves de Supabase): no los imprimas ni los copies a respuestas, commits o docs.
- Los skills `/publicar` y `/auditar` son del sistema viejo (Firebase, push directo a `main`). No los uses aquí.

## Cómo comprobar la interfaz sin backend ni navegador abierto

Para revisar anchos de celular y desbordes se usó Chrome headless con `puppeteer-core` (instalado en una carpeta temporal, no en el repo):

1. Levanta el frontend (`npm run dev`; el del cliente tiene `npm run dev:demo`, que no necesita backend).
2. Con la app interna no hay modo demo de API: intercepta `/api/*` en Puppeteer (`page.setRequestInterception`) y responde JSON inventado. **Filtra por `new URL(url).pathname.startsWith('/api/')`**, no por `includes('/api/')`: Vite sirve módulos como `/src/api/servicios.ts` y se rompería la app (pantalla en blanco).
3. En cada ruta y a 320, 360, 390 y 430 px compara `document.documentElement.scrollWidth` con `clientWidth`; lista los elementos con `getBoundingClientRect().right` mayor que el ancho, ignorando los que tengan un ancestro con `overflow` recortando.
4. Prueba con datos extremos (nombres de 70 caracteres, correos de 90).

Es una receta, no un script del repo. Si lo conviertes en prueba automática, guárdalo en una carpeta `scripts/` y documéntalo aquí.

## Registro de sesiones (lo más reciente arriba)

- **2026-11-09:** Caja: el paso 1 del cierre pasó de una lista amontonada a fichas (nombre, plata pendiente y "Recibir" a la derecha) en retícula; las tarjetas de mensajeros usan 1/2/3/4/5 columnas con datos clave-valor y el pie "Liquidar" anclado al fondo, así todos los botones quedan alineados; los KPIs de Caja General usan 1/2/3/4/8 con altura igual y textos truncados a dos líneas. Revisado a 1440, 1280, 1024 y 390 px en claro y oscuro; los handlers de Recibir, Dar base y Liquidar quedaron iguales.
- **2026-11-10:** conexiones a Supabase: `DATABASE_POOL_MAX=5` (antes 10), idle de 10 s y `keepAlive` para evitar `EMAXCONNSESSION` y `read ETIMEDOUT` en el pooler de session mode. Documentado el cambio a Transaction pooler (6543) para la app.
- **2026-11-09:** vista Clientes: las acciones quedaron en una barra a la derecha bajo los KPIs ("Enviar saldos por WhatsApp" en verde y "Registrar cliente" en azul) y los filtros en una toolbar pegada a la tabla: búsqueda con lupa a la izquierda, control segmentado Todos/Por cobrar/Por pagar y el filtro de día integrado con calendario, ‹ › y Hoy. En el celular se apila búsqueda → filtros → acciones; el espacio entre KPIs y tabla se redujo. Clic en "Hoy" y "Ver todos" comprobado en modo demo; revisado a 1440 px (claro y oscuro) y 390/320 px.
- **2026-11-09:** navegación de escritorio: el menú lateral ya no tiene "Más" y muestra Resultados, Personal, Historial, Papelera y Respaldo y espacio como accesos directos del grupo Administración; en esa vista se quitó la fila de chips de "Más". El celular no cambia: conserva "Más" con sus chips. Los títulos de sección del menú quedaron más pequeños (11,5 px), con más interletraje y al 45 % de opacidad, separados por una línea tenue; `useEscritorio()` (`lib/pantalla.ts`) marca el corte de 960 px. Revisado en Chrome a 1440 px (admin y asistente) y 390 px, sin scroll horizontal.
- **2026-11-09:** pestaña Clientes: paginación en el servidor (`/clientes/saldos`) y en la app, 20 por página en computador y 8 en celular; búsqueda, filtros y día también los resuelve el servidor. Pruebas: `clientes-paginacion-pura.test.js` (5, pasan sin base) y `clientes-paginacion.test.js` (integración, requiere el Postgres de pruebas).
- **2026-11-09:** layout XL: desde 1280 px el `main` ocupa todo el ancho disponible a la derecha del menú lateral (se anula el tope de 1240 px del prototipo). Revisado a 1440 y 1920 px en Panel y Pedidos, sin scroll horizontal.
- **2026-11-09:** app interna: botón de tema claro/oscuro en el header de escritorio, junto al avatar, y en el menú del celular. Sigue el tema del sistema hasta que se elige uno; la elección se guarda en `js_tema`.
- **2026-11-09:** correo de restablecimiento rediseñado: encabezado oscuro con logo, CTA `#0084c7`, aviso de vigencia/seguridad, enlace alternativo con `word-break: break-all` y pie corporativo. Logo por `CORREO_LOGO_URL` (PNG por Outlook). Revisado a 700 px y 390 px.
- **2026-11-09:** app de oficina: enlace “¿Olvidaste tu contraseña?” en el ingreso y pantallas públicas `/recuperar`, `/restablecer` y `/activar`, con el mismo diseño (marco compartido en `pages/AccesoComun.tsx`). Revisadas a 390 px en modo demo.
- **2026-11-09:** backend: servicio de correo con Resend y enlaces de un solo uso para activar cuentas y reiniciar contraseñas (`servicios/enlaces.js`, `helpers/correo.js`, tabla `enlaces`, 11 pruebas nuevas). `POST /usuarios` ya no exige contraseña: la crea la persona con el enlace. Pendiente: botones de envío en Accesos y las pantallas del portal de clientes.
- **2026-11-09:** diagnóstico de un 403 al conectar el frontend: el puerto 4000 lo ocupaba el backend de otro proyecto. Revisión de toda la documentación; se agregó este archivo, la guía de trampas locales y se corrigieron las referencias viejas en `frontend/CLAUDE.md`.
- **2026-11-07/08:** rediseño del ingreso (oficina), de la barra lateral (reemplazada después por la app interna igual al prototipo), de la portada con carrusel, del menú móvil y del login del portal de clientes; corrección de desbordes laterales en móvil. Las fotos del carrusel son de ejemplo (Wikimedia Commons, CC BY-SA/CC0): hay que cambiarlas por fotos propias antes de publicar (créditos en `jslogistics-cliente-frontend/public/img/hero/LEEME.md`).
