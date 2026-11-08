# Borrado automático de fotos viejas (diseño, sin implementar)

Estado: **propuesta**. No hay código para esto todavía. Este documento dice qué se borraría, cuándo y cómo, para hacerlo después sin tener que volver a decidirlo.

## Por qué

Las fotos y firmas viven en un bucket privado de Supabase Storage. Cada guía completa pesa unos 230 KB: foto de salida y foto de entrega (~100 KB cada una a 800 px), firma (~20 KB) y miniatura (~5 KB). Con unas 100 imágenes al día:

| Plan | Espacio | Alcanza para |
|---|---|---|
| Supabase gratis | 1 GB | ~3 meses |
| Supabase Pro | 100 GB incluidos | años |

Borrar lo viejo mantiene el uso estable, por ejemplo en ~3 GB con 12 meses de retención, en lugar de que crezca sin fin.

## La regla

Se borran los archivos de una guía cuando se cumplen **todas** estas condiciones:

1. La guía está **cerrada** (`entregado` o `devuelto`). Nunca se toca una guía en ruta.
2. Se cerró hace más de **`FOTOS_RETENCION_MESES`** meses (variable de entorno; propuesta: **12**). Se mide con `pedidos.entregado`, en hora de Colombia.
3. **No tiene una diferencia de cobro sin revisar** (`dif_cobro <> 0 AND NOT dif_revisada`): esas fotos pueden hacer falta para aclarar un reclamo.
4. Su fecha de cierre ya quedó **antes del último arqueo** (`ajustes.caja.corte`), es decir, la plata de esa guía ya se contó.

Si `FOTOS_RETENCION_MESES` está vacía o en `0`, no se borra nada. Así queda apagado por defecto.

Qué se borra: todos los tipos (`salida`, `mini`, `entrega`, `firma`, `previa`). Qué **no** se borra: la guía y todos sus datos (quién recibió, valores, método, historial). Solo se va la imagen.

## Cómo

**Esquema.** Se agrega a `pedido_archivos` la columna `borrado TIMESTAMPTZ` (nula mientras exista el archivo). La fila no se elimina, para que el historial muestre que hubo foto y cuándo se borró.

```sql
ALTER TABLE pedido_archivos ADD COLUMN IF NOT EXISTS borrado TIMESTAMPTZ;
CREATE INDEX IF NOT EXISTS pedido_archivos_vigentes_idx ON pedido_archivos (guia) WHERE borrado IS NULL;
```

**Script.** `backend/db/limpiar-fotos.js` con `npm run fotos:limpiar`:

1. Busca las filas que cumplen la regla, en lotes de 500 y de la más vieja a la más nueva.
2. Con `--simular` solo imprime cuántas guías, cuántos archivos y cuántos MB se borrarían, sin tocar nada. Se corre así la primera vez.
3. Si no, borra el lote del bucket con `borrarArchivos(rutas)` de `helpers/storage.js`. Supabase acepta varias rutas por llamada.
4. Marca `borrado = now()` **solo** en las rutas que Storage confirmó, dentro de una transacción.
5. Deja una línea en `historial` por ejecución (no una por guía): "Borró N fotos de M guías cerradas antes de AAAA-MM-DD".
6. Si Storage falla a mitad de camino, se detiene. Lo ya borrado queda marcado y lo demás se intenta en la próxima ejecución, porque el proceso se puede repetir sin problema.

**Cuándo corre.** Un **Cron Job de Render** una vez al día, a las 3:00 a. m. de Colombia (`0 8 * * *` en UTC), con el mismo `DATABASE_URL` y las llaves de Supabase que el backend. No va dentro del servidor web, para que un reinicio no lo corte a mitad de camino.

**Lecturas.** `Pedido.listarArchivos` y la miniatura de `Pedido.listar` filtran `borrado IS NULL`.

**Frontend.** Si una guía cerrada no tiene fotos porque se borraron, el detalle dice "Las fotos de esta guía se borraron porque tenían más de 12 meses", en lugar de "Esta guía no tiene fotos". Para eso, `GET /pedidos/:guia/archivos` devolvería además `borradas: true`.

## Pruebas que debe tener

- No borra guías en ruta, ni recientes, ni con diferencia sin revisar, ni posteriores al último arqueo.
- `--simular` no cambia nada (ni el bucket ni la base).
- Si Storage falla en un lote, esas filas no quedan marcadas.
- Con `FOTOS_RETENCION_MESES` vacía no hace nada.
- Usar el bucket simulado de `test/archivos.test.js`.

## Antes de activarlo

- Confirmar con administración cuántos meses guardar. ¿Hay reclamos de clientes de más de un año? ¿Lo exige algún contrato?
- Correrlo con `--simular` en producción y revisar los números.
- Si se quiere conservar todo, se puede descargar el bucket como respaldo antes del primer borrado real.
