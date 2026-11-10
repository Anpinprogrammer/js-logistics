# Cómo implementar la animación de entrada en la app (para el agente)

> **Estado: implementada** en `frontend/src/pages/intro/` (ver la decisión 15 de `docs/ESTADO.md`). Este documento queda como referencia de las reglas, la línea de tiempo y la forma de compararla con los videos. Una diferencia con lo sugerido abajo: en vez de componentes `motion` con `delay`, la app usa un solo reloj y evalúa las mismas fórmulas de `src/Intro.tsx` cuadro a cuadro, porque así queda idéntica al video.

Este documento es para el agente de IA (opencode u otro) que va a llevar la animación de esta carpeta a la app de oficina y mensajeros. El dueño **ya aprobó** los videos de `referencia/`. El trabajo es reproducirlos en `frontend/` con Framer Motion, **sin cambiar cómo queda el ingreso al final**.

Antes de empezar, lee `CLAUDE.md` (raíz), `docs/ESTADO.md` (en especial las decisiones 1, 2 y 6) y `frontend/CLAUDE.md`. Ellos mandan si algo de aquí choca con ellos. Si hay una contradicción que no puedes resolver, pregúntale a la persona.

## 1. Qué hay que lograr

- Al abrir el ingreso (`frontend/src/pages/Ingreso.tsx`), se ve la animación de `src/Intro.tsx` y termina **en 4 s como máximo**, en el estado exacto que hoy tiene la pantalla.
- Mientras tanto la persona ya puede escribir: el formulario es el real desde el primer cuadro, no una imagen ni un video.
- El resultado se debe ver igual a `referencia/ingreso-computador.mp4` (1440×900) y a `referencia/ingreso-celular.mp4` (390×844). No vale incrustar el video en la app: se construye con componentes.

## 2. Reglas que no se negocian

1. **El último cuadro es el ingreso actual.** No cambies clases, colores, tamaños ni textos de `Ingreso.tsx` ni de `AccesoComun.tsx` en su estado final. Compara capturas antes y después (punto 7).
2. **Solo en Ingreso.** `Recuperar.tsx` y `Restablecer.tsx` usan el mismo `MarcoAcceso` y deben seguir **sin** animación de entrada. Si tocas `MarcoAcceso`, hazlo con una prop opcional (por ejemplo `intro?: ControlIntro`) que por defecto no cambie nada.
3. **Se puede saltar.** Un clic, un toque, una tecla o el foco en un campo terminan la animación al instante: todo salta a su estado final, sin parpadeo.
4. **En cada carga del login.** La animación debe salir cada vez que se recarga el formulario de ingreso; no se guarda bandera de sesión. No guardes nada en el navegador: ninguna sesión ni token.
5. **Respeta "reducir movimiento".** Con `useReducedMotion()` en `true` no hay animación de entrada, y las animaciones `jsl-*` de `index.css` siguen apagadas como hoy.
6. **Accesible.** Todo lo decorativo (mensajeros, destello, onda, chispas, telemetría, la barra "CARGANDO RUTA", la marca blanca) va con `aria-hidden` y `pointer-events: none`. El botón real `Ingresar` existe desde el inicio para los lectores de pantalla y el teclado; la barra solo lo tapa a la vista mientras carga. No muevas el foco ni pongas `autoFocus`.
7. **No bloquea el ingreso.** Si la persona envía el formulario antes de que termine, se salta la animación y el envío sigue normal (`BotonAcceso` muestra "Ingresando…").
8. **Rendimiento en el celular.** El mensajero entra desde celulares modestos. Anima solo `transform`, `opacity` y `clip-path`, y SVG (`pathLength`, `offset-distance`). Los `filter: blur()` animados (letras del título, tajos) son lo primero que se quita si en un celular de gama baja hay tirones: en ese caso deja solo `opacity` y `y`. No animes `backdrop-filter`: la tarjeta tiene el desenfoque fijo y se revela con `clip-path`.
9. **Sin desbordes laterales.** La onda, las chispas y el destello van dentro de un contenedor `fixed inset-0 overflow-hidden`. Revisa a 320, 360 y 390 px que no aparezca scroll horizontal.

## 3. Dependencia

Agrega **`motion`** (el paquete actual de Framer Motion, compatible con React 19) en `frontend/package.json`, con versión exacta, y en el PR explica para qué es (lo pide `frontend/CLAUDE.md`). Se importa desde `motion/react`: `motion`, `useAnimate`, `useReducedMotion`, `AnimatePresence`.

Para que no pese en el resto de la app:
- Usa la animación solo dentro del módulo diferido de `Ingreso` (ya se carga aparte con `perezoso()`).
- Usa `LazyMotion` con `domAnimation` y el componente `m` en vez de `motion` si el peso del módulo del ingreso sube más de ~35 kB gzip. Mídelo con `npm run build` antes y después y anótalo en el PR.

## 4. Estructura sugerida

```
frontend/src/pages/
  Ingreso.tsx                 decide si hay intro (cada carga + reducir movimiento) y la monta
  AccesoComun.tsx             MarcoAcceso, CabeceraAcceso y BotonAcceso aceptan una prop opcional de intro
  intro/
    useIntroIngreso.ts        reloj de la intro: inicia, salta y marca como vista
    tiempos.ts                la línea de tiempo de la sección 5, en segundos
    CapaIntro.tsx             mensajeros, destello, onda, chispas, telemetría y marca blanca (todo aria-hidden)
```

`useIntroIngreso()` devuelve `{ activa, saltar }`. Lo más simple es animar cada pieza con `motion` y `transition.delay` sacado de `tiempos.ts`. Para saltar, cambia una clave de estado que vuelva a pintar todo con `initial={false}` (va directo al final), o usa `useAnimate` y pon cada control en `.complete()`. Al terminar los 4 s o al saltar, desmonta `CapaIntro` y deja el ingreso normal.

**Posiciones:** en Remotion las rutas de los mensajeros están en coordenadas fijas (`L.rutas`). En la app, mide el centro del badge con `getBoundingClientRect()` (en un `useLayoutEffect`) y arma las dos curvas con relación a ese punto y al tamaño de la ventana, imitando la forma de `ESCRITORIO.rutas` (ventanas de 800 px o más) y `CELULAR.rutas` (menos de 800 px). La cabeza del mensajero puede ir con CSS `offset-path: path(...)` y animar `offset-distance` de `0%` a `100%`. La estela es el mismo `path` con `pathLength` animado.

## 5. Línea de tiempo (segundos)

Sale de `src/Intro.tsx` (60 fps: cuadro / 60). `COLISION` = 0,967 s y `T0` = 1,933 s. "Resorte s/d" = `{ type: "spring", stiffness: s, damping: d }`. Las curvas `[a, b, c, d]` son `ease` cúbicas de Framer Motion.

| Pieza | Empieza | Termina | Qué hace | Curva |
|---|---|---|---|---|
| Fondo | 0,967 | 1,80 | color `#03060a` → `#0b0f19` y la viñeta se abre | easeOut |
| Cámara | 0 | 1,33 | `scale` 1,12 → 1 con origen en el centro del badge | `[0.65, 0, 0.25, 1]` |
| Temblor | 0,967 | 1,20 | `x`/`y` aleatorios de ±5 px que bajan a 0 | lineal |
| Telemetría | 0,10 | 1,23 | aparece, escribe la línea 1 (0,13→0,50) y la 2 (0,37→0,73), y se va desde 0,967 | lineal |
| Mensajero 1 / 2 | 0,05 / 0,10 | 0,967 | recorren su ruta con estela (38 % del largo); paradas al 30 % y al 62 % con anillo de 4→26 px | `[0.4, 0, 0.7, 0.95]` |
| Destello | 0,933 | 1,40 | círculo blanco→cian, radio 40→560 px (360 en celular), opacidad 1→0, `mix-blend-mode: screen` | easeOut |
| Onda | 0,967 | 2,13 | anillo de radio 0 → 1,1 × diagonal; detrás revela la malla (máscara radial) con un borde brillante | easeOut |
| Chispas | 0,967 | 1,73 | 22 rayitas desde el choque, 90–350 px, se apagan | easeOut |
| Rutas del fondo | 0,17 | 1,50 | opacidad 0 → 0,5 (después siguen con `jsl-ruta`) | lineal |
| Nodos del fondo | 1,13 + i·0,1 | +0,23 | crecen de 0 al radio normal | backOut |
| Manchas de luz | 0,967 | 2,47 | opacidad 0 → 1 | lineal |
| Marca blanca | 0,967 | — | `scale` 0 → 2,3 × badge (2,1 en celular) | resorte 340/17 |
| Tajos de luz | 1,03 | 1,47 | tres franjas cian a 35° cruzan la marca (enmascaradas por ella) | easeInOut |
| Marca se encoge | 1,567 | — | de 2,3 × badge al tamaño interno del badge | resorte 200/20 |
| Marca blanca se va | 1,70 | 1,97 | opacidad 1 → 0 | easeOut |
| Placa del badge | 1,60 | — | `scale` 0 → 1 y `rotate` −18° → 0, con su halo | resorte 280/16 |
| Ícono del badge | 1,70 | 1,97 | opacidad 0 → 1 | easeOut |
| Trazo del borde | 1,067 | 1,733 | dos trazos desde arriba al centro hasta abajo al centro, uno por lado, con punta blanca | `[0.65, 0, 0.25, 1]` |
| Trazo se va | 1,733 | 2,167 | opacidad 1 → 0 | lineal |
| Borde degradado | 1,633 | 2,133 | opacidad 0 → 0,7 (su valor final) | lineal |
| Halo de la tarjeta | 1,633 | 2,633 | opacidad 0 → 1 | lineal |
| Vidrio de la tarjeta | 1,533 | 2,30 | `clip-path: circle(0% → 170% at 50% 0%)` | `[0.65, 0, 0.25, 1]` |
| Tarjeta | 1,533 | — | `scale` 0,965 → 1 | resorte 160/20 |
| "LOGISTICS · CALI" | 1,933 | 2,50 | `letter-spacing` 1,4em → 0,32em, opacidad 0 → 1, blur 4 → 0 | `[0.65, 0, 0.25, 1]` |
| "JS Logistics" | 2,033 + i·0,037 | — | por letra: `y` 30 → 0, `rotate` ±8° → 0, blur 10 → 0, opacidad | resorte 320/19 |
| Descripción | 2,30 | 2,70 | `y` 10 → 0 y opacidad | easeOut |
| Campo correo / contraseña | 2,433 / 2,583 | — | etiqueta y campo: `y` 26 → 0 y opacidad | resorte 240/20 |
| Escáner del campo | 2,567 / 2,717 | +0,53 | franja de luz que cruza el campo de izquierda a derecha | easeInOut |
| Barra "CARGANDO RUTA" | 2,50 | 3,30 | ancho 0 → 100 %, alto 4 px, con punta brillante y porcentaje | `[0.3, 0, 0.2, 1]` |
| Barra → botón | 3,30 | — | alto 4 px → alto del botón, radio 2 → 12 px; al final es `BotonAcceso` | resorte 300/19 |
| Texto "Ingresar →" | 3,40 | 3,63 | `y` 8 → 0 y opacidad; la flecha llega desde −10 px | easeOut |
| Brillo del botón | 3,567 | 4,00 | el mismo barrido blanco del hover, una vez | easeInOut |
| "¿Olvidaste tu contraseña?" | 3,467 | 3,767 | opacidad 0 → 1 | easeOut |

Valores exactos (colores, sombras, radios, tamaños): cópialos de `src/Intro.tsx`. Cada pieza tiene un comentario que dice qué es.

## 6. Detalles fáciles de perder

- La marca blanca es `public/marca-blanca.png` de esta carpeta. Cópiala a `frontend/public/marca-blanca.png` y, de ser posible, conviértela a WebP. El ícono del badge sigue siendo `/icono-96.webp`, recortado como hoy (decisión 1 de `docs/ESTADO.md`).
- La malla del fondo existe desde el inicio, pero escondida con una máscara radial que crece con la onda. Al terminar, quita esa máscara para que quede exactamente la de hoy.
- La telemetría y "CARGANDO RUTA" usan `ui-monospace, Menlo, monospace`. No agregues una fuente nueva.
- El temblor y las chispas usan números aleatorios: genéralos una sola vez (con `useMemo` o una semilla fija), no en cada render.
- Las piezas de la intro no deben cambiar el tamaño de la tarjeta ni mover el layout. Todo lo que no es formulario va en una capa absoluta encima.

## 7. Cómo probarlo antes del PR

1. `cd frontend && npm run typecheck && npm run build`. Anota en el PR el peso del módulo del ingreso antes y después.
2. Levanta `npm run dev` y abre `http://localhost:5173/` a 1440×900 y a 390×844; recarga para comprobar que la intro sale en cada carga.
3. Con Playwright (o Puppeteer, como dice `docs/ESTADO.md`), toma capturas a 0,5 s, 1,0 s, 1,5 s, 2,0 s, 2,5 s, 3,0 s y 4,2 s, y compáralas con los mismos instantes de los videos de `referencia/`. Para sacar un cuadro del video: `ffmpeg -ss 1.5 -i referencia/ingreso-computador.mp4 -frames:v 1 ref-1.5.png`.
4. La captura de 4,2 s debe ser igual a la del ingreso de hoy (rama `main`), salvo las animaciones de fondo que ya se mueven solas.
5. Comprueba que se puede saltar con un clic, con Tab y escribiendo en un campo; que al recargar en la misma pestaña ya no sale; que con "reducir movimiento" (`page.emulateMedia({ reducedMotion: "reduce" })`) no sale; y que Recuperar y Restablecer no la tienen.
6. Revisa 320, 360 y 390 px sin scroll horizontal: `document.documentElement.scrollWidth <= innerWidth`.
7. Si puedes, pruébalo en un celular real o con la CPU limitada ×4 en Chrome DevTools, y quita los `blur` animados si se ve a tirones.

## 8. Entrega

- Rama `feat/animacion-ingreso` desde `main` y PR contra `main`. Nunca push directo a `main`.
- Commits en español, por ejemplo `Ingreso: animación de entrada "La ruta de entrega"`.
- En el PR: qué cambió, cómo lo probaste (con las capturas comparadas con la referencia) y el peso del módulo.
- En el mismo PR, en `docs/ESTADO.md`: agrega una decisión (dónde vive la intro, que sale en cada carga, que se salta y que no sale con "reducir movimiento") y una línea en el registro de sesiones.
- No toques el sistema viejo (`app/`, Firebase) ni el portal de clientes (`jslogistics-cliente-frontend`): su login es otro y no entra en este cambio.
- No borres esta carpeta: queda como referencia por si hay que ajustar la animación.
