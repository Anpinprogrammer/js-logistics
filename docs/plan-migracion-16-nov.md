# Plan de migración: lunes 16 de noviembre de 2026

Paso a paso para pasar de Firebase (app vieja) a Supabase (sistema nuevo). Los comandos y el detalle de cada script están en [`migracion-firestore.md`](migracion-firestore.md). Todos los comandos del backend se corren desde `backend/`.

> **Nunca** se prueba contra producción. Los ensayos van en otra base (otro proyecto de Supabase o un Postgres local). La carpeta exportada tiene datos reales: no va al repositorio ni a un chat público.

## Antes de empezar (miércoles 11 y jueves 12)

1. Unir los PR de esta revisión en `js-logistics` (importación y verificación) y en `jslogistics-cliente-frontend` (pantalla `/activar-cuenta`), y desplegarlos.
2. Tener a mano:
   - la llave de la cuenta de servicio de Firebase (`backend/migracion/llave.json`), solo en el computador de quien exporta;
   - un `.env` para el **ensayo** (base de pruebas + un bucket de Storage de pruebas) y otro para **producción**, con `DATABASE_URL` del **Session pooler** (puerto 5432);
   - en Render: `RESEND_API_KEY` con el dominio verificado, `URL_CLIENTES=https://jslogistics.pro`, `URL_EQUIPO` con el subdominio de la oficina, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` y `STORAGE_BUCKET`.
3. Bajar el TTL del DNS de los dominios a 5 minutos, para que el cambio (y una vuelta atrás) se note rápido.

## Ensayo 1 (jueves 12)

```bash
# quien tiene acceso a Firebase
cd backend/migracion && npm install && node exportar-firestore.js --credenciales ./llave.json

# contra la base de ENSAYO
cd backend
npm run db:migrar
npm run db:importar -- --carpeta ../exportacion-… --simular
npm run db:importar -- --carpeta ../exportacion-…
npm run db:verificar -- --carpeta ../exportacion-…
```

Anota:
- **Cuántos documentos leyó la exportación** (`manifiesto.json`). El plan gratis de Firebase da 50.000 lecturas por día y cada documento cuenta una. Si la exportación completa pasa de unas 40.000, el lunes no alcanza: activa el plan Blaze ese día (cuesta centavos de dólar) o exporta en dos días con `--solo`.
- **Cuánto tarda** cada paso, sobre todo las fotos.
- **Qué sale en `informe-importacion.json`** y en la verificación.

Qué hacer con lo que salga:

| Aviso | Qué hacer |
|---|---|
| `valores negativos puestos en 0` | Cambia el saldo del cliente. Corregir esas guías en la app vieja. |
| `cliente que no existe` (movimientos) | Cambia la caja. Revisar en la app vieja si ese cliente se unió con otro y mover el movimiento. |
| `categoría desconocida` (caja) | Cambia la caja. Revisar qué es y corregirlo en la app vieja. |
| `el correo ya lo usa otra cuenta` | Dos cuentas con el mismo correo en Firebase: dejar una. |
| `persona quitada… queda inactiva` | Normal: conserva la plata de quien ya no trabaja. No hay que hacer nada. |
| `cerrada sin hora de entrega` | Se usó la hora de salida. Revisar si importa. |

## Ensayo 2 (viernes 13)

Con lo corregido, repetir todo en la base de ensayo **desde cero** y comprobar:
1. `db:verificar` dice **"Todo da igual"** (o solo diferencias que ya se revisaron y se aceptaron por escrito).
2. Entrar con `npm run db:admin -- --email <tu correo> --clave … --restablecer` y revisar: algunas guías, el saldo de 3 o 4 clientes conocidos, la caja del día, lo pendiente de cada mensajero y una foto de entrega.
3. Mandarte a ti mismo una invitación desde **Restablecimiento masivo** y activar la cuenta en `/activar-cuenta`.

## Precarga en producción (sábado 14 o domingo 15)

La app vieja sigue funcionando. Esto solo adelanta lo lento (las fotos):

```bash
pg_dump "$DATABASE_URL" > respaldo-antes-de-precarga.sql   # si la base de producción ya tenía algo
npm run db:migrar
npm run db:importar -- --carpeta ../exportacion-… --simular
npm run db:importar -- --carpeta ../exportacion-… --reemplazar --si
npm run db:verificar -- --carpeta ../exportacion-…
```

No mandes invitaciones todavía y no le pongas contraseña a nadie salvo a administración.

## El lunes 16

Hora de Colombia. Los tiempos son de ejemplo: ajústalos con lo que tardó el ensayo.

| Hora | Paso | Quién |
|---|---|---|
| 6:00 | Avisar al equipo: desde ya nadie registra nada en la app vieja hasta nuevo aviso. | Administración |
| 6:05 | Respaldo de producción: `pg_dump "$DATABASE_URL" > respaldo-16-nov-antes.sql` | Backend |
| 6:10 | Exportación completa, con fotos. | Dueño de Firebase |
| 6:40 | `db:migrar` → `db:importar --simular` → revisar el informe | Backend |
| 6:50 | `db:importar --reemplazar --si` (las fotos ya subidas no se repiten) | Backend |
| 7:10 | `db:verificar`. **Punto de decisión** (abajo). | Backend + administración |
| 7:20 | Contraseña de administración (`db:admin … --restablecer`), revisión rápida en la app nueva. | Administración |
| 7:30 | Cambiar los dominios hacia Render/Vercel. | Backend |
| 7:40 | Invitaciones: primero el equipo de oficina y los mensajeros, después los clientes (de a 100). | Administración |
| 8:00 | El equipo empieza a operar en la app nueva. | Todos |

### Punto de decisión (7:10)

Se sigue solo si:
- `db:verificar` dice "Todo da igual", o las únicas diferencias son las que ya se aceptaron en el ensayo;
- la caja total, el saldo de 3 o 4 clientes conocidos y lo que debe cada mensajero se ven iguales en las dos apps.

Si no se cumple, **no se cambian los dominios**: se avisa al equipo que sigue en la app vieja y se intenta otro día.

## Cómo devolverse

- **Antes de cambiar los dominios:** no hay nada que deshacer. La exportación solo lee, así que Firebase queda igual. Se le avisa al equipo y sigue en la app vieja.
- **Después de cambiar los dominios, el mismo lunes:** se vuelven a apuntar los dominios a Firebase Hosting y se avisa al equipo. Todo lo que se haya registrado en la app nueva hay que pasarlo a mano a la app vieja: se saca del **Historial** de la app nueva. Por eso conviene decidir antes de las 12:00.
- **Si se dañó la base de producción:** `psql "$DATABASE_URL" < respaldo-16-nov-antes.sql` (en una base vacía) y volver a importar.
- La carpeta exportada del lunes y los respaldos se guardan fuera del repositorio, en un lugar privado.

## Después del cambio

- La app vieja queda solo para consulta. Se retira en un PR aparte, cuando los saldos lleven unos días cuadrando.
- Revisar en Accesos quién sigue "Pendiente" a los 3 días y reenviarle la invitación (vence a los 7).
- Borrar la llave de la cuenta de servicio de Firebase (ver `migracion-firestore.md`, paso 1.3).
