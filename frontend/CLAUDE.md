# Frontend (oficina y mensajeros): convenciones para agentes de IA

Primero lee el [`CLAUDE.md` de la raíz](../CLAUDE.md). Esta app es para **administración, asistentes y mensajeros**. El portal de clientes es otro repositorio (`jslogistics-cliente-frontend`), con las mismas convenciones.

## Stack

React 19 · TypeScript (estricto) · Vite · Tailwind CSS 4 (tokens en `src/index.css`) · axios · TanStack Query 5 · React Router 7. No hay librería de componentes: se usan los de `src/components/ui.tsx`.

No agregues dependencias (formularios, estado global, íconos, componentes) sin una razón clara en el PR. Lo que hay alcanza para casi todo.

## Estructura

```
src/
├── main.tsx              QueryClient (sin reintentar los 4xx), Router, Avisos, Sesión
├── App.tsx               Rutas por rol (<Solo roles={...}>)
├── api/
│   ├── cliente.ts        Instancia de axios (withCredentials, X-JSL) y FalloApi
│   ├── servicios.ts      Una función por endpoint, agrupadas por recurso
│   └── tipos.ts          Tipos de lo que devuelve la API (deben coincidir con backend/README.md)
├── auth/Sesion.tsx       useSesion / useUsuario (sesión de /auth/yo)
├── components/
│   ├── ui.tsx            Boton, Campo, Selector, Casilla, Aviso, Dialogo, Titulo, Cargando, Vacio, Dato, EtiquetaEstado
│   ├── Marco.tsx         Menú lateral (computador) y barra inferior (celular), por rol
│   ├── Avisos.tsx        useAviso(): mensajes cortos tipo toast
│   └── …                 Componentes de dominio (Entrega, Fotos, TarjetaPedido, BuscarCliente)
├── lib/formato.ts        pesos(), fechas en hora de Colombia, etiquetas del negocio (MOTIVOS, METODOS, ROLES…)
├── lib/imagen.ts         comprimir() fotos (800 px) y firmaABlob() antes de subirlas
└── pages/
    ├── mensajero/        Ruta, Entregados
    ├── oficina/          Inicio, Pedidos, PedidoDetalle, Clientes, ClienteDetalle
    └── admin/            Personal, Accesos
```

## Reglas

**Datos y API**
- **Todo pasa por `src/api/servicios.ts`.** Los componentes no importan axios ni escriben URL.
- Lecturas con `useQuery` y escrituras con `useMutation`. Después de escribir, invalida la clave del recurso (`qc.invalidateQueries({ queryKey: ["pedidos"] })`).
- **Claves de query:** empiezan por el recurso. Por ejemplo `["pedidos", "lista", filtros]`, `["pedidos", "detalle", guia]`, `["clientes", id, "movimientos"]`. Así una invalidación por recurso refresca todo lo relacionado.
- Los errores se muestran con `mensajeDe(error)` dentro de un `<Aviso tipo="error">`. El mensaje ya viene en español del backend. Para decidir algo según el error, usa `error instanceof FalloApi && error.code === "…"`, nunca el texto.
- **No calcules en el navegador lo que decide el servidor** (diferencias, saldos, permisos). Mostrar un aviso previo está bien (como la diferencia de cobro antes de guardar), pero el valor que se guarda lo calcula el backend.
- **Nada de tokens ni datos sensibles en `localStorage`.** La sesión es la cookie `HttpOnly`.
- Si falta un endpoint, no lo simules en el frontend: se agrega primero en el backend (ver `backend/CLAUDE.md`).

**Roles y rutas**
- Cada ruta nueva va en `App.tsx` dentro de `<Solo roles={[...]}>`, y en el menú de `Marco.tsx` si corresponde. Ocultar un botón es solo comodidad: **el permiso real lo impone el backend**.
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

1. Si el endpoint no existe, agrégalo primero en el backend, con su prueba.
2. Agrega el tipo en `api/tipos.ts` y la función en `api/servicios.ts`.
3. Crea la página en `pages/<rol>/<Nombre>.tsx` con `useQuery` / `useMutation`, y los estados de cargando (`<Cargando />`), error (`<Aviso tipo="error">`) y vacío (`<Vacio>`).
4. Regístrala en `App.tsx` con `<Solo roles>` y, si va en el menú, en `Marco.tsx`.
5. Revisa que se vea bien a 390 px de ancho y en modo oscuro.

## Revisar antes del PR

```bash
npm run typecheck && npm run build
```

Para probar contra el backend: `npm run dev` (el proxy manda `/api` a `localhost:4000`), con datos inventados de `npm run db:demo -- --si` en una base de pruebas vacía.
