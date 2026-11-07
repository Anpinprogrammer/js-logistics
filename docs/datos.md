# Esquema de datos: Cloud Firestore

Base `(default)` · modo nativo · edición estándar · ubicación `us-east1` · proyecto `js-logistics-299ce`.

Firestore no impone un esquema: los campos de abajo son los que la app escribe hoy, sacados de `app/js/app.js` y `app/js/plataforma.js`. Convenciones:

- **Dinero:** pesos colombianos (COP) como número entero.
- **Fechas:** milisegundos desde 1970 (`Date.now()`, number). Los "días" son texto `AAAA-MM-DD` en hora de Colombia.
- **Medios de pago:** `efectivo | nequi | bancolombia`.
- **IDs:** la app los genera con `nuevoId()`, una cadena aleatoria corta. Las excepciones se indican en cada colección.
- **Saldos:** ningún saldo se guarda. Se calculan en el cliente: `saldoCliente`, `periodoMensajero`, `libroCaja`, `cajaOficina`, `resumenSemana`.

## Cuentas y permisos

| Colección / doc | ID | Campos |
|---|---|---|
| `admins/{uid}` | uid de Auth | `uid`. Que exista el documento da rol de administrador. |
| `usuarios/{uid}` | uid de Auth | `uid, email, nombre, rol (admin\|asistente\|mensajero\|cliente), clienteId? (rol cliente), creado`. Sin este documento, la cuenta no entra a la app. |
| `vinculos/{uid}` | uid de Auth | `uid, mensajeroId, fecha`. Une la cuenta con su ficha en `mensajeros`. |
| `meta/config` | fijo | `primerAdmin`. Existe desde la configuración inicial; impide crear otro primer administrador. |
| `meta/contador` | fijo | `n`: último consecutivo de guía. Solo sube de 1 en 1, en transacción. |
| `meta/caja` | fijo | `corte`: hora del último arqueo. Lo ya contado no se modifica. |

## Operación

### `pedidos/{guia}`. ID: `JS-00001` (`formatoGuia(n)`)
| Campo | Tipo | Nota |
|---|---|---|
| `guia, n` | string, number | Número consecutivo de `meta/contador`. |
| `estado` | `pendiente \| entregado \| devuelto` | |
| `creado` | ms | Salida (foto). |
| `mensajeroId` | id en `mensajeros` | |
| `mini` | string (dataURL JPEG 140 px) | Miniatura para listas. |
| `por` | uid | Quién creó la guía. |
| `clienteId, clienteNombre` | id en `clientes`, string | `""` hasta que la oficina asigna el remitente. |
| `valorServicio` | COP | Domicilio. |
| `aCobrar` | COP | Lo que el mensajero debe cobrar al destinatario. |
| `entregado` | ms \| null | Hora de entrega o de devolución. |
| `destinatario` | string | Quién recibió (obligatorio al entregar). |
| `valorCobrado, metodo, cuentaJs` | COP; `efectivo \| transf_js \| transf_cliente`; `nequi \| bancolombia` | `cuentaJs` solo si el pago fue una transferencia a JS. |
| `difCobro, difRevisada` | COP, bool | Diferencia entre lo cobrado y lo que debía cobrar. |
| `entregoUid` | uid | |
| `intentos[]` | `{fecha, motivo, nota}` | Intentos fallidos. `motivo`: `no_contesta \| direccion \| rechazo \| reprogramar \| otro`. |
| `motivoDev, notaDev, cobrarDev` | | Datos de la devolución. |
| `cambio, cambioRecibido, cambioConfirmo` | bool, ms, uid | Prenda de cambio para devolver al remitente. |
| `gasto, gastoNota` | COP, string | Flete que pagó el mensajero. |
| `domiPagado, domiPagoMedio, domiPagoValor, domiPagoFecha, domiPagoUid` | | El cliente pagó el domicilio aparte (entra a caja). |
| `fotosBorradas` | bool | Se liberaron las fotos para ahorrar espacio. |

### `fotos/{guia}` y `entregas/{guia}`
- `fotos`: `salida` (dataURL JPEG 800 px, calidad 0,5; unos 70 KB).
- `entregas`: `foto` (de la entrega o evidencia de devolución), `firma` (dataURL), `previas[]` (pruebas de entregas anteriores, guardadas al reabrir).
- Van en documentos aparte para que las listas de pedidos no descarguen las imágenes. El límite de Firestore es 1 MiB por documento.

### `clientes/{id}`
`id, nombre, telefono, tarifa` (domicilio por defecto). Para evitar repetidos, la app compara el nombre normalizado y los últimos 10 dígitos del teléfono (`parecidos()`).

### `movimientos/{id}`: cuenta de cada cliente
`id, clienteId, tipo, valor, medio, nota, fecha, porUid, porNombre`, más opcionales: `medioAntes, medioCambio` (corrección del asistente) y `reversoDe` (pago contrario).

| `tipo` | Efecto en el saldo del cliente | ¿Mueve caja? |
|---|---|---|
| `cargo` | − (queda debiendo) | no |
| `abono` | + (a favor) | no |
| `pago_de_cliente` | + | entra |
| `pago_a_cliente` | − | sale |
| `compra_cliente` | − | sale |
| `ganancia` | − (y suma al sueldo de JS) | no |

Saldo del cliente = Σ `saldoPedido(p)` de sus pedidos cerrados (lo cobrado − domicilio − flete + domicilio pagado aparte) + Σ efecto de sus movimientos. Positivo: JS le debe. Negativo: el cliente debe.

### `mensajeros/{id}`: Personal
`id, nombre, telefono, tipo (mensajero|dueno|oficina|patinador|empresa), tarifa` (pago por día para los tipos con pago fijo).

### `recaudos/{id}`: dinero que entrega un mensajero
`id, mensajeroId, valor, medio, nota, fecha, porUid, porNombre`. Si lo recibe un asistente, `porUid` es el del asistente y la plata queda en su caja de oficina.

### `liquidaciones/{mensajeroId}_{fecha}`
`id, mensajeroId, desde, fecha, dia, entregas, guias[], efectivo, base, gastos, anterior, recibidoAntes, entregaFinal, recibido, debe, adelanto, transfJs, transfCli, sueldo, enRuta`. La última liquidación abre el período siguiente: `debe` pasa como "pendiente anterior".

### `cajamovs/{id}`: caja
Campos comunes: `id, tipo, cat, valor, medio, concepto, fecha`, más `personaId` (Personal), `personaUid` (cuenta del asistente), `porUid, porNombre` y `semana` (sueldos).

| `cat` | `tipo` | Qué es | ¿Entra al libro de caja? |
|---|---|---|---|
| `inicial` | entra | Caja inicial (empalme) | sí |
| `otro_entra`, `gasto`, `arriendo`, `otro` | entra / sale | Entradas y gastos | sí |
| `base` | sale | Base para vueltos a un mensajero (con `porUid` si la dio un asistente) | sí |
| `adelanto` | sale | Adelanto de sueldo. `devuelto`: lo ya devuelto. `deLiquidacion`: viene de una liquidación (no mueve caja). | sí, salvo `deLiquidacion` |
| `devolucion` | entra | Devolución de un adelanto (`adelantoId`) | sí |
| `sueldo` | sale | Pago de sueldo (`semana`) | sí |
| `interna` | entra / sale | Cuenta interna (`cuentaId`). `inicial: true` = saldo del empalme. | sí, salvo `inicial` |
| `oficina` | base / entrega | Base al asistente y cierre de su caja (`personaUid`). `nivel: true` = ajuste de cuenta compartida. | no (solo cambia quién tiene la plata) |
| `sobrante` | entra | Efectivo de más al cerrar una caja de oficina | sí |
| `arqueo` | entra / sale / marca | Diferencias por medio y una `marca` con `esperado, contado, oficina` (`arqueoId`) | sí, salvo la marca |

### `cuentas/{id}`
`id, nombre, tipo (socio|base), creado`. Cuentas internas: JS Envíos, MT Store y Base de JS.

### `jornadas/{personaId}_{AAAA-MM-DD}`
`id, personaId, dia, valor`. Día trabajado con pago fijo. Variante `{personaId}_previo_{semana}` con `previo: true`: sueldo acumulado antes del empalme.

### Auditoría y recuperación
- `historial/{AAAA-MM-DD}_{uid}`: `dia, uid, e[]` con `{t, a (texto), u, m, r}`, máximo 1.500 entradas por documento. No se registran los cambios de `fotos`, `entregas`, `meta` ni de la propia papelera.
- `papelera/{id}`: `col, docId, data, fecha, uid, grupo`. Copia de lo borrado (pedidos, clientes, movimientos, recaudos, liquidaciones, cajamovs y mensajeros) para poder recuperarlo.
- `papelera_fotos/{id}`: igual, para las fotos y entregas de un pedido borrado.

## Reglas de seguridad

`firestore.rules`, en resumen:

- Solo entra quien tiene `usuarios/{uid}`, y ese documento solo lo crea administración. Nadie puede cambiarse su propio rol.
- **Administración:** lectura y escritura totales.
- **Oficina** (admin y asistente): lee pedidos, clientes, mensajeros y movimientos.
  - El asistente crea pagos de clientes, recaudos y bases a mensajeros a su nombre, con `fecha` dentro de ±10 minutos de la hora del servidor y medio válido; también compras, ganancias y movimientos de cuentas internas.
  - Solo cambia el medio de lo suyo, en 24 horas y antes del último arqueo (`meta/caja.corte`).
  - No borra.
- **Mensajero** (por `vinculos`):
  - Crea guías propias con campos limitados.
  - Entrega o devuelve sus pedidos pendientes, con un conjunto cerrado de campos.
  - Ya cerrado el pedido, solo corrige algunos campos durante 24 horas.
  - No toca `entregas.previas`.
  - Lee su caja, su sueldo y sus liquidaciones.
- **Cliente:** solo lee sus pedidos, sus pruebas, su cliente y sus movimientos, y puede confirmar que recibió una prenda de cambio.
- `historial`: cada persona del equipo escribe solo su documento del día. Solo administración lo lee completo.
