# Frontend (oficina y mensajeros): convenciones para agentes de IA

Primero lee el [`CLAUDE.md` de la raíz](../CLAUDE.md). Esta app es para **administración, asistentes y mensajeros**. El portal de clientes es otro repositorio (`jslogistics-cliente-frontend`), con las mismas convenciones.

## Stack

React 19 · TypeScript (estricto) · Vite · Tailwind CSS 4 (tokens en `src/index.css`) · axios · TanStack Query 5 · React Router 7. No hay librería de componentes: la app interna usa las piezas de `src/interna/ui.tsx` y las clases del prototipo.

No agregues dependencias (formularios, estado global, íconos, componentes) sin una razón clara en el PR. Lo que hay alcanza para casi todo.

## Estructura

Con sesión, la app es **igual al prototipo** (`app/` del sistema viejo): mismo HTML, mismas clases y mismos KPIs, escrito en React. La estructura de carpetas está en [`README.md`](README.md#estructura). Lo importante:

- `src/interna/estilos.css` es la copia generada de `app/css/estilos.css`, con todas sus reglas dentro de `.jsl`. **No lo edites a mano**; los ajustes van en `ajustes.css`. Dentro de `src/interna/` se usan las clases del prototipo, no Tailwind. Tailwind queda solo para `pages/Ingreso.tsx`.
- `src/interna/motor.ts` tiene los datos en memoria (`S`) y las reglas de negocio copiadas de `app/js/app.js`, con el mismo comportamiento. Cuando el backend calcule un valor (saldos, caja, sueldos), se usa el suyo y se borra el cálculo de aquí.
- `src/interna/acciones.ts` hace todas las escrituras. Cada una tiene su rama `if (DEMO)` que cambia los datos en memoria.
- El estado de la interfaz (pestaña, filtros, día elegido) vive en `E` (`estado.ts`), como las variables del prototipo. `tocar()` vuelve a pintar.

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
- Primero el celular, después el computador (`md:`). Las listas son tarjetas en el celular y tablas en el computador (ver `pages/oficina/Pedidos.tsx`).
- Usa los **tokens** de color de `index.css` (`bg-papel`, `text-suave`, `bg-marca`, `text-rojo`, `bg-verde-claro`…), nunca colores sueltos (`#1670b0`, `bg-blue-600`). El modo oscuro funciona solo gracias a esos tokens.
- Reutiliza `ui.tsx` (`Boton`, `Campo`, `Dialogo`…) y las clases `caja`, `entrada` y `etiqueta`. Si un patrón se repite en dos pantallas, pásalo a `components/`.
- Accesibilidad: todo campo con su `label` (el componente `Campo` ya lo hace), botones de solo ícono con `aria-label`, diálogos con `Dialogo` (es un `<dialog>` nativo) y foco visible.
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
