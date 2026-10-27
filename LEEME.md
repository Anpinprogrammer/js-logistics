# JS Logistics

App de pedidos, entregas, caja, liquidaciones, sueldos y recibos de JS Logistics.
Funciona en el navegador y se puede instalar en el celular como una app (sin pasar por la tienda de apps).

## Qué hay en esta carpeta

| Archivo o carpeta | Qué es |
|---|---|
| `app/` | El código de la app: lo que se publica |
| `app/index.html` | La página principal (solo la estructura) |
| `app/css/estilos.css` | Colores, tipografía y diseño |
| `app/js/app.js` | Pantallas y cálculos: pedidos, caja, liquidaciones, recibos, sueldos… |
| `app/js/plataforma.js` | Conexión con Firebase: ingreso, base de datos y descargas |
| `app/js/firebase-config.js` | Los datos de tu proyecto de Firebase (lo llenas una vez) |
| `app/sw.js`, `app/manifest.webmanifest` | Permiten instalar la app en el celular y que abra sin señal |
| `firestore.rules` | Reglas de seguridad: quién puede ver y cambiar qué |
| `firebase.json` | Configuración para publicar en Firebase |
| `datos-migracion/datos.json` | Los datos que había en la versión de claude.ai (27-oct-2026) |
| `original/index-claude.html` | La versión original de un solo archivo, por si acaso |
| `respaldo-js-logistics-2026-10-27.zip` | El respaldo que se tomó antes de la migración |
| `iniciar-local.command` | Doble clic para abrir la app en tu Mac |

## Probarla en tu Mac

Doble clic en `iniciar-local.command`. Se abre `http://localhost:5173`.
La primera vez, macOS puede pedir permiso: clic derecho → Abrir.

Mientras `firebase-config.js` esté vacío, la app abre en **modo de prueba**: funciona completa,
pero los datos se borran al cerrar.

## Ponerla a funcionar con datos reales (una sola vez)

1. **Crear el proyecto.** Entra a https://console.firebase.google.com con tu cuenta de Google →
   "Crear un proyecto" → nombre `js-logistics`. Google Analytics no hace falta.
2. **Activar el ingreso.** Menú Compilación → Authentication → Comenzar →
   "Correo electrónico/contraseña" → Habilitar → Guardar.
3. **Crear la base de datos.** Compilación → Firestore Database → Crear base de datos →
   ubicación `us-east1` (Carolina del Sur: la de menor demora desde Colombia) → "Modo de producción".
   La ubicación no se puede cambiar después.
4. **Poner las reglas de seguridad.** En Firestore → pestaña Reglas, borra lo que hay,
   pega todo el contenido de `firestore.rules` y toca Publicar.
5. **Registrar la app web.** Configuración del proyecto (engranaje) → Tus apps → ícono `</>` →
   nombre `JS Logistics` → Registrar. Copia los valores de `firebaseConfig` y pégalos en
   `app/js/firebase-config.js`.
6. **Crear tu cuenta de administrador.** Abre la app → "Configuración inicial" → tu nombre, correo
   y contraseña. Esto solo funciona una vez; después ese enlace ya no deja crear más administradores.
7. **Pasar los datos anteriores.** Administración → Más → Respaldo y espacio → Importar datos →
   elige `datos-migracion/datos.json`.
8. **Crear los accesos de los mensajeros.** Administración → Más → Personal → Accesos a la app.
   Eliges su nombre de Personal, escribes su correo y una contraseña inicial, y se la entregas.

## Publicarla en internet

Para que los mensajeros la abran desde su celular hay que publicarla. Firebase Hosting es gratis
y da una dirección tipo `https://js-logistics.web.app`. Se necesita instalar Node.js
(https://nodejs.org, versión LTS) y luego, en la Terminal, dentro de esta carpeta:

```bash
npm install -g firebase-tools
firebase login
firebase use --add
firebase deploy
```

`firebase deploy` publica la app y también las reglas de seguridad.

En el celular: abre la dirección en Chrome (Android) o Safari (iPhone) → menú → "Agregar a la
pantalla de inicio". Queda como una app con su ícono.

## Roles

| Rol | Qué puede hacer |
|---|---|
| Mensajero | Sus pedidos (crear, entregar, devolver), su caja y su sueldo. No ve clientes ni datos de otros. |
| Asistente | Solo "Oficina": Pedidos (asignar remitente y valores, también de pedidos entregados; tomar la foto de pedidos que quedan a cargo de la Oficina y marcarlos entregados), registrar y editar clientes, ver saldos y enviar recibos por WhatsApp. No ve Caja, Sueldos, Personal, Historial ni Respaldo; no borra nada ni registra pagos. |
| Administración | Todo. |

En Personal, el **tipo** define cómo se paga a cada persona:
mensajero (70% de sus domicilios − 25.000 al día), dueño, **oficina** (sus pedidos son 100% de JS y
suman al sueldo del dueño; si quieres llevar ahí el pago de la persona de oficina, ponle pago por día),
patinador y empresa (fijo por día). Para que Oficina → Pedidos muestre el botón de foto, crea en Personal
una entrada de tipo Oficina (JS), por ejemplo "Oficina".

El rol se cambia en Más → Personal → Accesos a la app. Las reglas de `firestore.rules` hacen cumplir
estos permisos en el servidor: aunque alguien modifique la app, no puede leer lo que su rol no permite.

## Bueno saber

- **Costo:** el plan gratis de Firebase (Spark) alcanza de sobra para este volumen.
  Las fotos se guardan comprimidas dentro de la base de datos, así que no hace falta el plan de pago.
- **Quitar un acceso** (Personal → Accesos) impide que esa cuenta entre a la app. La cuenta sigue
  existiendo en Firebase → Authentication; desde ahí se puede borrar del todo si quieres.
- **Cambiar la contraseña de alguien:** botón "Cambiar contraseña"; le llega un correo con un enlace.
- **Copia de seguridad:** Más → Respaldo → "Descargar copia completa" (Excel). Hazla cada semana.
