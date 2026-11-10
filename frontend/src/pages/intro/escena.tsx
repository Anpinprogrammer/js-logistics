/*
 * Animación de entrada del ingreso ("La ruta de entrega"): qué se ve en cada cuadro.
 *
 * Es el mismo dibujo de animacion-ingreso/src/Intro.tsx (el video aprobado), pero sobre el ingreso real:
 * el formulario, el badge y el botón son los de siempre y aquí solo se les pone el estilo del cuadro actual.
 * Lo que no es formulario (mensajeros, destello, onda, chispas, telemetría, barra de carga, marca blanca)
 * se dibuja en capas aparte, con `aria-hidden` y sin recibir clics. Al terminar no queda nada de esto.
 *
 * Rendimiento: las luces desenfocadas (manchas, halo, borde) solo cambian de opacidad y van con `will-change: opacity`;
 * sin eso el navegador rehace el desenfoque en cada cuadro y la animación se traba en celulares modestos.
 */
import type { CSSProperties, ReactNode, Ref } from "react";
import type { IntroBoton, IntroCabecera, IntroMarco } from "../AccesoComun";
import type { Medidas } from "./medidas";
import { MARCA_BLANCA } from "./useIntroIngreso";
import {
  CHISPAS, COLISION, FPS, T0, TEMBLOR, backOut, curvaCarga, curvaMensajero, easeInOut, easeOut, entre, mezcla, rapida,
  resorte, tramo,
} from "./tiempos";

export type RefsIntro = {
  raiz: Ref<HTMLDivElement>; tarjeta: Ref<HTMLDivElement>; insignia: Ref<HTMLDivElement>; placa: Ref<HTMLDivElement>;
  titulo: Ref<HTMLHeadingElement>; boton: Ref<HTMLButtonElement>;
};

export type EscenaIntro = {
  marco: IntroMarco;
  cabecera: IntroCabecera;
  boton: IntroBoton;
  /** La tarjeta de vidrio la dibuja `marco.vidrio` mientras se revela; el formulario queda transparente. */
  formulario: CSSProperties;
  /** Correo y contraseña: estilo del bloque (etiqueta y campo) y la luz que lo recorre. */
  campos: { estilo: CSSProperties; escaner: ReactNode }[];
  /** La barra "CARGANDO RUTA" que se vuelve el botón. Va justo antes del botón real. */
  barra: ReactNode;
  enlace: CSSProperties;
};

const CAPA: CSSProperties = { position: "absolute", inset: 0, pointerEvents: "none" };
const MONO = "ui-monospace, SFMono-Regular, Menlo, monospace";
const OCULTO: CSSProperties = { opacity: 0 };
const SIN_VIDRIO: CSSProperties = { background: "transparent", boxShadow: "none", backdropFilter: "none", WebkitBackdropFilter: "none" };
/** El botón real sigue ahí para el teclado y los lectores de pantalla; solo no se ve mientras la barra carga. */
const BOTON_TAPADO: CSSProperties = { clipPath: "inset(50%)" };

/** Antes de medir el ingreso (un solo render, que no llega a pintarse) todo va oculto. */
function sinMedir(refs: RefsIntro): EscenaIntro {
  return {
    marco: {
      raiz: { ref: refs.raiz, style: { backgroundColor: "#03060a" } },
      fondo: OCULTO, malla: {}, rutas: OCULTO, nodos: [], manchas: OCULTO, detras: null,
      tarjeta: { ref: refs.tarjeta, style: OCULTO }, borde: OCULTO, halo: OCULTO, vidrio: null, frente: null,
    },
    cabecera: {
      insignia: { ref: refs.insignia }, halo: OCULTO, placa: { ref: refs.placa, style: OCULTO }, icono: OCULTO,
      ceja: OCULTO, titulo: { ref: refs.titulo, style: { position: "relative", color: "transparent" } }, letras: null, descripcion: OCULTO,
    },
    boton: { ref: refs.boton, style: BOTON_TAPADO },
    formulario: SIN_VIDRIO,
    campos: [{ estilo: OCULTO, escaner: null }, { estilo: OCULTO, escaner: null }],
    barra: null,
    enlace: OCULTO,
  };
}

/** Arma todo lo que la animación le pone al ingreso en el cuadro `c`. */
export function escenaIntro(c: number, m: Medidas | null, refs: RefsIntro, titulo: string): EscenaIntro {
  if (!m) return sinMedir(refs);

  const seg = c / FPS;
  const bcx = m.insignia.x + m.insignia.w / 2, bcy = m.insignia.y + m.insignia.h / 2;

  // Cámara: entra un poco cerca y se aleja; temblor corto en el choque.
  const zoom = entre(c, 0, 80, 1.12, 1, rapida);
  const temblor = entre(c, COLISION, COLISION + 14, 1, 0);
  const azar = TEMBLOR[Math.floor(c) - COLISION];
  const sx = azar ? (azar[0] - 0.5) * 10 * temblor : 0, sy = azar ? (azar[1] - 0.5) * 10 * temblor : 0;
  const quieta = zoom === 1 && sx === 0 && sy === 0;
  const camara = quieta ? "" : `translate(${sx}px, ${sy}px) scale(${zoom})`;

  // Fondo: de casi negro al azul noche del ingreso.
  const fondoP = tramo(c, COLISION, COLISION + 50);

  // Onda expansiva que revela la malla.
  const onda = entre(c, COLISION, COLISION + 70, 0, Math.hypot(m.W, m.H) * 1.1, easeOut);
  const ondaOp = entre(c, COLISION, COLISION + 70, 1, 0);
  const revelado = c < COLISION ? 0 : onda;
  const centro = `${bcx}px ${bcy}px`;
  const mascaraOnda = `radial-gradient(circle at ${centro}, #000 ${Math.max(0, revelado - 120)}px, transparent ${revelado}px)`;
  const mascaraMalla = "radial-gradient(ellipse 70% 60% at 50% 45%, #000 30%, transparent 100%)";
  const mascaraBrillo = `radial-gradient(circle at ${centro}, transparent ${Math.max(0, revelado - 110)}px, #000 ${Math.max(0, revelado - 20)}px, transparent ${revelado}px)`;
  const ondaViva = c < COLISION + 70;

  // Tarjeta.
  const t = m.tarjeta;
  const relleno = tramo(c, COLISION + 34, COLISION + 80, rapida);
  const escala = 0.965 + 0.035 * resorte(c, COLISION + 34, 160, 20);
  // Cuando al resorte le falta menos de medio píxel se deja quieta: mover la tarjeta obliga a rehacer su desenfoque en cada cuadro.
  const esc = Math.abs(escala - 1) < 0.0008 ? 1 : escala;
  const ox = bcx - (t.x + t.w / 2), oy = bcy - (t.y + t.h / 2);
  const moverTarjeta = [
    camara && `translate(${sx}px, ${sy}px) translate(${ox}px, ${oy}px) scale(${zoom}) translate(${-ox}px, ${-oy}px)`,
    esc !== 1 && `scale(${esc})`,
  ].filter(Boolean).join(" ");

  // Badge: la tarjeta respira (escala), pero el logo no; se le devuelve su tamaño y su sitio.
  const placa = resorte(c, COLISION + 38, 280, 16);
  const icono = tramo(c, COLISION + 44, COLISION + 60);

  // Contenido.
  const ceja = tramo(c, T0, T0 + 34, rapida);
  const espaciado = 1.4 - ceja * (1.4 - 0.32);
  const desc = tramo(c, T0 + 22, T0 + 46);
  const enlace = tramo(c, T0 + 92, T0 + 110);

  return {
    marco: {
      raiz: { ref: refs.raiz, style: fondoP < 1 ? { backgroundColor: mezcla("#03060a", "#0b0f19", fondoP) } : undefined },
      fondo: camara ? { transform: camara, transformOrigin: centro } : {},
      malla: ondaViva ? {
        maskImage: `${mascaraOnda}, ${mascaraMalla}`, WebkitMaskImage: `${mascaraOnda}, ${mascaraMalla}`,
        maskComposite: "intersect", WebkitMaskComposite: "source-in",
      } : {},
      rutas: { opacity: entre(c, 10, 90, 0, 0.5) },
      nodos: [0, 1, 2, 3, 4].map(i => {
        const aparece = entre(c, COLISION + 10 + i * 6, COLISION + 24 + i * 6, 0, 1, backOut);
        return {
          punto: { transform: `scale(${aparece})`, transformBox: "fill-box", transformOrigin: "center" },
          pulso: { strokeOpacity: seg >= i * 0.7 ? Math.min(1, Math.max(0, aparece)) : 0 },
        };
      }),
      manchas: c < COLISION ? { visibility: "hidden" } : { opacity: entre(c, COLISION, COLISION + 90, 0, 1), willChange: "opacity" },
      detras: (
        <>
          {/* Borde brillante de la malla justo detrás de la onda */}
          {c >= COLISION && ondaViva && (
            <div style={{
              ...CAPA, opacity: ondaOp,
              backgroundImage: "linear-gradient(to right, rgba(125,211,252,.55) 1px, transparent 1px), linear-gradient(to bottom, rgba(125,211,252,.55) 1px, transparent 1px)",
              backgroundSize: "48px 48px", backgroundPosition: `${(seg / 6) * 48}px ${(seg / 6) * 48}px`,
              maskImage: `${mascaraBrillo}, ${mascaraOnda}`, WebkitMaskImage: `${mascaraBrillo}, ${mascaraOnda}`,
              maskComposite: "intersect", WebkitMaskComposite: "source-in",
            }} />
          )}
          {/* Anillo de la onda */}
          {c >= COLISION && ondaViva && (
            <div style={{
              position: "absolute", left: bcx - onda, top: bcy - onda, width: onda * 2, height: onda * 2, borderRadius: "50%",
              border: "2px solid rgba(125,211,252,.9)", opacity: ondaOp, pointerEvents: "none",
              boxShadow: "0 0 40px 6px rgba(56,189,248,.45), inset 0 0 40px 6px rgba(56,189,248,.25)",
            }} />
          )}
          <Telemetria c={c} chico={m.chico} />
          <Mensajeros c={c} m={m} />
          <Chispas c={c} cx={bcx} cy={bcy} />
        </>
      ),
      tarjeta: { ref: refs.tarjeta, style: moverTarjeta ? { transform: moverTarjeta } : undefined },
      borde: { opacity: entre(c, COLISION + 40, COLISION + 70, 0, 0.7), willChange: "opacity" },
      halo: { opacity: entre(c, COLISION + 40, COLISION + 100, 0, 1), willChange: "opacity" },
      vidrio: (
        <>
          {/* Cuerpo de vidrio: se llena desde arriba, como tinta */}
          <div aria-hidden style={{
            ...CAPA, borderRadius: "1.5rem", background: "rgba(15,23,42,.75)",
            boxShadow: `0 24px 80px -20px rgba(37,99,235,${0.5 * relleno}), 0 8px 30px rgba(0,0,0,${0.5 * relleno})`,
            backdropFilter: "blur(16px)", WebkitBackdropFilter: "blur(16px)",
            clipPath: `circle(${relleno * 170}% at 50% 0%)`,
          }} />
          <Trazo c={c} m={m} />
        </>
      ),
      frente: (
        <>
          <MarcaBlanca c={c} m={m} cx={bcx} cy={bcy} camara={camara} />
          {/* Destello del choque */}
          {c >= COLISION - 2 && c < COLISION + 26 && (() => {
            const p = tramo(c, COLISION - 2, COLISION + 26);
            const r = 40 + p * (m.chico ? 320 : 520);
            return <div aria-hidden style={{
              position: "absolute", left: bcx - r, top: bcy - r, width: r * 2, height: r * 2, borderRadius: "50%", pointerEvents: "none",
              background: "radial-gradient(circle, rgba(255,255,255,1) 0%, rgba(186,230,253,.85) 18%, rgba(56,189,248,.35) 40%, transparent 70%)",
              opacity: 1 - p, mixBlendMode: "screen", transform: camara || undefined,
            }} />;
          })()}
          {/* Viñeta que se abre */}
          {fondoP < 1 && (
            <div aria-hidden style={{
              ...CAPA,
              background: `radial-gradient(ellipse at ${(bcx / m.W) * 100}% ${(bcy / m.H) * 100}%, transparent ${20 + fondoP * 60}%, rgba(0,0,0,${0.85 - fondoP * 0.85}) 100%)`,
            }} />
          )}
        </>
      ),
    },

    cabecera: {
      insignia: {
        ref: refs.insignia,
        style: esc !== 1 ? { transform: `translate(${-ox * (1 / esc - 1)}px, ${-oy * (1 / esc - 1)}px) scale(${1 / esc})` } : undefined,
      },
      halo: placa < 1 ? { opacity: placa } : {},
      placa: {
        ref: refs.placa,
        style: placa === 1 ? undefined : { transform: `scale(${placa}) rotate(${(1 - placa) * -18}deg)`, opacity: Math.min(1, placa * 2) },
      },
      icono: icono < 1 ? { opacity: icono } : {},
      // "LOGISTICS · CALI": las letras llegan abiertas y se juntan.
      ceja: {
        whiteSpace: "nowrap", letterSpacing: `${espaciado}em`, paddingLeft: `${espaciado - 0.32}em`, opacity: ceja,
        filter: ceja < 1 ? `blur(${(1 - ceja) * 4}px)` : undefined,
      },
      titulo: { ref: refs.titulo, style: { position: "relative", color: "transparent" } },
      // Título letra por letra, cada una en el sitio exacto que ocupa en el texto real.
      letras: (
        <span aria-hidden style={{ ...CAPA, color: "#fff", textAlign: "left" }}>
          {m.letras.map((l, i) => {
            const p = resorte(c, T0 + 6 + i * 2.2, 320, 19);
            const borroso = Math.max(0, 1 - p) * 10;
            return (
              <span key={i} style={{
                position: "absolute", left: l.x, top: 0, width: l.w, whiteSpace: "pre", opacity: Math.min(1, p * 1.4),
                transform: `translateY(${(1 - p) * 30}px) rotate(${(1 - p) * (i % 2 ? 8 : -8)}deg)`,
                filter: borroso > 0.01 ? `blur(${borroso}px)` : undefined,
              }}>{titulo[i]}</span>
            );
          })}
        </span>
      ),
      descripcion: desc < 1 ? { opacity: desc, transform: `translateY(${(1 - desc) * 10}px)` } : {},
    },

    boton: { ref: refs.boton, style: BOTON_TAPADO },
    formulario: SIN_VIDRIO,

    campos: [0, 1].map(i => {
      const p = resorte(c, T0 + 30 + i * 9, 240, 20);
      const barrido = tramo(c, T0 + 38 + i * 9, T0 + 70 + i * 9, easeInOut);
      return {
        // Ya en su sitio no lleva estilo: así el texto se pinta igual que en el ingreso en reposo.
        estilo: p === 1 ? {} : { opacity: Math.min(1, p), transform: `translateY(${(1 - p) * 26}px)` },
        // Luz que recorre el campo, como un escáner de guía.
        escaner: barrido > 0 && barrido < 1 ? (
          <span aria-hidden style={{ ...CAPA, borderRadius: 12, boxShadow: `0 0 24px -6px rgba(56,189,248,${Math.sin(barrido * Math.PI) * 0.9})` }}>
            <span style={{ position: "absolute", inset: 1, borderRadius: 11, overflow: "hidden" }}>
              <span style={{
                position: "absolute", top: 0, bottom: 0, width: "35%", left: `${-35 + barrido * 135}%`,
                background: "linear-gradient(90deg, transparent, rgba(56,189,248,.22), transparent)",
                borderTop: "1px solid rgba(125,211,252,.9)", borderBottom: "1px solid rgba(125,211,252,.4)",
              }} />
            </span>
          </span>
        ) : null,
      };
    }),

    barra: <Barra c={c} m={m} />,
    enlace: enlace < 1 ? { opacity: enlace } : {},
  };
}

/* ---------------- Acto 1: dos mensajeros de luz cruzan la ciudad ---------------- */

function Mensajeros({ c, m }: { c: number; m: Medidas }) {
  if (c > COLISION + 4) return null;
  return (
    <svg width={m.W} height={m.H} style={{ ...CAPA, overflow: "visible" }}>
      <defs>
        <filter id="jslIntroBrillo" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="4" result="b" />
          <feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
        </filter>
      </defs>
      {m.rutas.map((ruta, i) => {
        const { d, largo } = ruta;
        const inicio = 3 + i * 3;
        const p = entre(c, inicio, COLISION, 0, 1, curvaMensajero);
        const recorrido = p * largo;
        const estela = Math.min(recorrido, largo * 0.38);
        const punta = ruta.punto(recorrido), cola = ruta.punto(recorrido - estela);
        const nace = entre(c, inicio, inicio + 8, 0, 1);
        return (
          <g key={i}>
            {/* Ruta completa apenas sugerida */}
            <path d={d} stroke="rgba(56,189,248,.12)" strokeWidth={1.2} strokeDasharray="4 10" fill="none" />
            {/* Estela del mensajero */}
            <path d={d} fill="none" stroke={`url(#jslIntroEstela${i})`} strokeWidth={3} strokeLinecap="round"
              strokeDasharray={`${estela} ${largo * 2}`} strokeDashoffset={-(recorrido - estela)} filter="url(#jslIntroBrillo)" />
            <linearGradient id={`jslIntroEstela${i}`} gradientUnits="userSpaceOnUse" x1={cola.x} y1={cola.y} x2={punta.x} y2={punta.y}>
              <stop offset="0" stopColor="#0284c7" stopOpacity="0" />
              <stop offset=".7" stopColor="#38bdf8" stopOpacity=".9" />
              <stop offset="1" stopColor="#e0f2fe" />
            </linearGradient>
            {/* Paradas de entrega: se encienden cuando el mensajero pasa */}
            {[0.3, 0.62].map((q, k) => {
              if (p < q) return null;
              const pt = ruta.punto(q * largo);
              const desde = entre(p, q, Math.min(1, q + 0.25), 0, 1);
              return (
                <g key={k}>
                  <circle cx={pt.x} cy={pt.y} r={4} fill="#38bdf8" opacity={1 - desde * 0.4} />
                  <circle cx={pt.x} cy={pt.y} r={4 + desde * 22} stroke="#7dd3fc" strokeWidth={1.5} fill="none" opacity={1 - desde} />
                </g>
              );
            })}
            {/* Cabeza del mensajero */}
            <circle cx={punta.x} cy={punta.y} r={16 * nace} fill="rgba(56,189,248,.25)" filter="url(#jslIntroBrillo)" />
            <circle cx={punta.x} cy={punta.y} r={5 * nace} fill="#ffffff" filter="url(#jslIntroBrillo)" />
          </g>
        );
      })}
    </svg>
  );
}

const TELEMETRIA = ["CALI · 3.4516° N · 76.5320° W", "DESPACHANDO 2 RUTAS…"];

function Telemetria({ c, chico }: { c: number; chico: boolean }) {
  const op = c < COLISION ? entre(c, 6, 14, 0, 1) : entre(c, COLISION, COLISION + 16, 1, 0);
  if (op <= 0) return null;
  return (
    <div style={{
      position: "absolute", left: chico ? 20 : 40, bottom: chico ? 28 : 36, opacity: op, pointerEvents: "none",
      fontFamily: MONO, fontSize: chico ? 10 : 12, letterSpacing: "0.18em", color: "rgba(125,211,252,.75)", lineHeight: 1.8,
    }}>
      {TELEMETRIA.map((texto, i) => {
        const n = Math.floor(entre(c, 8 + i * 14, 30 + i * 14, 0, texto.length));
        return <div key={i}>{texto.slice(0, n)}{n < texto.length && n > 0 ? "▍" : ""}</div>;
      })}
    </div>
  );
}

/* ---------------- Choque: chispas ---------------- */

function Chispas({ c, cx, cy }: { c: number; cx: number; cy: number }) {
  if (c < COLISION || c > COLISION + 46) return null;
  const p = entre(c, COLISION, COLISION + 46, 0, 1, easeOut);
  return (
    <svg style={{ ...CAPA, width: "100%", height: "100%", overflow: "visible" }}>
      {CHISPAS.map(([a, v], i) => {
        const ang = a * Math.PI * 2;
        const d = (90 + v * 260) * p;
        const x = cx + Math.cos(ang) * d, y = cy + Math.sin(ang) * d;
        const cola = 18 * (1 - p);
        return (
          <line key={i} x1={x} y1={y} x2={x - Math.cos(ang) * cola} y2={y - Math.sin(ang) * cola}
            stroke={i % 3 === 0 ? "#ffffff" : "#7dd3fc"} strokeWidth={2} strokeLinecap="round" opacity={1 - p} />
        );
      })}
    </svg>
  );
}

/* ---------------- Acto 2: la tarjeta se dibuja ---------------- */

/** Trazo de luz que dibuja el borde de la tarjeta, en los dos sentidos. */
function Trazo({ c, m }: { c: number; m: Medidas }) {
  const trazoOp = entre(c, COLISION + 46, COLISION + 72, 1, 0);
  if (trazoOp <= 0 || c < COLISION + 6) return null;
  const w = m.tarjeta.w + 2, h = m.tarjeta.h + 2, { d, largo } = m.borde;
  const trazo = tramo(c, COLISION + 6, COLISION + 46, rapida);
  const cabeza = m.borde.punto(trazo * largo);
  return (
    <svg aria-hidden width={w} height={h} style={{ position: "absolute", left: -1, top: -1, overflow: "visible", opacity: trazoOp, pointerEvents: "none" }}>
      <defs>
        <filter id="jslIntroBorde" x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur stdDeviation="3" result="b" />
          <feMerge><feMergeNode in="b" /><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
        </filter>
      </defs>
      {[1, -1].map(s => (
        <g key={s} transform={s === -1 ? `translate(${w} 0) scale(-1 1)` : undefined}>
          <path d={d} fill="none" stroke="#7dd3fc" strokeWidth={2} strokeLinecap="round"
            strokeDasharray={`${trazo * largo} ${largo * 2}`} filter="url(#jslIntroBorde)" />
          {trazo < 1 && <circle cx={cabeza.x} cy={cabeza.y} r={4} fill="#fff" filter="url(#jslIntroBorde)" />}
        </g>
      ))}
    </svg>
  );
}

/* ---------------- La marca nace en el punto del choque ---------------- */

/** Marca blanca grande que nace del destello y se encoge hasta meterse en el badge. */
function MarcaBlanca({ c, m, cx, cy, camara }: { c: number; m: Medidas; cx: number; cy: number; camara: string }) {
  if (c < COLISION) return null;
  const lado = m.insignia.w;
  const nace = resorte(c, COLISION, 340, 17);
  const encoge = resorte(c, COLISION + 36, 200, 20);
  const grande = lado * (m.chico ? 2.1 : 2.3);
  const final = lado - m.relleno * 2;
  const tam = grande * nace * (1 - encoge) + final * encoge;
  const op = Math.min(1, nace * 1.5) * (1 - tramo(c, COLISION + 44, COLISION + 60));
  if (op <= 0) return null;
  const tajos = tramo(c, COLISION + 4, COLISION + 30, easeInOut);
  const mascara = `url(${MARCA_BLANCA})`;
  return (
    <div aria-hidden style={{
      position: "absolute", left: cx - tam / 2, top: cy - tam / 2, width: tam, height: tam, opacity: op, pointerEvents: "none",
      filter: `drop-shadow(0 0 ${18 * (1 - encoge)}px rgba(125,211,252,.9))`, transform: camara || undefined,
    }}>
      <img src={MARCA_BLANCA} alt="" style={{ display: "block", width: "100%", height: "100%", maxWidth: "none" }} />
      {/* Tres tajos de luz, como las rayas del logo */}
      {tajos > 0 && tajos < 1 && (
        <div style={{ ...CAPA, overflow: "hidden", WebkitMaskImage: mascara, WebkitMaskSize: "100% 100%", maskImage: mascara, maskSize: "100% 100%" }}>
          {[0, 1, 2].map(k => (
            <div key={k} style={{
              position: "absolute", top: "-50%", height: "200%", width: "9%", left: `${-30 + tajos * 160 - k * 14}%`,
              background: "linear-gradient(90deg, transparent, #38bdf8, transparent)", transform: "rotate(35deg)",
            }} />
          ))}
        </div>
      )}
    </div>
  );
}

/* ---------------- Acto 3: el botón empieza como barra de carga ---------------- */

/** La barra se llena y, al completarse, se abre hasta ser el botón "Ingresar". Tapa al botón real mientras tanto. */
function Barra({ c, m }: { c: number; m: Medidas }) {
  const { x, y, w, h } = m.boton;
  const aparece = tramo(c, T0 + 30, T0 + 40);
  if (aparece <= 0) return null;
  const carga = tramo(c, T0 + 34, T0 + 82, curvaCarga);
  const abre = resorte(c, T0 + 82, 300, 19);
  const alto = 4 + (h - 4) * abre;
  const texto = tramo(c, T0 + 88, T0 + 102);
  const brillo = tramo(c, T0 + 98, T0 + 124, easeInOut);
  const rotulo: CSSProperties = {
    position: "absolute", top: h / 2 - 22, fontFamily: "ui-monospace, Menlo, monospace", fontSize: 11, lineHeight: "normal",
    letterSpacing: "0.12em", color: "rgba(125,211,252,.85)", opacity: 1 - abre * 2.5, whiteSpace: "pre",
  };
  return (
    <div aria-hidden style={{ position: "absolute", left: x, top: y, width: w, height: h, margin: 0, opacity: aparece, pointerEvents: "none" }}>
      {/* Riel de la barra */}
      {abre < 0.6 && (
        <div style={{ position: "absolute", left: 0, right: 0, top: h / 2 - 2, height: 4, borderRadius: 2, background: "rgba(56,189,248,.14)", opacity: 1 - abre }} />
      )}
      {abre < 0.4 && <div style={{ ...rotulo, right: 0 }}>{Math.round(carga * 100).toString().padStart(3, " ")}%</div>}
      {abre < 0.4 && <div style={{ ...rotulo, left: 0 }}>{carga < 1 ? "CARGANDO RUTA" : "LISTO"}</div>}
      <div style={{
        position: "absolute", left: 0, top: (h - alto) / 2, height: alto, width: `${carga * 100}%`,
        borderRadius: 2 + 10 * abre, overflow: "hidden",
        background: "linear-gradient(to right, #0284c7, #22d3ee)",
        boxShadow: abre > 0.05 ? `0 8px 24px -8px rgba(34,211,238,${0.6 * abre})` : "0 0 14px 2px rgba(34,211,238,.7)",
        display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
        color: "#fff", fontWeight: 700, fontSize: 16, lineHeight: 1.5,
      }}>
        {brillo > 0 && brillo < 1 && (
          <span style={{ position: "absolute", inset: 0, transform: `translateX(${-100 + brillo * 200}%)`, background: "linear-gradient(to right, transparent, rgba(255,255,255,.35), transparent)" }} />
        )}
        <span style={{ opacity: texto, transform: `translateY(${(1 - texto) * 8}px)`, display: "flex", alignItems: "center", gap: 8 }}>
          Ingresar
          <span style={{ display: "grid", transform: `translateX(${(1 - texto) * -10}px)` }}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" width={20} height={20}>
              <path d="M5 12h14M13 6l6 6-6 6" />
            </svg>
          </span>
        </span>
      </div>
      {/* Punta brillante de la barra */}
      {carga > 0 && abre < 0.2 && (
        <div style={{ position: "absolute", left: `calc(${carga * 100}% - 6px)`, top: h / 2 - 6, width: 12, height: 12, borderRadius: "50%", background: "#fff", boxShadow: "0 0 16px 6px rgba(34,211,238,.9)", opacity: 1 - abre * 5 }} />
      )}
    </div>
  );
}
