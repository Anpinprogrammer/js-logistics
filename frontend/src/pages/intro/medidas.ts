/* Mide el ingreso real para que la animación caiga exactamente sobre él, en cualquier tamaño de pantalla. */

export type Caja = { x: number; y: number; w: number; h: number };
export type Trayecto = { d: string; largo: number; punto: (l: number) => { x: number; y: number } };

export type Medidas = {
  /** Tamaño del marco (la ventana). */
  W: number; H: number;
  /** Pantalla angosta: usa los valores del video de celular. */
  chico: boolean;
  /** Tarjeta, respecto al marco. */
  tarjeta: Caja;
  /** Badge del logo, respecto al marco, y su relleno interno. */
  insignia: Caja; relleno: number;
  /** Botón "Ingresar", respecto a la tarjeta. */
  boton: Caja;
  /** Cada letra del título, respecto al título. */
  letras: { x: number; w: number }[];
  /** Rutas de los dos mensajeros, que terminan en el centro del badge. */
  rutas: [Trayecto, Trayecto];
  /** Media tarjeta, de arriba al centro hasta abajo al centro: el trazo de luz que dibuja el borde. */
  borde: Trayecto;
};

export type Piezas = {
  raiz: HTMLElement; tarjeta: HTMLElement; insignia: HTMLElement; placa: HTMLElement; titulo: HTMLElement; boton: HTMLElement;
};

/* Rutas de la referencia (animacion-ingreso/src/Intro.tsx): ESCRITORIO a 1440×900 y CELULAR a 390×844. */
const ESCRITORIO = {
  W: 1440, H: 900, cx: 720, cy: 232,
  rutas: ["M 110 790 C 300 730, 320 430, 520 390 S 650 250, 720 232", "M 1350 110 C 1230 150, 1190 540, 950 480 S 790 260, 720 232"],
};
const CELULAR = {
  W: 390, H: 844, cx: 195, cy: 227,
  rutas: ["M 40 790 C 120 720, 40 560, 120 500 S 170 280, 195 227", "M 355 60 C 330 100, 400 230, 300 262 S 225 236, 195 227"],
};

/** Radio del borde brillante de la tarjeta (`rounded-[1.6rem]`). */
export const RADIO_BORDE = 25.6;

function trayecto(d: string): Trayecto {
  const el = document.createElementNS("http://www.w3.org/2000/svg", "path");
  el.setAttribute("d", d);
  const largo = el.getTotalLength();
  return { d, largo, punto: l => el.getPointAtLength(Math.min(largo, Math.max(0.01, l))) };
}

/**
 * Acomoda una ruta de la referencia a esta pantalla: conserva la forma, termina en el centro del badge
 * y sale desde el mismo rincón de la ventana. En 1440×900 y 390×844 queda idéntica a la del video.
 */
function acomodar(d: string, ref: typeof ESCRITORIO, W: number, H: number, cx: number, cy: number) {
  const [x0, y0] = d.match(/-?[\d.]+/g)!.map(Number);
  const escala = (inicio: number, centroRef: number, medida: number, medidaRef: number, centro: number) => {
    const k = (inicio * medida / medidaRef - centro) / (inicio - centroRef);
    return Number.isFinite(k) && k > 0.15 ? k : 0.15;
  };
  const kx = escala(x0, ref.cx, W, ref.W, cx), ky = escala(y0, ref.cy, H, ref.H, cy);
  const n = (v: number) => Math.round(v * 100) / 100;
  return d.replace(/(-?[\d.]+) (-?[\d.]+)/g, (_, x: string, y: string) => `${n(cx + (+x - ref.cx) * kx)} ${n(cy + (+y - ref.cy) * ky)}`);
}

export function medir(p: Piezas): Medidas {
  // La animación mueve la tarjeta y el badge con `transform`; se quita un instante para medir el ingreso en reposo.
  const movidos = [p.tarjeta, p.insignia];
  const antes = movidos.map(e => e.style.transform);
  movidos.forEach(e => { e.style.transform = "none"; });
  try {
    const r0 = p.raiz.getBoundingClientRect();
    const caja = (e: Element, base: DOMRect): Caja => {
      const r = e.getBoundingClientRect();
      return { x: r.left - base.left, y: r.top - base.top, w: r.width, h: r.height };
    };
    const W = p.raiz.clientWidth, H = p.raiz.clientHeight;
    const tarjeta = caja(p.tarjeta, r0), insignia = caja(p.insignia, r0);
    const boton = caja(p.boton, p.tarjeta.getBoundingClientRect());
    const cx = insignia.x + insignia.w / 2, cy = insignia.y + insignia.h / 2;

    const letras: Medidas["letras"] = [];
    const texto = p.titulo.firstChild;
    if (texto && texto.nodeType === Node.TEXT_NODE) {
      const rt = p.titulo.getBoundingClientRect(), rango = document.createRange();
      for (let i = 0; i < (texto.textContent ?? "").length; i++) {
        rango.setStart(texto, i); rango.setEnd(texto, i + 1);
        const r = rango.getBoundingClientRect();
        letras.push({ x: r.left - rt.left, w: r.width });
      }
    }

    const ref = W >= 800 ? ESCRITORIO : CELULAR;
    const w = tarjeta.w + 2, h = tarjeta.h + 2, r = RADIO_BORDE;
    return {
      W, H, chico: W < 800, tarjeta, insignia, boton, letras,
      relleno: parseFloat(getComputedStyle(p.placa).paddingLeft) || 0,
      rutas: [trayecto(acomodar(ref.rutas[0], ref, W, H, cx, cy)), trayecto(acomodar(ref.rutas[1], ref, W, H, cx, cy))],
      borde: trayecto(`M ${w / 2} 0 H ${w - r} A ${r} ${r} 0 0 1 ${w} ${r} V ${h - r} A ${r} ${r} 0 0 1 ${w - r} ${h} H ${w / 2}`),
    };
  } finally {
    movidos.forEach((e, i) => { e.style.transform = antes[i]; });
  }
}
