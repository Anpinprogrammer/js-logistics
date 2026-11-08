# Frontend de JS Logistics (oficina y mensajeros)

App de operación y administración en **React 19 + TypeScript + Tailwind CSS 4**, con **axios** contra el backend (`../backend`). El portal de los clientes es otro proyecto (`jslogistics-cliente-frontend`): si una cuenta de cliente intenta entrar aquí, se le indica que use el portal.

## Qué hay

| Rol | Pantallas |
|---|---|
| Mensajero (celular) | **Mi ruta**: guías en ruta, crear guía, foto del paquete al crear la guía, entregar con foto y firma (y aviso de diferencia de cobro) o "no se pudo" (reprogramar o devolver). **Entregados**: por día, con corrección durante 24 horas. **Mi cuenta**. |
| Asistente | **Inicio** (resumen del día y alertas), **Pedidos** (filtros, búsqueda, paginación, detalle: remitente, valores, fotos y firma, domicilio pagado, revisar diferencias, registrar entrega), **Clientes** (búsqueda, alta con aviso de repetidos, ficha con pedidos y movimientos). |
| Administración | Todo lo anterior, más corregir lo cobrado, eliminar guías y clientes, **Personal** y **Accesos** (cuentas, rol, vínculo, contraseña, desactivar). |

**Caja** (arqueos, cierre del día, cajas de oficina, liquidaciones, sueldos) aparece "en construcción" hasta que el backend tenga esos módulos. Lo mismo pasa con los saldos de clientes.

## Estructura

```
src/
├── main.tsx            React Query, router, avisos y sesión
├── App.tsx             Rutas por rol
├── api/                cliente.ts (axios), servicios.ts (llamadas por recurso), tipos.ts
├── auth/Sesion.tsx     Sesión (/auth/yo, ingresar, salir)
├── components/         Marco (menú lateral / barra inferior), ui, formularios de entrega, buscador de clientes
├── lib/formato.ts      Pesos, fechas en hora de Colombia y textos del negocio
└── pages/              mensajero/, oficina/, admin/
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

Para tener datos de prueba inventados, carga el demo en una base **vacía** de pruebas: `cd ../backend && npm run db:demo -- --si`. Las cuentas son `admin@demo.co`, `oficina@demo.co`, `carlos@demo.co` y `diana@demo.co`, todas con la contraseña `demo-js-2026`.

## Publicar (Vercel)

- **Root Directory:** `frontend`. Vercel detecta Vite: build `npm run build`, carpeta `dist`.
- **No pongas `VITE_API_URL`.** La app llama a `/api` en su propio dominio y `vercel.json` lo reenvía al backend de Render (`https://js-logistics.onrender.com`). Así la cookie de sesión es del mismo sitio y funciona con `SameSite=Lax`, también en Safari de iPhone. Si llamaras directo a `onrender.com`, el navegador no mandaría la cookie y todo daría 401.
- `vercel.json` también manda las rutas de React a `index.html`, para que no den 404 al recargar.
- En el backend (Render): `CORS_ORIGENES=https://TU-APP.vercel.app` (más tu dominio propio, separados por coma), `COOKIE_SAMESITE=lax` y `TRUST_PROXY=2` (Vercel y Render van delante).
- Si cambias la URL del backend, cámbiala en `vercel.json`.

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
