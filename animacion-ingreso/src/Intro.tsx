/*
 * Animación de entrada del ingreso de la oficina ("La ruta de entrega"), en Remotion.
 * Es la referencia visual aprobada por el dueño: el video que sale de aquí es lo que hay que reproducir en
 * frontend/src/pages/Ingreso.tsx. Las instrucciones para implementarla están en ../IMPLEMENTAR.md.
 *
 * 60 fps y 240 cuadros (4 s). Para pasar un cuadro a segundos: cuadro / 60.
 * Los resortes son los de Framer Motion (`spring` de framer-motion) evaluados cuadro a cuadro, así que un
 * `transition={{ type: "spring", stiffness, damping }}` en la app da la misma curva.
 * Las medidas de `ESCRITORIO` y `CELULAR` salen del ingreso real a 1440×900 y 390×844.
 */
import React from "react";
import {
  AbsoluteFill, Img, continueRender, delayRender, interpolate, random, staticFile, useCurrentFrame, useVideoConfig,
} from "remotion";
import { getLength, getPointAtLength } from "@remotion/paths";
import { spring as fmSpringGen, cubicBezier, easeOut, easeInOut, backOut } from "framer-motion";

// Poppins local (la misma letra del login).
const fontFamily = "Poppins";
if (typeof document !== "undefined") {
  const espera = delayRender("Cargando Poppins");
  Promise.all(["400", "500", "600", "700"].map(w => {
    const f = new FontFace("Poppins", `url(${staticFile(`poppins-${w}.woff2`)}) format("woff2")`, { weight: w });
    document.fonts.add(f);
    return f.load();
  })).then(() => continueRender(espera));
}

type Box = [number, number, number, number];
export type Layout = {
  W: number; H: number;
  form: Box; badge: Box; badgeR: number; badgePad: number;
  eyebrowY: number; h1: Box; h1Fs: number; desc: Box; descFs: number;
  lab: Box[]; inp: Box[]; btn: Box; linkY: number;
  rutas: [string, string];
};

export const ESCRITORIO: Layout = {
  W: 1440, H: 900,
  form: [512, 140, 416, 620], badge: [664, 176, 112, 112], badgeR: 28, badgePad: 12,
  eyebrowY: 304, h1: [548, 328, 344, 40], h1Fs: 36, desc: [568, 378, 304, 46], descFs: 14,
  lab: [[548, 443, 344, 20], [548, 534, 344, 20]], inp: [[548, 469, 344, 49], [548, 560, 344, 49]],
  btn: [548, 628, 344, 56], linkY: 704,
  rutas: [
    "M 110 790 C 300 730, 320 430, 520 390 S 650 250, 720 232",
    "M 1350 110 C 1230 150, 1190 540, 950 480 S 790 260, 720 232",
  ],
};

export const CELULAR: Layout = {
  W: 390, H: 844,
  form: [19, 167, 352, 510], badge: [155, 187, 80, 80], badgeR: 22.4, badgePad: 8,
  eyebrowY: 275, h1: [39, 299, 312, 36], h1Fs: 30, desc: [43, 343, 304, 42], descFs: 13,
  lab: [[39, 401, 312, 20], [39, 485, 312, 20]], inp: [[39, 427, 312, 46], [39, 511, 312, 46]],
  btn: [39, 573, 312, 48], linkY: 637,
  rutas: [
    "M 40 790 C 120 720, 40 560, 120 500 S 170 280, 195 227",
    "M 355 60 C 330 100, 400 230, 300 262 S 225 236, 195 227",
  ],
};

// Curvas al estilo Framer Motion, evaluadas por cuadro para que el render sea exacto.
const rapida = cubicBezier(0.65, 0, 0.25, 1);
const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;

function useFm() {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  /** Resorte de Framer Motion (0 → 1) que arranca en el cuadro `inicio`. */
  const resorte = (inicio: number, stiffness = 220, damping = 18, mass = 1) => {
    if (frame < inicio) return 0;
    const s = fmSpringGen({ keyframes: [0, 1], stiffness, damping, mass });
    return s.next(((frame - inicio) / fps) * 1000).value as number;
  };
  const tramo = (a: number, b: number, ease: (t: number) => number = easeOut) =>
    interpolate(frame, [a, b], [0, 1], { ...clamp, easing: ease });
  return { frame, fps, resorte, tramo };
}

const COLISION = 58;

export const Intro: React.FC<{ L: Layout }> = ({ L }) => {
  const { frame, fps, resorte, tramo } = useFm();
  const bcx = L.badge[0] + L.badge[2] / 2;
  const bcy = L.badge[1] + L.badge[3] / 2;
  const seg = frame / fps;

  // Cámara: entra un poco cerca y se aleja; temblor corto en el choque.
  const zoom = interpolate(frame, [0, 80], [1.12, 1], { ...clamp, easing: rapida });
  const temblor = interpolate(frame, [COLISION, COLISION + 14], [1, 0], clamp);
  const sx = (random(`sx${frame}`) - 0.5) * 10 * temblor;
  const sy = (random(`sy${frame}`) - 0.5) * 10 * temblor;

  // Fondo: de casi negro al azul noche del login.
  const fondoP = tramo(COLISION, COLISION + 50);

  // Onda expansiva que revela la malla.
  const onda = interpolate(frame, [COLISION, COLISION + 70], [0, Math.hypot(L.W, L.H) * 1.1], { ...clamp, easing: easeOut });
  const ondaOp = interpolate(frame, [COLISION, COLISION + 70], [1, 0], clamp);

  return (
    <AbsoluteFill style={{ background: mezcla("#03060a", "#0b0f19", fondoP), fontFamily, overflow: "hidden" }}>
      <AbsoluteFill style={{ transform: `translate(${sx}px, ${sy}px) scale(${zoom})`, transformOrigin: `${bcx}px ${bcy}px` }}>
        <FondoLogin L={L} seg={seg} frame={frame} onda={onda} />

        {/* Anillo de la onda */}
        {frame >= COLISION && (
          <div style={{
            position: "absolute", left: bcx - onda, top: bcy - onda, width: onda * 2, height: onda * 2, borderRadius: "50%",
            border: "2px solid rgba(125,211,252,.9)", opacity: ondaOp,
            boxShadow: "0 0 40px 6px rgba(56,189,248,.45), inset 0 0 40px 6px rgba(56,189,248,.25)",
          }} />
        )}

        <Telemetria L={L} frame={frame} />
        <Mensajeros L={L} frame={frame} />
        <Chispas cx={bcx} cy={bcy} frame={frame} />
        <Tarjeta L={L} frame={frame} resorte={resorte} tramo={tramo} />
        <Marca L={L} frame={frame} resorte={resorte} tramo={tramo} />

        {/* Destello del choque */}
        {frame >= COLISION - 2 && frame < COLISION + 26 && (() => {
          const p = tramo(COLISION - 2, COLISION + 26);
          const r = 40 + p * (L.W > 800 ? 520 : 320);
          return <div style={{
            position: "absolute", left: bcx - r, top: bcy - r, width: r * 2, height: r * 2, borderRadius: "50%",
            background: "radial-gradient(circle, rgba(255,255,255,1) 0%, rgba(186,230,253,.85) 18%, rgba(56,189,248,.35) 40%, transparent 70%)",
            opacity: 1 - p, mixBlendMode: "screen",
          }} />;
        })()}
      </AbsoluteFill>

      {/* Viñeta que se abre */}
      <AbsoluteFill style={{
        pointerEvents: "none",
        background: `radial-gradient(ellipse at ${(bcx / L.W) * 100}% ${(bcy / L.H) * 100}%, transparent ${20 + fondoP * 60}%, rgba(0,0,0,${0.85 - fondoP * 0.85}) 100%)`,
      }} />
    </AbsoluteFill>
  );
};

function mezcla(a: string, b: string, t: number) {
  const pa = [1, 3, 5].map(i => parseInt(a.slice(i, i + 2), 16));
  const pb = [1, 3, 5].map(i => parseInt(b.slice(i, i + 2), 16));
  return `rgb(${pa.map((v, i) => Math.round(v + (pb[i] - v) * t)).join(",")})`;
}

/* ---------------- Fondo del login (malla, rutas, pulsos, manchas de luz) ---------------- */

const RUTAS_FONDO = [
  "M-20 620 C 220 560, 300 300, 560 340 S 900 520, 1220 180",
  "M-20 220 C 200 260, 360 120, 620 190 S 960 80, 1220 360",
];
const NODOS: [number, number][] = [[560, 340], [300, 330], [900, 505], [620, 190], [960, 120]];

const FondoLogin: React.FC<{ L: Layout; seg: number; frame: number; onda: number }> = ({ L, seg, frame, onda }) => {
  const bcx = L.badge[0] + L.badge[2] / 2;
  const bcy = L.badge[1] + L.badge[3] / 2;
  const mallaOff = (seg / 6) * 48;
  const rutasOp = interpolate(frame, [10, 90], [0, 0.5], clamp);
  const manchas = interpolate(frame, [COLISION, COLISION + 90], [0, 1], clamp);
  const flota = (dur: number, inv = false) => {
    const t = ((seg / dur) % 1) * Math.PI * 2;
    const k = (1 - Math.cos(t)) / 2 * (inv ? -1 : 1);
    return `translate(${30 * k}px, ${24 * k}px)`;
  };
  const revelado = frame < COLISION ? 0 : onda;
  return (
    <AbsoluteFill>
      {/* Malla: aparece detrás de la onda */}
      <AbsoluteFill style={{
        WebkitMaskImage: `radial-gradient(circle at ${bcx}px ${bcy}px, #000 ${Math.max(0, revelado - 120)}px, transparent ${revelado}px)`,
        maskImage: `radial-gradient(circle at ${bcx}px ${bcy}px, #000 ${Math.max(0, revelado - 120)}px, transparent ${revelado}px)`,
      }}>
        <AbsoluteFill style={{
          opacity: 0.6,
          backgroundImage: "linear-gradient(to right, rgba(56,189,248,.09) 1px, transparent 1px), linear-gradient(to bottom, rgba(56,189,248,.09) 1px, transparent 1px)",
          backgroundSize: "48px 48px", backgroundPosition: `${mallaOff}px ${mallaOff}px`,
          WebkitMaskImage: "radial-gradient(ellipse 70% 60% at 50% 45%, #000 30%, transparent 100%)",
          maskImage: "radial-gradient(ellipse 70% 60% at 50% 45%, #000 30%, transparent 100%)",
        }} />
        {/* Borde brillante de la malla justo detrás de la onda */}
        <AbsoluteFill style={{
          opacity: interpolate(frame, [COLISION, COLISION + 70], [1, 0], clamp),
          backgroundImage: "linear-gradient(to right, rgba(125,211,252,.55) 1px, transparent 1px), linear-gradient(to bottom, rgba(125,211,252,.55) 1px, transparent 1px)",
          backgroundSize: "48px 48px", backgroundPosition: `${mallaOff}px ${mallaOff}px`,
          WebkitMaskImage: `radial-gradient(circle at ${bcx}px ${bcy}px, transparent ${Math.max(0, revelado - 110)}px, #000 ${Math.max(0, revelado - 20)}px, transparent ${revelado}px)`,
          maskImage: `radial-gradient(circle at ${bcx}px ${bcy}px, transparent ${Math.max(0, revelado - 110)}px, #000 ${Math.max(0, revelado - 20)}px, transparent ${revelado}px)`,
        }} />
      </AbsoluteFill>

      <svg style={{ position: "absolute", inset: 0, width: "100%", height: "100%", opacity: rutasOp }}
        preserveAspectRatio="xMidYMid slice" viewBox="0 0 1200 800" fill="none">
        <defs>
          <linearGradient id="jslRuta" x1="0" x2="1">
            <stop offset="0" stopColor="#0284c7" stopOpacity="0" />
            <stop offset=".5" stopColor="#38bdf8" />
            <stop offset="1" stopColor="#0284c7" stopOpacity="0" />
          </linearGradient>
        </defs>
        <path d={RUTAS_FONDO[0]} stroke="url(#jslRuta)" strokeWidth="1.5" strokeDasharray="6 10" strokeDashoffset={-64 * (seg / 3)} />
        <path d={RUTAS_FONDO[1]} stroke="url(#jslRuta)" strokeWidth="1.2" strokeDasharray="4 12" strokeDashoffset={-64 * (seg / 4.5)} />
        {NODOS.map(([x, y], i) => {
          const aparece = interpolate(frame, [COLISION + 10 + i * 6, COLISION + 24 + i * 6], [0, 1], { ...clamp, easing: backOut });
          const t = ((seg - i * 0.7) / 2.8);
          const ph = t < 0 ? 0 : t % 1;
          return (
            <g key={i}>
              <circle cx={x} cy={y} r={3.5 * aparece} fill="#38bdf8" />
              {t >= 0 && <circle cx={x} cy={y} r={3.5 * (1 + 3 * ph)} stroke="#38bdf8" strokeWidth="1.2" opacity={0.8 * (1 - ph) * aparece} />}
            </g>
          );
        })}
      </svg>

      <div style={{ opacity: manchas }}>
        <div style={{ position: "absolute", left: -128, top: -128, width: 448, height: 448, borderRadius: "50%", background: "rgba(2,132,199,.3)", filter: "blur(120px)", transform: flota(14) }} />
        <div style={{ position: "absolute", right: -96, bottom: -160, width: 512, height: 512, borderRadius: "50%", background: "rgba(56,189,248,.2)", filter: "blur(130px)", transform: flota(18, true) }} />
        <div style={{ position: "absolute", left: "50%", top: "33%", width: 288, height: 288, marginLeft: -144, borderRadius: "50%", background: "rgba(99,102,241,.1)", filter: "blur(110px)" }} />
      </div>
    </AbsoluteFill>
  );
};

/* ---------------- Acto 1: dos mensajeros de luz cruzan la ciudad ---------------- */

const Mensajeros: React.FC<{ L: Layout; frame: number }> = ({ L, frame }) => {
  if (frame > COLISION + 4) return null;
  return (
    <svg width={L.W} height={L.H} style={{ position: "absolute", inset: 0, overflow: "visible" }}>
      <defs>
        <filter id="brillo" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="4" result="b" />
          <feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
        </filter>
      </defs>
      {L.rutas.map((d, i) => {
        const largo = getLength(d);
        const inicio = 3 + i * 3;
        const p = interpolate(frame, [inicio, COLISION], [0, 1], { ...clamp, easing: cubicBezier(0.4, 0, 0.7, 0.95) });
        const recorrido = p * largo;
        const estela = Math.min(recorrido, largo * 0.38);
        const punta = getPointAtLength(d, Math.max(0.01, recorrido));
        const nace = interpolate(frame, [inicio, inicio + 8], [0, 1], clamp);
        const paradas = [0.3, 0.62];
        return (
          <g key={i}>
            {/* Ruta completa apenas sugerida */}
            <path d={d} stroke="rgba(56,189,248,.12)" strokeWidth={1.2} strokeDasharray="4 10" fill="none" />
            {/* Estela del mensajero */}
            <path d={d} fill="none" stroke={`url(#estela${i})`} strokeWidth={3} strokeLinecap="round"
              strokeDasharray={`${estela} ${largo * 2}`} strokeDashoffset={-(recorrido - estela)} filter="url(#brillo)" />
            <linearGradient id={`estela${i}`} gradientUnits="userSpaceOnUse"
              x1={getPointAtLength(d, Math.max(0, recorrido - estela)).x} y1={getPointAtLength(d, Math.max(0, recorrido - estela)).y}
              x2={punta.x} y2={punta.y}>
              <stop offset="0" stopColor="#0284c7" stopOpacity="0" />
              <stop offset=".7" stopColor="#38bdf8" stopOpacity=".9" />
              <stop offset="1" stopColor="#e0f2fe" />
            </linearGradient>
            {/* Paradas de entrega: se encienden cuando el mensajero pasa */}
            {paradas.map((q, k) => {
              if (p < q) return null;
              const pt = getPointAtLength(d, q * largo);
              const desde = interpolate(p, [q, Math.min(1, q + 0.25)], [0, 1], clamp);
              return (
                <g key={k}>
                  <circle cx={pt.x} cy={pt.y} r={4} fill="#38bdf8" opacity={1 - desde * 0.4} />
                  <circle cx={pt.x} cy={pt.y} r={4 + desde * 22} stroke="#7dd3fc" strokeWidth={1.5} fill="none" opacity={1 - desde} />
                </g>
              );
            })}
            {/* Cabeza del mensajero */}
            <circle cx={punta.x} cy={punta.y} r={16 * nace} fill="rgba(56,189,248,.25)" filter="url(#brillo)" />
            <circle cx={punta.x} cy={punta.y} r={5 * nace} fill="#ffffff" filter="url(#brillo)" />
          </g>
        );
      })}
    </svg>
  );
};

const Telemetria: React.FC<{ L: Layout; frame: number }> = ({ L, frame }) => {
  const lineas = ["CALI · 3.4516° N · 76.5320° W", "DESPACHANDO 2 RUTAS…"];
  const op = interpolate(frame, [6, 14, COLISION, COLISION + 16], [0, 1, 1, 0], clamp);
  if (op <= 0) return null;
  const chico = L.W < 800;
  return (
    <div style={{
      position: "absolute", left: chico ? 20 : 40, bottom: chico ? 28 : 36, opacity: op,
      fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace", fontSize: chico ? 10 : 12, letterSpacing: "0.18em",
      color: "rgba(125,211,252,.75)", lineHeight: 1.8,
    }}>
      {lineas.map((t, i) => {
        const n = Math.floor(interpolate(frame, [8 + i * 14, 30 + i * 14], [0, t.length], clamp));
        return <div key={i}>{t.slice(0, n)}{n < t.length && n > 0 ? "▍" : ""}</div>;
      })}
    </div>
  );
};

/* ---------------- Choque: chispas ---------------- */

const Chispas: React.FC<{ cx: number; cy: number; frame: number }> = ({ cx, cy, frame }) => {
  if (frame < COLISION || frame > COLISION + 46) return null;
  const p = interpolate(frame, [COLISION, COLISION + 46], [0, 1], { ...clamp, easing: easeOut });
  return (
    <svg style={{ position: "absolute", inset: 0, width: "100%", height: "100%", overflow: "visible" }}>
      {Array.from({ length: 22 }).map((_, i) => {
        const ang = random(`a${i}`) * Math.PI * 2;
        const vel = 90 + random(`v${i}`) * 260;
        const d = vel * p;
        const x = cx + Math.cos(ang) * d, y = cy + Math.sin(ang) * d;
        const cola = 18 * (1 - p);
        return (
          <line key={i} x1={x} y1={y} x2={x - Math.cos(ang) * cola} y2={y - Math.sin(ang) * cola}
            stroke={i % 3 === 0 ? "#ffffff" : "#7dd3fc"} strokeWidth={2} strokeLinecap="round" opacity={1 - p} />
        );
      })}
    </svg>
  );
};

/* ---------------- Acto 2 y 3: la tarjeta se dibuja y se arma ---------------- */

type Fm = { resorte: (i: number, s?: number, d?: number, m?: number) => number; tramo: (a: number, b: number, e?: (t: number) => number) => number };

const Tarjeta: React.FC<{ L: Layout; frame: number } & Fm> = ({ L, frame, resorte, tramo }) => {
  const [fx, fy, fw, fh] = L.form;
  const r = 25.6;
  const W = fw + 2, H = fh + 2;
  const mitad = `M ${W / 2} 0 H ${W - r} A ${r} ${r} 0 0 1 ${W} ${r} V ${H - r} A ${r} ${r} 0 0 1 ${W - r} ${H} H ${W / 2}`;
  const largo = getLength(mitad);
  const trazo = tramo(COLISION + 6, COLISION + 46, rapida);
  const cabeza = getPointAtLength(mitad, Math.max(0.01, trazo * largo));
  const trazoOp = interpolate(frame, [COLISION + 46, COLISION + 72], [1, 0], clamp);

  const relleno = tramo(COLISION + 34, COLISION + 80, rapida);
  const bordeOp = interpolate(frame, [COLISION + 40, COLISION + 70], [0, 0.7], clamp);
  const halo = interpolate(frame, [COLISION + 40, COLISION + 100], [0, 1], clamp);
  const esc = 0.965 + 0.035 * resorte(COLISION + 34, 160, 20);

  return (
    <div style={{ position: "absolute", left: fx, top: fy, width: fw, height: fh, transform: `scale(${esc})` }}>
      <div style={{ position: "absolute", inset: -24, borderRadius: 40, background: "rgba(37,99,235,.2)", filter: "blur(64px)", zIndex: -1, opacity: halo }} />
      <div style={{
        position: "absolute", inset: -1, borderRadius: r, opacity: bordeOp, filter: "blur(1px)",
        background: "linear-gradient(to bottom right, #38bdf8, rgba(37,99,235,.4), rgba(56,189,248,.6))",
      }} />
      {/* Cuerpo de vidrio: se llena desde arriba, como tinta */}
      <div style={{
        position: "absolute", inset: 0, borderRadius: 24, background: "rgba(15,23,42,.75)",
        boxShadow: `0 24px 80px -20px rgba(37,99,235,${0.5 * relleno}), 0 8px 30px rgba(0,0,0,${0.5 * relleno})`,
        backdropFilter: "blur(16px)",
        clipPath: `circle(${relleno * 170}% at 50% 0%)`,
      }} />
      {/* Trazo de luz que dibuja el borde, en los dos sentidos */}
      {trazoOp > 0 && frame >= COLISION + 6 && (
        <svg width={W} height={H} style={{ position: "absolute", left: -1, top: -1, overflow: "visible", opacity: trazoOp }}>
          <defs>
            <filter id="brilloBorde" x="-20%" y="-20%" width="140%" height="140%">
              <feGaussianBlur stdDeviation="3" result="b" />
              <feMerge><feMergeNode in="b" /><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
            </filter>
          </defs>
          {[1, -1].map(s => (
            <g key={s} transform={s === -1 ? `translate(${W} 0) scale(-1 1)` : undefined}>
              <path d={mitad} fill="none" stroke="#7dd3fc" strokeWidth={2} strokeLinecap="round"
                strokeDasharray={`${trazo * largo} ${largo * 2}`} filter="url(#brilloBorde)" />
              {trazo < 1 && <circle cx={cabeza.x} cy={cabeza.y} r={4} fill="#fff" filter="url(#brilloBorde)" />}
            </g>
          ))}
        </svg>
      )}
      <Contenido L={L} frame={frame} resorte={resorte} tramo={tramo} />
    </div>
  );
};

const Contenido: React.FC<{ L: Layout; frame: number } & Fm> = ({ L, frame, resorte, tramo }) => {
  const [fx, fy] = L.form;
  const rel = (b: Box) => ({ left: b[0] - fx, top: b[1] - fy, width: b[2], height: b[3] });
  const T0 = COLISION + 58; // ~1.9 s

  // "LOGISTICS · CALI": las letras llegan abiertas y se juntan.
  const ceja = tramo(T0, T0 + 34, rapida);
  // Título letra por letra
  const titulo = "JS Logistics";
  const desc = tramo(T0 + 22, T0 + 46);

  return (
    <>
      <div style={{
        position: "absolute", left: L.W < 800 ? 20 : 36, right: L.W < 800 ? 20 : 36, top: L.eyebrowY - fy, height: 16,
        textAlign: "center", fontSize: 11, fontWeight: 600, textTransform: "uppercase", color: "#38bdf8", whiteSpace: "nowrap",
        letterSpacing: `${1.4 - ceja * (1.4 - 0.32)}em`, opacity: ceja, lineHeight: "16px",
        paddingLeft: `${1.4 - ceja * (1.4 - 0.32)}em`, filter: `blur(${(1 - ceja) * 4}px)`,
      }}>Logistics · Cali</div>

      <div style={{ position: "absolute", ...rel(L.h1), display: "flex", justifyContent: "center", alignItems: "center", fontSize: L.h1Fs, fontWeight: 700, color: "#fff", letterSpacing: "-0.025em", lineHeight: 1 }}>
        {titulo.split("").map((c, i) => {
          const p = resorte(T0 + 6 + i * 2.2, 320, 19);
          return (
            <span key={i} style={{
              display: "inline-block", whiteSpace: "pre", opacity: Math.min(1, p * 1.4),
              transform: `translateY(${(1 - p) * 30}px) rotate(${(1 - p) * (i % 2 ? 8 : -8)}deg)`, filter: `blur(${Math.max(0, 1 - p) * 10}px)`,
            }}>{c}</span>
          );
        })}
      </div>

      <div style={{
        position: "absolute", ...rel(L.desc), textAlign: "center", fontSize: L.descFs, lineHeight: 1.625, color: "#cbd5e1",
        opacity: desc, transform: `translateY(${(1 - desc) * 10}px)`,
      }}>Ingresa con el correo y la contraseña que te dio administración.</div>

      {L.lab.map((b, i) => {
        const p = resorte(T0 + 30 + i * 9, 240, 20);
        const barrido = tramo(T0 + 38 + i * 9, T0 + 70 + i * 9, easeInOut);
        const ib = L.inp[i];
        const dy = (1 - p) * 26;
        return (
          <React.Fragment key={i}>
            <div style={{ position: "absolute", ...rel(b), fontSize: 14, fontWeight: 500, color: "#cbd5e1", opacity: p, transform: `translateY(${dy}px)`, lineHeight: "20px" }}>
              {i === 0 ? "Correo" : "Contraseña"}
            </div>
            <div style={{
              position: "absolute", ...rel(ib), borderRadius: 12, border: "1px solid #334155", background: "rgba(7,11,25,.7)",
              opacity: p, transform: `translateY(${dy}px)`, overflow: "hidden", boxSizing: "border-box",
              boxShadow: barrido > 0 && barrido < 1 ? `0 0 24px -6px rgba(56,189,248,${Math.sin(barrido * Math.PI) * 0.9})` : "none",
            }}>
              {/* Luz que recorre el campo, como un escáner de guía */}
              {barrido > 0 && barrido < 1 && (
                <div style={{
                  position: "absolute", top: 0, bottom: 0, width: "35%", left: `${-35 + barrido * 135}%`,
                  background: "linear-gradient(90deg, transparent, rgba(56,189,248,.22), transparent)",
                  borderTop: "1px solid rgba(125,211,252,.9)", borderBottom: "1px solid rgba(125,211,252,.4)",
                }} />
              )}
              <div style={{ position: "absolute", left: 14, top: "50%", transform: "translateY(-50%)", color: "#64748b", display: "grid" }}>
                {i === 0 ? <IcCorreo /> : <IcCandado />}
              </div>
              <div style={{ position: "absolute", left: 44, top: 0, bottom: 0, display: "flex", alignItems: "center", fontSize: 15, color: "#64748b" }}>
                {i === 0 ? "tu@correo.co" : "••••••••"}
              </div>
              {i === 1 && <div style={{ position: "absolute", right: 16, top: "50%", transform: "translateY(-50%)", color: "#64748b", display: "grid" }}><IcOjo /></div>}
            </div>
          </React.Fragment>
        );
      })}

      <Boton L={L} frame={frame} resorte={resorte} tramo={tramo} T0={T0} />

      <div style={{
        position: "absolute", left: 0, right: 0, top: L.linkY - fy, textAlign: "center", fontSize: 12, fontWeight: 600, color: "#38bdf8",
        opacity: tramo(T0 + 92, T0 + 110), lineHeight: "20px",
      }}>¿Olvidaste tu contraseña?</div>
    </>
  );
};

/** El botón empieza como barra de carga y, al llenarse, se convierte en "Ingresar". */
const Boton: React.FC<{ L: Layout; frame: number; T0: number } & Fm> = ({ L, frame, resorte, tramo, T0 }) => {
  const [fx, fy] = L.form;
  const [bx, by, bw, bh] = L.btn;
  const aparece = tramo(T0 + 30, T0 + 40);
  const carga = tramo(T0 + 34, T0 + 82, cubicBezier(0.3, 0, 0.2, 1));
  const abre = resorte(T0 + 82, 300, 19);
  const alto = 4 + (bh - 4) * abre;
  const texto = tramo(T0 + 88, T0 + 102);
  const brillo = tramo(T0 + 98, T0 + 124, easeInOut);
  const pct = Math.round(carga * 100);
  return (
    <div style={{ position: "absolute", left: bx - fx, top: by - fy, width: bw, height: bh, opacity: aparece }}>
      {/* Riel de la barra */}
      {abre < 0.6 && (
        <div style={{ position: "absolute", left: 0, right: 0, top: bh / 2 - 2, height: 4, borderRadius: 2, background: "rgba(56,189,248,.14)", opacity: 1 - abre }} />
      )}
      {abre < 0.4 && (
        <div style={{
          position: "absolute", right: 0, top: bh / 2 - 22, fontFamily: "ui-monospace, Menlo, monospace", fontSize: 11, letterSpacing: "0.12em",
          color: "rgba(125,211,252,.85)", opacity: 1 - abre * 2.5,
        }}>{pct.toString().padStart(3, " ")}%</div>
      )}
      {abre < 0.4 && (
        <div style={{
          position: "absolute", left: 0, top: bh / 2 - 22, fontFamily: "ui-monospace, Menlo, monospace", fontSize: 11, letterSpacing: "0.12em",
          color: "rgba(125,211,252,.85)", opacity: 1 - abre * 2.5,
        }}>{carga < 1 ? "CARGANDO RUTA" : "LISTO"}</div>
      )}
      <div style={{
        position: "absolute", left: 0, top: (bh - alto) / 2, height: alto, width: `${carga * 100}%`,
        borderRadius: 2 + 10 * abre, overflow: "hidden",
        background: "linear-gradient(to right, #0284c7, #22d3ee)",
        boxShadow: abre > 0.05 ? `0 8px 24px -8px rgba(34,211,238,${0.6 * abre})` : "0 0 14px 2px rgba(34,211,238,.7)",
        display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
        color: "#fff", fontWeight: 700, fontSize: 16,
      }}>
        {brillo > 0 && brillo < 1 && (
          <span style={{ position: "absolute", inset: 0, transform: `translateX(${-100 + brillo * 200}%)`, background: "linear-gradient(to right, transparent, rgba(255,255,255,.35), transparent)" }} />
        )}
        <span style={{ opacity: texto, transform: `translateY(${(1 - texto) * 8}px)`, display: "flex", alignItems: "center", gap: 8 }}>
          Ingresar <span style={{ display: "grid", transform: `translateX(${(1 - texto) * -10}px)` }}><IcFlecha /></span>
        </span>
      </div>
      {/* Punta brillante de la barra */}
      {carga > 0 && abre < 0.2 && (
        <div style={{ position: "absolute", left: `calc(${carga * 100}% - 6px)`, top: bh / 2 - 6, width: 12, height: 12, borderRadius: "50%", background: "#fff", boxShadow: "0 0 16px 6px rgba(34,211,238,.9)", opacity: 1 - abre * 5 }} />
      )}
    </div>
  );
};

/* ---------------- La marca nace en el punto del choque ---------------- */

const Marca: React.FC<{ L: Layout; frame: number } & Fm> = ({ L, frame, resorte, tramo }) => {
  if (frame < COLISION) return null;
  const [bx, by, bs] = L.badge;
  const cx = bx + bs / 2, cy = by + bs / 2;
  const nace = resorte(COLISION, 340, 17);
  const encoge = resorte(COLISION + 36, 200, 20);
  const grande = bs * (L.W < 800 ? 2.1 : 2.3);
  const final = bs - L.badgePad * 2;
  const tam = (grande * nace) * (1 - encoge) + final * encoge;
  const blancaOp = Math.min(1, nace * 1.5) * (1 - tramo(COLISION + 44, COLISION + 60));
  const placa = resorte(COLISION + 38, 280, 16);
  const icono = tramo(COLISION + 44, COLISION + 60);
  const tajos = tramo(COLISION + 4, COLISION + 30, easeInOut);
  const halo = Math.min(1, placa);

  return (
    <>
      {/* Resplandor del logo */}
      <div style={{ position: "absolute", left: cx - bs / 2 - 12, top: cy - bs / 2 - 12, width: bs + 24, height: bs + 24, borderRadius: 32, background: "rgba(56,189,248,.5)", filter: "blur(40px)", opacity: halo }} />
      {/* Placa clara del badge */}
      <div style={{
        position: "absolute", left: bx, top: by, width: bs, height: bs, borderRadius: L.badgeR,
        background: "linear-gradient(to bottom right, #ffffff, #e0f2fe)", padding: L.badgePad, boxSizing: "border-box",
        boxShadow: "0 0 0 1px rgba(255,255,255,.7), 0 0 28px 6px rgba(56,189,248,.45), 0 12px 28px -6px rgba(2,132,199,.55), inset 0 1px 0 #fff",
        transform: `scale(${placa}) rotate(${(1 - placa) * -18}deg)`, opacity: Math.min(1, placa * 2),
      }}>
        <div style={{ position: "relative", width: "100%", height: "100%", overflow: "hidden", borderRadius: 16, opacity: icono }}>
          <Img src={staticFile("icono-96.png")} style={{ position: "absolute", left: "-10%", top: "3%", width: "120%", maxWidth: "none" }} />
        </div>
      </div>
      {/* Marca blanca grande que nace del destello */}
      {blancaOp > 0 && (
        <div style={{ position: "absolute", left: cx - tam / 2, top: cy - tam / 2, width: tam, height: tam, opacity: blancaOp, filter: `drop-shadow(0 0 ${18 * (1 - encoge)}px rgba(125,211,252,.9))` }}>
          <Img src={staticFile("marca-blanca.png")} style={{ width: "100%", height: "100%" }} />
          {/* Tres tajos de luz, como las rayas del logo */}
          {tajos > 0 && tajos < 1 && (
            <div style={{ position: "absolute", inset: 0, overflow: "hidden", WebkitMaskImage: `url(${staticFile("marca-blanca.png")})`, WebkitMaskSize: "100% 100%", maskImage: `url(${staticFile("marca-blanca.png")})`, maskSize: "100% 100%" }}>
              {[0, 1, 2].map(k => (
                <div key={k} style={{
                  position: "absolute", top: "-50%", height: "200%", width: "9%", left: `${-30 + (tajos * 160) - k * 14}%`,
                  background: "linear-gradient(90deg, transparent, #38bdf8, transparent)", transform: "rotate(35deg)",
                }} />
              ))}
            </div>
          )}
        </div>
      )}
    </>
  );
};

/* ---------------- Íconos (los mismos del login) ---------------- */
const ic = { viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, width: 20, height: 20 };
const IcCorreo = () => <svg {...ic}><rect x="3" y="5" width="18" height="14" rx="2.5" /><path d="m4 7.5 8 6 8-6" /></svg>;
const IcCandado = () => <svg {...ic}><rect x="4.5" y="10.5" width="15" height="10" rx="2.5" /><path d="M8 10.5V8a4 4 0 0 1 8 0v2.5M12 14.5v2" /></svg>;
const IcOjo = () => <svg {...ic}><path d="M2 12s3.6-6.5 10-6.5S22 12 22 12s-3.6 6.5-10 6.5S2 12 2 12z" /><circle cx="12" cy="12" r="3" /></svg>;
const IcFlecha = () => <svg {...ic}><path d="M5 12h14M13 6l6 6-6 6" /></svg>;
