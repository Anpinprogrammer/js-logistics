# Animación de entrada del ingreso ("La ruta de entrega")

Proyecto de [Remotion](https://www.remotion.dev/) con la animación que el dueño aprobó para la pantalla de ingreso de la oficina y los mensajeros (`frontend/src/pages/Ingreso.tsx`). Dura **4 segundos**, y su último cuadro es igual al ingreso actual.

Esta carpeta es **solo la referencia visual**: no se despliega y la app no la importa. Para pasarla a la app, sigue [`IMPLEMENTAR.md`](IMPLEMENTAR.md).

## Qué pasa en los 4 segundos

1. **Despacho (0 a 1 s):** fondo casi negro. Dos mensajeros de luz cruzan la ciudad con su estela y encienden paradas de entrega. Abajo a la izquierda se escribe una telemetría ("CALI · 3.4516° N · 76.5320° W", "DESPACHANDO 2 RUTAS…").
2. **Entrega (≈1 s):** los dos mensajeros chocan donde va el logo. Hay un destello, un temblor corto y una onda que revela la malla del fondo. La marca "JS" nace en blanco, cruzada por tres tajos de luz.
3. **Ensamblaje (1 a 2,5 s):** un trazo de luz dibuja el borde de la tarjeta en los dos sentidos, el vidrio se llena desde arriba y la marca se encoge y cae en su placa blanca.
4. **Listo (2 a 4 s):** "LOGISTICS · CALI" se cierra, "JS Logistics" entra letra por letra, los campos suben con un escáner de luz, y una barra "CARGANDO RUTA 0→100%" se abre y se convierte en el botón **Ingresar →**.

## Archivos

| Archivo | Qué es |
|---|---|
| `src/Intro.tsx` | Toda la animación. `ESCRITORIO` (1440×900) y `CELULAR` (390×844) tienen las medidas reales del ingreso. |
| `src/Root.tsx` | Las dos composiciones: `Escritorio` y `Celular` (60 fps, 240 cuadros). |
| `public/` | Logo del badge (`icono-96.png`), la marca en blanco recortada de `logo.png` del portal de clientes (`marca-blanca.png`) y Poppins local (licencia OFL), para poder renderizar sin conexión. |
| `referencia/` | Los dos videos aprobados (computador 2160×1350 y celular 780×1688). |

## Comandos

```bash
cd animacion-ingreso
npm install
npm run estudio            # abre Remotion Studio para ver y ajustar cuadro por cuadro
npm run render             # renderiza los dos videos en videos/ (carpeta ignorada por git)
npm run cuadro -- --frame=120   # saca un cuadro suelto en PNG
```

Si Remotion no puede descargar su navegador (por ejemplo, detrás de un proxy), pásale uno instalado con `--browser-executable=/ruta/a/chrome-headless-shell`.

Las curvas son los resortes de **Framer Motion** (`spring` de `framer-motion`), evaluados cuadro a cuadro para que el render sea exacto. En la app, un `transition={{ type: "spring", stiffness, damping }}` con los mismos números da el mismo movimiento.
