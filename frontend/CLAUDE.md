# Frontend (oficina y mensajeros): convenciones para agentes de IA

Primero lee el [`CLAUDE.md` de la raíz](../CLAUDE.md) y [`docs/ESTADO.md`](../docs/ESTADO.md). Esta app es para **administración, asistentes y mensajeros**. El portal de clientes es otro repositorio (`jslogistics-cliente-frontend`), con las mismas convenciones.

## Stack

React 19 · TypeScript (estricto) · Vite · Tailwind CSS 4 (tokens en `src/index.css`) · axios · TanStack Query 5 · React Router 7 · SweetAlert2 (avisos y confirmaciones de la app interna). No hay librería de componentes: la app interna usa las piezas de `src/interna/ui.tsx` y las clases del prototipo. La única dependencia de animación es `motion` (14.12.0), usada solo por la intro del ingreso (`pages/intro/`); no la importes desde `interna/`.

No agregues dependencias (formularios, estado global, íconos, componentes) sin una razón clara en el PR. Lo que hay alcanza para casi todo.

## Estructura

Con sesión, la app es **igual al prototipo** (`app/` del sistema viejo): mismo HTML, mismas clases y mismos KPIs, escrito en React. La estructura de carpetas está en [`README.md`](README.md#estructura). Lo importante:

- `src/interna/estilos.css` es la copia generada de `app/css/estilos.css`, con todas sus reglas dentro de `.jsl`. **No lo edites a mano**; los ajustes van en `ajustes.css`. Dentro de `src/interna/` se usan las clases del prototipo, no Tailwind. Tailwind queda solo para `pages/` (ingreso, recuperar y restablecer).
- `src/interna/motor.ts` tiene los datos en memoria (`S`) y las reglas de negocio copiadas de `app/js/app.js`, con el mismo comportamiento. Cuando el backend calcule un valor (saldos, caja, sueldos), se usa el suyo y se borra el cálculo de aquí.
- `src/interna/acciones.ts` hace todas las escrituras. Cada una tiene su rama `if (DEMO)` que cambia los datos en memoria.
- El estado de la interfaz (pestaña, filtros, día elegido) vive en `E` (`estado.ts`), como las variables del prototipo. `tocar()` vuelve a pintar.
- **Carga diferida:** el ingreso, cada modo (oficina y mensajero) y cada pestaña de la oficina van en archivos aparte con `perezoso()` (`lib/perezoso.ts`), que además los precarga. Una pestaña nueva se agrega igual en `oficina/Oficina.tsx`; no la importes directo desde `Marco.tsx`, o vuelve al archivo principal.
- **Menú en el escritorio y en el celular:** el corte es 960 px (`useEscritorio()` en `lib/pantalla.ts`). En el escritorio el menú lateral muestra Resultados, Personal, Historial, Papelera y Respaldo como accesos directos (`ADMIN_ESCRITORIO` en `interna/Marco.tsx`, misma clave que `E.subMas`); en el celular esas sub-pestañas siguen dentro de **Más**, con sus chips, y las pestañas de abajo se cortan en 4 más un menú. En el pie del menú de escritorio hay un botón para colapsarlo a 76 px (clase `menu-colapsado` en `.jsl`): se ocultan textos y títulos, quedan los íconos con el nombre en el `title`. Los formularios de **Personal** (Más) usan modales propios (`modal-fondo`/`modal-caja` en `ajustes.css`), no la ventana de `ui.tsx`.
- **Avisos y confirmaciones:** se piden con `useVentana()` (`v.avisar(texto)` y `await v.confirmar(titulo, texto, boton)`), que por dentro usan SweetAlert2 desde `lib/alertasAdmin.ts` (`alertaAdmin.exito/error/aviso/confirmar` y `avisoRapido`). No uses `window.alert/confirm`, no pintes un `<div className="toast">` ni importes `sweetalert2` directo en una pantalla. `avisar` elige el tono por cómo empieza el texto: "No se pudo…" sale como error y "Escribe…/Elige…" como advertencia. Los colores salen de las variables de `.jsl` (tema claro/oscuro) y el aspecto está en `lib/alertas.css`, que es global y sin Tailwind. Si hay un `<dialog>` abierto, la alerta se monta dentro de él: lo que queda fuera de un diálogo modal está inerte y tapado.
- **Filtros de fecha:** todos usan el mismo calendario (`interna/Calendario.tsx`), nunca `<input type="date">`. Un día con ‹ › y Hoy: `FiltroDia` (`ui.tsx`, con `compacto` en toolbars y hojas). Un día suelto en un formulario: `SelectorFecha`. Un rango: `RangoFechas` (un solo botón y un solo calendario, con atajos Hoy, Últimos 7 días, Este mes, Mes pasado y Ver todo; en el celular sube como hoja desde abajo). Dentro de las hojas de filtros (`.tp-hoja`) el calendario se muestra en el flujo, porque el cuerpo hace scroll y lo recortaría. Si un filtro nuevo necesita fecha, reúsalos.
- **Caja tiene sub-pestañas:** Caja, Mensajeros y Liquidaciones recientes. El estado vive en `E.tabCaja` y se guarda en `js_caja` (localStorage), así se conserva al recargar y volver a Caja. El control reutiliza `.seg` con `role="tablist"` y flechas del teclado. **Cuentas** usa el mismo patrón (Cuentas / Movimientos / Ganancias) con `E.tabCuentas` y `js_cuentas`. En Movimientos el tipo (Todos, Pagos, Compras, Ganancias) son píldoras independientes, como los estados de Pedidos, y el rango de fechas es un solo `RangoFechas`.
- **Tema:** el claro/oscuro se pone con `data-theme="light"` o `"dark"` en el contenedor `.jsl` (`interna/tema.ts`); sin atributo sigue al sistema. La elección se guarda en `js_tema`. El botón está en el header de escritorio; en el celular está en el menú.
- **Paginación de listas:** `usePorPagina()` (`lib/pantalla.ts`) devuelve 8 en celular y 20 en computador. Pedidos y Clientes piden la página al servidor; en demo la arman en memoria. El paginador compartido es `Paginador` de `interna/ui.tsx`. Cuentas usa `usePorPaginaCuentas()` (6 y 15) para Movimientos y Ganancias, y `usePorPaginaInternos()` (5 y 10) para la tabla de movimientos de las cuentas internas (`/caja/movimientos/pagina`). Personal → Acceso usa `usePorPaginaAccesos()` (5 y 10) contra `/usuarios/pagina`, con toolbar de búsqueda y rol que filtra en el servidor y pie de paginación propio. Historial usa `usePorPaginaHistorial()` (5 y 13) contra `GET /historial?pagina=&porPagina=&buscar=`. Personal JS usa `usePorPaginaPersonal()` (4 y 7) contra `GET /mensajeros/pagina?buscar=&tipo=`. Caja → Liquidaciones recientes usa `usePorPaginaLiquidaciones()` (5 y 9) contra `GET /liquidaciones/pagina`. `guardarPersona` guarda en el almacén la ficha que responde el `PATCH/POST /mensajeros`, sin esperar la recarga completa.

## Reglas

**Datos y API**
- **Todo pasa por `src/api/servicios.ts`.** Los componentes no importan axios ni escriben URL.
- La app interna carga todo con `cargarTodo()` (`interna/datos.tsx`) y escribe con `interna/acciones.ts`, que recarga después de cada escritura. Lo que no entra en esa carga (historial, papelera, fotos) va con `useQuery`.
- **Claves de query:** empiezan por el recurso. Por ejemplo `["pedidos", "lista", filtros]`, `["pedidos", "detalle", guia]`, `["clientes", id, "movimientos"]`. Así una invalidación por recurso refresca todo lo relacionado.
- Los errores se muestran con `mensajeDe(error)` dentro de un `<Aviso tipo="error">`. El mensaje ya viene en español del backend. Para decidir algo según el error, usa `error instanceof FalloApi && error.code === "…"`, nunca el texto.
- **No calcules en el navegador lo que decide el servidor** (diferencias, saldos, permisos). Mostrar un aviso previo está bien (como la diferencia de cobro antes de guardar), pero el valor que se guarda lo calcula el backend.
- **Nada de tokens ni datos sensibles en `localStorage`.** La sesión es la cookie `HttpOnly`.
- Si falta un endpoint, no lo simules en el frontend: se agrega primero en el backend (ver `backend/CLAUDE.md`).

**Roles y rutas**
- Las pestañas por rol están en `interna/Marco.tsx`, como en el prototipo. Ocultar un botón es solo comodidad: **el permiso real lo impone el backend**.
- El mensajero usa la app en el celular, en la calle: botones grandes (mínimo 44 px de alto), lo principal arriba, pocos pasos y textos cortos.

**Interfaz y estilos**
- **Dos mundos de estilos.** Dentro de `src/interna/` (toda la app con sesión) se usan las clases del prototipo (`estilos.css` dentro de `.jsl`, ajustes en `ajustes.css`) y los componentes de `interna/ui.tsx`; nada de Tailwind ahí. Tailwind y los tokens de `src/index.css` (`bg-papel`, `text-suave`, `bg-marca`…) son solo para `pages/Ingreso.tsx` y las demás pantallas públicas de acceso (`Recuperar.tsx`, `Restablecer.tsx`), que comparten el marco de `AccesoComun.tsx`.
- **`pages/Ingreso.tsx` es la excepción a "solo tokens"**: es siempre oscura y usa sus colores (`#070B19`, `#38bdf8`, `#0284c7`) a propósito. Si la cambias, conserva el badge claro con el logo recortado (ver `docs/ESTADO.md`, decisión 1). Las pantallas de recuperar y restablecer usan el mismo marco y los mismos colores.
- Primero el celular, después el computador (`md:`). Las listas son tarjetas en el celular y tablas en el computador.
- En pantallas XL (≥ 1280 px) el contenido de la app interna ocupa todo el ancho a la derecha del menú lateral; el tope de 1240 px del prototipo se anula en `ajustes.css`. No lo reduzcas sin probar Panel y Pedidos en un monitor ancho.
- **Nada de scroll horizontal de la página.** Un `grid` lleva siempre su columna base (`grid grid-cols-1 md:grid-cols-2`); los textos largos (correos, nombres) en flex llevan `min-w-0` y `[overflow-wrap:anywhere]`. Compruébalo a 320, 360 y 390 px (receta en `docs/ESTADO.md`).
- Accesibilidad: todo campo con su `label`, botones de solo ícono con `aria-label`, diálogos con la ventana de `interna/ui.tsx` y foco visible. `useVentana().abrir(contenido, variante?)` acepta `"drawer"` (lateral izquierdo a pantalla completa), `"drawer-ancho"` (drawer de hasta 540 px para “Enviar saldos por WhatsApp”), `"centrada"` (modal de 448 px al centro también en móvil) o `"centrada-ancha"` (512 px, para los formularios de Sueldos); se aplica con `data-variante` en el `<dialog>` y reglas en `ajustes.css`. Sin variante se mantiene la ventana de siempre. El calendario de una sola fecha es `SelectorFecha` (`interna/Calendario.tsx`), reutilizable con `valor` en `YYYY-MM-DD` y `alCambiar`.

Los formularios de Cuentas y Sueldos llevan la clase `form-modal` (etiquetas pequeñas y botón primario a todo el ancho); con `form-doble` los pares de campos van en dos columnas desde 600 px.
- Textos en español de Colombia, de tú, cortos. Dinero con `pesos()` y fechas con `fechaHora()` / `hora()`, siempre en hora de Colombia. Para convertir lo que escribe el usuario a pesos, usa `aPesos("25.000")`.

**TypeScript**
- Nada de `any`. Los tipos de la API van en `api/tipos.ts` y tienen que coincidir con lo que devuelve el backend.
- Componentes como funciones con nombre en PascalCase y en español (`TarjetaPedido`, `DialogoEntrega`); hooks como `useAlgo`.

## Cómo agregar una pantalla (receta)

1. Si el endpoint no existe, agrégalo primero en el backend, con su prueba, y su función en `api/servicios.ts` y su tipo en `api/tipos.ts`.
2. Si la pantalla existe en el prototipo, cópiala de `app/js/app.js` con el mismo HTML y las mismas clases.
3. Escribe la acción en `interna/acciones.ts`, con su rama de modo demo.
4. Revisa que se vea bien a 390 px de ancho y en computador, con `VITE_DEMO=true npm run dev`.

## Revisar antes del PR

```bash
npm run typecheck && npm run build
```

Para probar contra el backend: `npm run dev` (el proxy manda `/api` a `localhost:4000`), con datos inventados de `npm run db:demo -- --si` en una base de pruebas vacía.
