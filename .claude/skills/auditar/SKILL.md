---
name: auditar
description: Revisa los datos reales de JS Logistics (pedidos incompletos, caja y arqueos, cajas de oficina, mensajeros, patinadores, liquidaciones, sueldos, clientes repetidos o incompletos, espacio y lecturas) y le da a Javier un informe con lo que está bien, lo que hay que corregir y en qué orden. Úsalo cuando Javier pida "auditar", "/auditar", "revisa cómo va el sistema" o "¿está todo bien?".
---

# Auditar JS Logistics

Es una revisión de **solo lectura**: no escribas, borres ni corrijas datos durante la auditoría. Si encuentras algo que corregir, propónlo al final y espera el sí de Javier.

## 1. Abrir la app con los datos reales
- Si `curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:5173/` no responde 200, levanta el servidor en segundo plano: `python3 -m http.server 5173 --bind 127.0.0.1 --directory app` desde `~/Proyectos/js-logistics`.
- Abre `http://localhost:5173/` en el navegador integrado. Esa ventana ya tiene la sesión de administrador de Javier. Si pide iniciar sesión, pídele a Javier que entre él: nunca escribas su contraseña.
- Para cargar la versión más reciente de la app: `await fetch("/js/app.js",{cache:"reload"}); location.reload()`.

## 2. Correr la revisión
Pega el contenido de `revision.js` (en esta misma carpeta) en `javascript_tool`. Devuelve un JSON con: pedidos, caja, mensajeros, patinadores, liquidaciones, sueldos, clientes y capacidad.

Si algo se ve raro, investígalo con más lecturas antes de concluir. Por ejemplo:
- Un arqueo con sobrante o faltante: compara `esperado`, `contado` y la caja de oficina en `S.cajamovs[arqueo.id].oficina`, y mira qué se registró antes y después del arqueo.
- Un sobrante en una caja de oficina: revisa sus movimientos del día con `cajaOficina(uid).L`.

Los **patinadores** anotan en su caja lo que les pagan los clientes y se lo van entregando a la oficina durante el día, igual que los mensajeros. Esa caja existe solo en el sistema nuevo (API `GET /patinador/resumen`), así que la sección `patinadores` trae datos cuando la app abierta es la nueva (con backend y sesión de administración o asistente); en la app vieja de Firebase sale `disponible:false`: dilo en el informe en vez de dar por buena la caja de los patinadores. Para revisarla a mano: Caja → Patinadores.

## 3. Qué mirar y cómo juzgarlo
- **Urgente:** descuadres de arqueo sin explicar; sobrantes de oficina en Nequi o Bancolombia (son cuentas compartidas, así que no deberían existir); sueldos negativos; pedidos con remitente borrado; transferencias sin cuenta asignada.
- **Hacer hoy:** pedidos sin remitente o sin domicilio; mensajeros con plata sin entregar de días anteriores; patinadores con plata sin entregar de días anteriores (`debeDeDiasAnteriores` mayor a 0: Caja → Cierre del día → paso 2); cajas de oficina sin cierre; pedidos en ruta de días anteriores; diferencias de cobro sin revisar.
- **Revisar:** un patinador con `debe` negativo entregó de más (puede ser una entrega mal escrita o un pago sin anotar en su caja: míralo en Caja → Patinadores → Dinero recibido).
- **Mejorar:** clientes repetidos o sin celular; clientes con pedidos pero sin domicilio guardado; liquidaciones dobles.
- **Capacidad:** espacio (plan gratis de 1 GB) y documentos que lee la oficina al abrir la app (cupo gratis de 50.000 lecturas al día). Avisa si quedan menos de 30 días de espacio o si caben menos de 15 aperturas diarias.

## 4. Informe para Javier
En español sencillo, con cifras concretas y nombres:
1. **Veredicto** en una línea: si el sistema está bien y pueden seguir así.
2. **Lo que funciona bien**, en pocas viñetas.
3. **Fallas y pendientes**, en orden de prioridad, con qué hacer y dónde se hace en la app (por ejemplo: Caja → Cierre del día → paso 4, o paso 2 si es plata de un patinador).
4. **Capacidad**, con la fecha estimada en que se llena.
5. Si hay algo que tú puedes corregir, ofrécelo en una sola pregunta.
