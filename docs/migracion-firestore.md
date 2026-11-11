# Pasar los datos de Firebase al sistema nuevo

Hay dos pasos, y los hacen dos personas distintas:

1. **Exportar** (quien tenga acceso al proyecto de Firebase `js-logistics-299ce`): saca todo Firestore y las cuentas a una carpeta de archivos.
2. **Importar** (quien maneje el backend nuevo): carga esa carpeta en Postgres y sube las fotos a Supabase Storage.

El proceso se puede repetir cuantas veces haga falta. Mientras la app vieja siga en producción, sirve para **sincronizar**: cada vez que se exporta e importa, el sistema nuevo queda igual a Firebase en ese momento.

> La carpeta exportada tiene **datos reales de clientes** (nombres, teléfonos, fotos y firmas). No la subas al repositorio ni la mandes por un chat público. Compártela comprimida, en Drive o similar, con acceso solo para la persona que importa.

---

## 1. Exportar (lo hace el dueño del proyecto de Firebase)

Necesitas Node.js 20 o más nuevo y una copia de este repositorio.

### 1.1 Sacar una llave de la cuenta de servicio

1. Entra a la [consola de Firebase](https://console.firebase.google.com/) → proyecto **js-logistics-299ce**.
2. Ve a ⚙️ **Configuración del proyecto** → pestaña **Cuentas de servicio**.
3. Toca **Generar nueva clave privada**. Se descarga un archivo `.json`.
4. Guárdalo como `backend/migracion/llave.json`. Ese nombre ya está en `.gitignore`, pero **no lo compartas con nadie**: esa llave da acceso total a Firebase.

### 1.2 Correr la exportación

```bash
cd backend/migracion
npm install
node exportar-firestore.js --credenciales ./llave.json
```

- Solo **lee**: no cambia ni borra nada en Firebase.
- Crea una carpeta `exportacion-AAAA-MM-DD-HHMM/` con un archivo por colección, las cuentas de acceso (sin contraseñas) y un `manifiesto.json` con los totales.
- Para una sincronización rápida, sin fotos ni firmas: agrega `--sin-fotos`.
- Si sale el error de la **cuota diaria** del plan gratis (50.000 lecturas por día, y cada documento cuenta una), vuelve a correrlo al otro día solo con lo que faltó: `--solo fotos,entregas,auth`.

### 1.3 Entregar la carpeta y borrar la llave

1. Comprime la carpeta y compártela en privado con quien va a importar.
2. Si ya no vas a exportar más, borra la llave: en la consola de Google Cloud → **IAM y administración** → **Cuentas de servicio** → la cuenta `firebase-adminsdk-…` → **Claves** → borra la que creaste. Borra también el archivo `llave.json` de tu computador.

---

## 2. Importar (lo hace quien maneja el backend nuevo)

Desde `backend/`, con el `.env` apuntando a la base y al Storage donde quieres los datos.

> **Nunca pruebes contra producción.** Primero haz todo en una base de pruebas, por ejemplo otro proyecto de Supabase.

```bash
cd backend
npm run db:migrar                                                    # crea o actualiza las tablas
npm run db:importar -- --carpeta ../exportacion-2026-11-08-1030 --simular
npm run db:importar -- --carpeta ../exportacion-2026-11-08-1030
npm run db:verificar -- --carpeta ../exportacion-2026-11-08-1030                  # compara con la app vieja
```

1. `--simular` hace todo dentro de una transacción y al final la deshace. Así ves cuántos registros entrarían y cuáles se omitirían, sin guardar nada ni subir fotos.
2. Sin `--simular` se guarda y se suben las fotos. Al final deja `informe-importacion.json` dentro de la carpeta, con cada registro que se omitió y el motivo.

3. `db:verificar` solo lee. Calcula con las **mismas cuentas de la app vieja** (`helpers/calculos.js`) sobre la carpeta exportada y sobre la base, y compara: cuántos registros hay de cada cosa, el saldo de cada cliente, lo que debe cada mensajero, la caja general (total y por medio), las cajas de oficina, las cuentas internas y la hora del último arqueo. Deja `verificacion-migracion.json` en la carpeta y termina con error si algo no da igual. Las diferencias que quedan casi siempre son registros que la importación omitió o corrigió por inválidos (están en `informe-importacion.json`): corrígelos en la app vieja y vuelve a exportar.

Mientras corre, muestra cada paso ("Leyendo los archivos…", "Conectando con la base de datos…") y cuántos registros guardó de cada colección, con los segundos que lleva. Los datos se escriben por lotes: unos miles de guías tardan pocos segundos. Las fotos son lo más lento, y muestra el avance cada 200 guías.

- Si se queda en **"Conectando con la base de datos…"**, revisa `DATABASE_URL_MIGRACIONES` (o `DATABASE_URL` si no la pusiste). En Supabase usa la cadena del **Session pooler** (Project Settings → Database → Connection string).
- La importación quita el límite de tiempo por consulta (`statement_timeout`) solo dentro de su propia transacción, así que el error "canceling statement due to statement timeout" ya no la corta.

Si ya habías importado antes de esta versión, corre primero `npm run db:migrar` y vuelve a importar: así los adelantos quedan unidos a su liquidación y se recuperan las notas de las jornadas (ver "Actualizar la base" en [`backend/README.md`](../backend/README.md)).

### Qué hace con cada cosa

| Firestore | Postgres | Notas |
|---|---|---|
| `mensajeros`, `clientes`, `cuentas` | mismas tablas | Mismos IDs. Una persona que se quitó en Personal pero tiene pedidos, entregas de plata, liquidaciones, jornadas o movimientos de caja se crea **inactiva** (con su nombre de la papelera): no aparece en Personal, igual que en la app, y su plata sigue contando en la caja. |
| `usuarios` + `admins` + `vinculos` + Firebase Auth | `usuarios` | El uid de Firebase es el ID. `admins` da el rol de administración y `vinculos` da la persona de Personal. Las cuentas desactivadas en Auth quedan inactivas. |
| `pedidos` (con `intentos[]` y `mini`) | `pedidos`, `pedido_intentos` | El consecutivo de guías sigue después de la última. |
| `fotos`, `entregas` (dataURL) | archivos en Storage + `pedido_archivos` | Foto de salida, miniatura, foto de entrega, firma y pruebas anteriores (`previa`). |
| `movimientos`, `recaudos`, `liquidaciones`, `cajamovs`, `jornadas` | mismas tablas | Lo de caja que no tiene columna propia (por ejemplo, la marca de arqueo) va en `cajamovs.extra`. `cajamovs.de_liquidacion` guarda el ID de la liquidación de la que salió el adelanto; `liquidaciones.guias` queda `NULL` si la liquidación vieja no tenía lista; la nota de las jornadas se conserva. |
| `meta/contador`, `meta/caja` | `contadores`, `ajustes.caja` | Hora del último arqueo. |
| `historial`, `papelera` | mismas tablas | El historial pasa de un documento por día a una fila por cambio. |
| `papelera_fotos`, `meta/config` | — | No se importan. |

Datos que la app vieja dejaba pasar y aquí se limpian (todos quedan en el informe):

- **Se omite el registro:** un movimiento de un cliente que ya no existe, una cuenta sin correo, una categoría de caja desconocida.
- **Se corrige el valor:** un valor negativo de una guía pasa a 0; un remitente que ya no existe queda vacío. Ojo: un valor negativo **cambia el saldo del cliente**. Si el informe trae "valores negativos puestos en 0", corrige esas guías en la app vieja antes del cambio (`db:verificar` muestra en qué clientes cambia el saldo).

### Contraseñas e invitaciones

Firebase no entrega las contraseñas, así que **las cuentas importadas quedan sin contraseña** (estado "Pendiente") y no pueden entrar hasta que activen su cuenta con el enlace del correo:

1. La primera cuenta de administración, por terminal y **después** de importar (si la creas antes, la cuenta de Firebase con el mismo correo se omite y su historial queda sin nombre):

   ```bash
   npm run db:admin -- --email dueno@correo.com --clave "una-clave-larga" --restablecer
   ```

2. Con esa cuenta, en **Personal → Acceso → Restablecimiento masivo**, se eligen las cuentas y se manda el correo (**máximo 100 por envío**: si son más, hazlo en varias tandas). A una cuenta sin contraseña le llega el enlace de **activación** (vale 7 días); a la persona de clientes la lleva a `jslogistics.pro/activar-cuenta`, y a la de oficina, al subdominio de la app. Necesita `RESEND_API_KEY`, el dominio verificado en Resend, `URL_CLIENTES` y `URL_EQUIPO` de producción.
3. Manda las invitaciones **solo después de la importación final**: un `--reemplazar` posterior borra los enlaces pendientes de los clientes (las contraseñas que ya crearon sí se conservan).

---

## 3. Sincronizar mientras la app vieja sigue en producción

Cada vez que quieras ponerte al día, exporta (con `--sin-fotos` es rápido) e importa con el mismo comando:

- Los registros se **insertan o actualizan** por su ID, así que lo que cambió en Firebase se actualiza aquí.
- Las fotos que ya se subieron no se vuelven a subir: el nombre del archivo incluye un resumen de su contenido.
- Lo que se **borró** en Firebase no se borra aquí. Para eso usa `--reemplazar --si`:
  - Vacía las tablas y vuelve a cargar todo.
  - Conserva las cuentas de oficina y mensajeros con la contraseña que ya les pusiste en el sistema nuevo.
  - Las cuentas de clientes se vuelven a crear con la contraseña que ya hayan creado en el sistema nuevo (los enlaces pendientes sí se pierden).
  - Las fotos que ya estaban en Storage no se vuelven a subir: solo se anotan otra vez.

> Mientras se sincroniza, **el sistema nuevo no se usa para operar**: Firebase es la fuente de verdad, y una importación pisa lo que se haya cambiado aquí.

## 4. El día del cambio

El plan completo, con el ensayo, los tiempos y cómo devolverse, está en [`docs/plan-migracion-16-nov.md`](plan-migracion-16-nov.md). En resumen:

1. **Antes (ensayo):** exporta completo, importa en una base de pruebas con `--simular`, después de verdad, y corre `db:verificar`. Corrige en la app vieja lo que salga en el informe y repite hasta que la verificación dé igual.
2. **Uno o dos días antes:** importa todo, con fotos, en la base de **producción**. Así el día del cambio las fotos ya están en Storage y no se vuelven a subir.
3. **El día:** avisa al equipo y desde ese momento nadie registra nada en la app vieja. Respaldo de la base de producción (`pg_dump`), exportación completa, `db:migrar`, importación con `--simular` y luego con `--reemplazar --si`, y `db:verificar`. Si da igual, contraseña de administración, invitaciones y cambio de dominios.
4. **Si algo no cuadra:** no cambies los dominios. La app vieja sigue intacta (la exportación solo lee): se vuelve a habilitar y se intenta otro día.
5. La app vieja queda solo para consulta hasta que se retire, en un PR aparte. Guarda la carpeta exportada como respaldo, fuera del repositorio.
