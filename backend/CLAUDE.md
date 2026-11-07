# Backend: convenciones para agentes de IA

Primero lee el [`CLAUDE.md` de la raíz](../CLAUDE.md). Aquí está cómo se escribe el backend. Copia los patrones de los archivos que ya existen: `pedidos` es el recurso más completo y sirve de ejemplo.

## Stack

Node.js ≥ 20 · Express 5 · JavaScript con **módulos ES** (`import`, sin TypeScript) · `pg` (SQL a mano, sin ORM) · Zod 4 · `jsonwebtoken` · `bcryptjs` · `helmet` · `cors` · `express-rate-limit` · pruebas con `node:test` + `supertest` contra un Postgres real.

No agregues dependencias sin una razón clara. Si lo haces, explícala en el PR.

## Capas (MVC) y qué va en cada una

| Carpeta | Responsabilidad | No va aquí |
|---|---|---|
| `index.js` | Arrancar el servidor y cerrarlo en orden (`SIGTERM`). | Nada de Express. |
| `app.js` | Armar Express: seguridad, JSON, cookies, `/api` y errores. | Rutas sueltas. |
| `config/` | `env.js` (variables validadas con Zod) y `db.js` (pool, `query`, `transaccion`). | `process.env` en otros archivos: siempre `import { env }`. |
| `routes/` | Un archivo por recurso (`<recurso>.routes.js`): método, ruta, `permitir(...)`, `validar(...)` y controlador. Se montan en `routes/index.js`. | Lógica. |
| `validators/` | Esquemas Zod de cada petición (`<recurso>.validator.js`). Las piezas comunes van en `comunes.js`. | Consultas a la base. |
| `controllers/` | Un caso de uso por función: quién puede, qué se valida contra la base, qué se calcula, transacción, historial y respuesta. | SQL. |
| `models/` | SQL de una tabla (`<entidad>.model.js`). Devuelve objetos camelCase con `filaAObjeto`. Las funciones que escriben aceptan un `db` opcional para participar en una transacción. | Permisos ni reglas de negocio. |
| `helpers/` | Utilidades puras: `errores.js`, `jwt.js`, `cookies.js`, `claves.js`, `ids.js`, `sql.js`, `storage.js`, `negocio.js` (constantes y cálculos del negocio, sin base de datos). | Estado ni acceso a la base. |
| `middleware/` | `autenticar`, `autorizar` (`permitir`, `OFICINA`, `EQUIPO`), `validar`, `seguridad`, `errores`. | |
| `db/` | `schema.sql` (fuente de verdad del esquema), `migrar.js`, `crear-admin.js`, `demo.js`. | |
| `test/` | Pruebas de integración por recurso (`<recurso>.test.js`) y `ayuda.js`. | |

## Cómo agregar un endpoint (receta)

1. **Esquema**: si necesita tablas o columnas, agrégalas en `db/schema.sql` de forma idempotente (`CREATE TABLE IF NOT EXISTS`, `ALTER TABLE … ADD COLUMN IF NOT EXISTS`), con `CHECK` para los valores cerrados, `REFERENCES` para las relaciones e índices para los filtros. Si es una tabla nueva, agrégala también a la lista de RLS del final.
2. **Modelo**: las consultas en `models/<entidad>.model.js`. Siempre con parámetros `$1, $2…`. Las columnas que se pueden actualizar salen de una lista fija en el código y pasan por `armarSet`.
3. **Validador**: un esquema Zod para body, query y params en `validators/<recurso>.validator.js`. Usa `pesos`, `medio`, `id`, `texto(max)` y `email` de `comunes.js`.
4. **Controlador**: lee solo `req.valido.*` (nunca `req.body` directo) y `req.usuario`. Lanza los errores de `helpers/errores.js`. Si escribe más de una cosa, o lee y luego escribe, usa `transaccion(async db => …)` y bloquea la fila con `SELECT … FOR UPDATE` (ver `Pedido.bloquear`). Registra el cambio en `historial` con `Auditoria.registrar`. Si borra, deja copia con `Auditoria.aPapelera`.
5. **Ruta**: `r.metodo("/ruta", permitir(...roles), validar({...}), C.funcion)` en `routes/<recurso>.routes.js`. Si el archivo es nuevo, móntalo en `routes/index.js` después de `autenticar`.
6. **Prueba**: en `test/<recurso>.test.js`. Como mínimo: el caso feliz, un rol que **no** debe poder hacerlo y una entrada inválida.
7. **Documentación**: agrega la fila en la tabla de endpoints de `README.md`.

## Reglas que no se rompen

**Seguridad**
- Toda ruta, salvo `/health`, `/ready` y `/auth/ingresar|salir`, pasa por `autenticar`. Cada ruta declara `permitir(...)`.
- **Cada rol ve solo lo suyo, y el filtro lo pone el servidor.** Para un mensajero, `mensajeroId = req.usuario.mensajeroId`; para un cliente, `clienteId = req.usuario.clienteId`. Ignora lo que mande la petición. A quien no puede ver un registro se le responde **404**, no 403, para no confirmar que existe.
- Los permisos replican los de `../firestore.rules` (oficina, asistente, mensajero y cliente). Ante la duda, el más restrictivo.
- SQL **siempre** con parámetros. Nunca concatenes texto que venga del usuario. Escapa `%`, `_` y `\` en los `LIKE` (ver `cliente.model.js`).
- Nunca devuelvas `clave_hash`, `version_sesion` ni rutas internas de Storage (`miniRuta`): solo URL firmadas.
- El rol se lee de la base en cada petición. Para cerrar sesiones se sube `version_sesion`, no se guardan listas de tokens.
- No cambies cookies, CORS, CSRF (`X-JSL`) ni los límites de intentos sin explicarlo en el PR.

**Dinero y negocio**
- Pesos enteros (`BIGINT` en la base, `pesos` en Zod). Nada de decimales ni `float`.
- **El servidor calcula lo que se puede calcular**: diferencias de cobro, saldos, consecutivos, horas (`new Date()` del servidor, nunca la del cliente para algo contable).
- Los cálculos van como funciones puras en `helpers/negocio.js`, copiados de `../app/js/app.js` con el mismo comportamiento, y con prueba.
- El consecutivo de guías sale de `contadores`, con `UPDATE … RETURNING` dentro de la transacción, para que no queden huecos. No uses `SEQUENCE` para eso.
- Las ventanas de corrección (24 horas) y "lo ya contado en un arqueo no se toca" se validan en el servidor.

**Estilo**
- Nombres en español: archivos `<recurso>.routes.js`, `<recurso>.validator.js`, `<recurso>.controller.js` y `<entidad>.model.js`; funciones como verbos (`listar`, `obtener`, `crear`, `actualizar`, `eliminar`, `entregar`); el modelo importado como `* as Pedido`.
- Cada archivo empieza con un comentario corto que dice para qué es. Comenta el **porqué** de las reglas no obvias.
- Respuestas: `{ recurso: … }` o `{ recursos: [...] }` (por ejemplo `{ pedido }` o `{ pedidos, siguiente }`); `201` al crear; `204` sin cuerpo al borrar o en acciones sin respuesta.
- Paginación: con cursor (`cursor` → `siguiente`), no con `OFFSET`, en las listas que crecen.
- Errores: usa `HttpError` con un `code` estable en MAYÚSCULAS (`YA_CERRADA`, `POSIBLE_REPETIDO`). El frontend decide según el `code`.

## Revisar antes del PR

```bash
TEST_DATABASE_URL=postgresql://postgres@127.0.0.1:5432/jsl_test npm test   # base de pruebas: se vacía
node --check index.js
```
